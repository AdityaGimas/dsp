"""
news.py — Scraping berita saham via RSS feeds Indonesian finance sites.
Pipeline:
  1. Fetch RSS feeds (CNBC Indonesia, Stockwatch, Bisnis.com, dll)
  2. Filter artikel berdasarkan ticker/keyword
  3. Extract full content via trafilatura → newspaper3k → selenium (fallback)
  4. Classify category (market / macro / geopolitics)
"""
from fastapi import APIRouter, Query
import asyncio
import json
import re
from datetime import datetime, timezone
import threading

router = APIRouter()

# ─── RSS Feed config ──────────────────────────────────────────────────────────
RSS_FEEDS = [
    # (url, category_hint)  — category_hint membantu klasifikasi awal
    ("https://www.cnbcindonesia.com/market/rss",       "market"),
    ("https://www.cnbcindonesia.com/news/rss",         "macro"),
    ("https://www.cnbcindonesia.com/investment/rss",   "market"),
    ("https://stockwatch.id/feed",                     "market"),
    ("https://rss.bisnis.com/",                        "market"),
    ("https://rss.tempo.co/bisnis",                    "macro"),
    ("https://www.idxchannel.com/rss",                 "market"),
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

# ─── Kata kunci kategori ──────────────────────────────────────────────────────
KEYWORDS = {
    "market":     ["saham", "emiten", "IHSG", "bursa", "dividen", "IPO", "rights issue"],
    "macro":      ["inflasi", "suku bunga", "BI Rate", "PDB", "GDP", "rupiah", "ekonomi", "fiskal"],
    "geopolitics":["geopolitik", "global", "perang", "tarif impor", "ekspor", "impor", "asing", "FDI"],
}

BAD_PATHS = ["/tag/", "/tags/", "/topic/", "/author/", "/kategori/", "/label/", "/page/"]

# ─── Helpers ─────────────────────────────────────────────────────────────────
def clean_text(text: str) -> str:
    if not text: return ""
    text = re.sub(r"http\S+", " ", text)
    text = re.sub(r"\S+@\S+",  " ", text)
    text = re.sub(r"\s+",      " ", text)
    return text.strip()

def is_bad_url(url: str) -> bool:
    return any(p in url.lower() for p in BAD_PATHS)

def categorize(text: str, title: str = "", hint: str = "market") -> str:
    combined = (title + " " + text).lower()
    scores = {cat: sum(combined.count(w.lower()) for w in kws) for cat, kws in KEYWORDS.items()}
    best_cat, best_score = max(scores.items(), key=lambda x: x[1])
    return best_cat if best_score >= 1 else hint

# ─── RSS fetcher ─────────────────────────────────────────────────────────────
# Map ticker code to known company names/aliases
TICKER_ALIASES = {
    "BBCA": ["bbca", "bca", "bank central asia"],
    "BBRI": ["bbri", "bri", "bank rakyat"],
    "BMRI": ["bmri", "mandiri", "bank mandiri"],
    "BBNI": ["bbni", "bni", "bank negara"],
    "TLKM": ["tlkm", "telkom", "telkomsel"],
    "ASII": ["asii", "astra"],
    "UNVR": ["unvr", "unilever"],
    "ICBP": ["icbp", "indofood"],
    "GOTO": ["goto", "gojek", "tokopedia"],
    "BREN": ["bren", "barito renewables"],
}

FINANCE_KEYWORDS = ["saham", "emiten", "bursa", "ihsg", "investasi", "pasar modal",
                     "ekonomi", "inflasi", "bank", "perbankan", "dividen", "ipo",
                     "rupiah", "suku bunga", "obligasi", "reksa dana"]

def get_keywords_for(ticker: str) -> list:
    """Return list of search terms to match in RSS articles."""
    base    = [ticker.lower()]
    aliases = TICKER_ALIASES.get(ticker.upper(), [])
    return base + aliases

def fetch_rss(feed_url: str, category_hint: str, keyword: str, days: int = 30) -> list:
    """Ambil artikel dari RSS yang mengandung keyword atau alias-nya, maks `days` hari ke belakang."""
    try:
        import requests
        import feedparser
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        r = requests.get(feed_url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return []
        feed = feedparser.parse(r.content)
        results      = []
        search_terms = get_keywords_for(keyword)

        for entry in feed.entries:
            title   = entry.get("title",   "")
            link    = entry.get("link",    "")
            summary = entry.get("summary", "")
            combined = (title + " " + summary).lower()

            # Accept: artikel tentang ticker/alias ATAU berita keuangan umum
            has_ticker  = any(t in combined for t in search_terms)
            has_finance = any(k in combined for k in FINANCE_KEYWORDS)
            if not (has_ticker or has_finance):
                continue
            if not link or is_bad_url(link):
                continue

            # Parse date & filter 30 hari
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            try:
                dt       = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                if dt < cutoff:
                    continue        # terlalu lama, skip
                date_str = dt.strftime("%Y-%m-%d")
            except Exception:
                pass  # tanpa tanggal tetap diambil

            results.append({
                "title":         title,
                "url":           link,
                "summary":       clean_text(re.sub(r"<[^>]+>", " ", summary)),
                "date":          date_str,
                "source":        feed_url.split("/")[2].replace("www.", ""),
                "category_hint": category_hint,
                "has_ticker":    has_ticker,   # untuk sorting prioritas
            })
        return results
    except Exception as e:
        print(f"RSS Error ({feed_url}): {e}")
        return []

def fetch_all_rss(keyword: str, days: int = 30) -> list:
    """Ambil dari semua RSS feeds secara paralel via threading."""
    results = []
    lock    = threading.Lock()

    def worker(feed_url, hint):
        items = fetch_rss(feed_url, hint, keyword, days)
        with lock:
            results.extend(items)

    threads = [threading.Thread(target=worker, args=(url, hint)) for url, hint in RSS_FEEDS]
    for t in threads: t.start()
    for t in threads: t.join(timeout=15)

    # Prioritaskan artikel yang menyebut ticker secara langsung
    results.sort(key=lambda x: (0 if x.get("has_ticker") else 1, x["date"]), reverse=False)
    return results

# ─── Article content extractor ────────────────────────────────────────────────
def extract_content(url: str) -> dict | None:
    """
    Ekstrak konten artikel lengkap.
    Urutan: trafilatura → newspaper3k → Selenium (fallback berat).
    """
    title = text = date = ""

    # Layer 1: trafilatura (ringan, cepat)
    try:
        import trafilatura
        dl = trafilatura.fetch_url(url)
        if dl:
            meta = trafilatura.extract(dl, output_format="json", with_metadata=True, include_comments=False)
            if meta:
                d = json.loads(meta)
                title = d.get("title", "")
                text  = d.get("text",  "")
                date  = d.get("date",  "")
    except Exception:
        pass

    # Layer 2: newspaper3k
    if len(text) < 300:
        try:
            from newspaper import Article
            art = Article(url)
            art.download(); art.parse()
            title = title or art.title
            text  = art.text or text
            date  = date or (str(art.publish_date) if art.publish_date else "")
        except Exception:
            pass

    # Layer 3: Selenium (hanya jika benar-benar perlu)
    if len(text) < 300:
        text = _selenium_fallback(url) or text

    text = clean_text(text)
    return {"title": title, "text": text, "date": date} if len(text) >= 100 else None

_selenium_sem = threading.Semaphore(1)   # hanya 1 Chrome sekaligus

def _selenium_fallback(url: str) -> str:
    with _selenium_sem:
        try:
            from selenium import webdriver
            from selenium.webdriver.common.by import By
            opts = webdriver.ChromeOptions()
            opts.add_argument("--headless")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
            opts.add_argument("user-agent=Mozilla/5.0")
            opts.page_load_strategy = "eager"
            drv = webdriver.Chrome(options=opts)
            drv.set_page_load_timeout(10)
            try:
                drv.get(url)
                import time; time.sleep(2)
            except Exception:
                pass
            body = drv.find_element(By.TAG_NAME, "body").text
            drv.quit()
            return body
        except Exception:
            return ""

# ─── Process single article ──────────────────────────────────────────────────
def process_article(item: dict, keyword: str) -> dict | None:
    """
    Dari item RSS dict, ekstrak konten penuh lalu kembalikan artikel final.
    Jika konten tidak bisa diambil, gunakan summary dari RSS.
    """
    url   = item["url"]
    title = item["title"]
    date  = item["date"]

    # Coba extract full content
    content_data = None
    try:
        content_data = extract_content(url)
    except Exception:
        pass

    if content_data:
        title = content_data["title"] or title
        text  = content_data["text"]
        date  = content_data["date"] or date
    else:
        # fallback: gunakan summary dari RSS agar setidaknya ada teks
        text  = item.get("summary", "")

    # Kategori berdasarkan konten
    category = categorize(text, title, item.get("category_hint", "market"))

    # Source domain
    try:
        source = url.split("/")[2].replace("www.", "")
    except Exception:
        source = item.get("source", "Unknown")

    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    return {
        "title":    title,
        "content":  text[:2000],
        "category": category,
        "source":   source,
        "url":      url,
        "time":     date[:10],
    }

# ─── Async wrapper ────────────────────────────────────────────────────────────
_proc_sem = asyncio.Semaphore(5)

async def async_process_article(item: dict, keyword: str):
    async with _proc_sem:
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, process_article, item, keyword),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            # Fallback: gunakan data dari RSS saja (tanpa full scraping)
            return {
                "title":    item["title"],
                "content":  item.get("summary", ""),
                "category": item.get("category_hint", "market"),
                "source":   item.get("source", "Unknown"),
                "url":      item["url"],
                "time":     item.get("date", ""),
            }

# ─── Endpoint ─────────────────────────────────────────────────────────────────
@router.get("/{ticker}")
async def get_news(ticker: str, per_source: int = Query(default=50, ge=1, le=100)):
    code = ticker.replace(".JK", "")

    # 1. Ambil daftar artikel dari RSS (30 hari ke belakang)
    loop  = asyncio.get_event_loop()
    items = await loop.run_in_executor(None, fetch_all_rss, code, 30)

    # 2. Dedup URL
    seen_urls, unique_items = set(), []
    for it in items:
        if it["url"] not in seen_urls:
            seen_urls.add(it["url"])
            unique_items.append(it)

    # 3. Ambil lebih banyak untuk scraping, lalu batasi
    unique_items = unique_items[:per_source * 3]

    # 4. Extract konten paralel
    tasks     = [async_process_article(it, code) for it in unique_items]
    processed = await asyncio.gather(*tasks)
    articles  = [p for p in processed if p is not None]

    # 5. Sort: artikel yang menyebut ticker di atas, lalu dedup judul
    articles.sort(key=lambda a: 0 if code.lower() in (a.get("title","") + a.get("content","")).lower() else 1)

    seen_titles, unique_articles = set(), []
    for a in articles:
        key = a["title"][:60].lower().strip()
        if key and key not in seen_titles:
            seen_titles.add(key)
            unique_articles.append(a)

    return {
        "ticker":   ticker,
        "code":     code,
        "total":    len(unique_articles),
        "articles": unique_articles[:per_source],
    }
