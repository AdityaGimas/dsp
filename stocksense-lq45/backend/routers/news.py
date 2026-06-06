from fastapi import APIRouter, Query
import httpx
import xml.etree.ElementTree as ET
from urllib.parse import quote
from datetime import datetime, timezone
import asyncio

router = APIRouter()

def format_rss_date(pub_date: str) -> str:
    """Ubah tanggal RSS menjadi format relatif."""
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub_date)
        now = datetime.now(timezone.utc)
        diff_h = int((now - dt).total_seconds() / 3600)
        if diff_h < 1:   return "Baru saja"
        if diff_h < 24:  return f"{diff_h} jam lalu"
        return f"{diff_h // 24} hari lalu"
    except Exception:
        return pub_date[:16] if pub_date else ""

async def fetch_google_news(query: str, n: int = 10) -> list:
    """Google News RSS — paling reliable, tidak diblokir."""
    encoded = quote(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=id&gl=ID&ceid=ID:id"
    articles = []
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (RSS Reader)"})
            root = ET.fromstring(r.content)
            channel = root.find("channel")
            if channel is None:
                return articles
            for item in channel.findall("item")[:n]:
                title_raw = (item.findtext("title") or "").strip()
                link      = (item.findtext("link")  or "").strip()
                pub_date  = (item.findtext("pubDate") or "").strip()

                # Source ada di tag <source>
                src_el  = item.find("source")
                source  = src_el.text.strip() if src_el is not None and src_el.text else "Google News"

                # Google kadang append " - SourceName" di akhir judul
                title = title_raw
                if f" - {source}" in title_raw:
                    title = title_raw.replace(f" - {source}", "").strip()

                if title:
                    articles.append({
                        "title":   title,
                        "url":     link,
                        "source":  source,
                        "time":    format_rss_date(pub_date),
                        "content": ""
                    })
    except Exception as e:
        print(f"[News] Google RSS error: {e}")
    return articles

async def fetch_detik_rss(code: str, n: int = 5) -> list:
    """Detik Finance RSS feed — filter berdasarkan kode saham."""
    url = "https://finance.detik.com/feed/"
    articles = []
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (RSS Reader)"})
            root = ET.fromstring(r.content)
            channel = root.find("channel")
            if channel is None:
                return articles
            code_low = code.lower()
            for item in channel.findall("item"):
                title    = (item.findtext("title") or "").strip()
                link     = (item.findtext("link")  or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()
                if code_low in title.lower() or code_low in (item.findtext("description") or "").lower():
                    articles.append({
                        "title":   title,
                        "url":     link,
                        "source":  "Detik Finance",
                        "time":    format_rss_date(pub_date),
                        "content": ""
                    })
                    if len(articles) >= n:
                        break
    except Exception as e:
        print(f"[News] Detik RSS error: {e}")
    return articles

async def fetch_kontan_rss(code: str, n: int = 5) -> list:
    """Kontan RSS feed."""
    url = "https://www.kontan.co.id/rss/investasi.rss"
    articles = []
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (RSS Reader)"})
            root = ET.fromstring(r.content)
            channel = root.find("channel")
            if channel is None:
                return articles
            code_low = code.lower()
            for item in channel.findall("item"):
                title    = (item.findtext("title") or "").strip()
                link     = (item.findtext("link")  or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()
                if code_low in title.lower():
                    articles.append({
                        "title":   title,
                        "url":     link,
                        "source":  "Kontan",
                        "time":    format_rss_date(pub_date),
                        "content": ""
                    })
                    if len(articles) >= n:
                        break
    except Exception as e:
        print(f"[News] Kontan RSS error: {e}")
    return articles

@router.get("/{ticker}")
async def get_news(ticker: str, per_source: int = Query(default=8, ge=1, le=20)):
    """
    Ambil berita terkini via RSS dari Google News, Detik Finance, dan Kontan.
    Tidak ada scraping HTML → tidak ada masalah anti-bot.
    """
    code = ticker.replace(".JK", "")

    # Dua query berbeda ke Google News + Detik + Kontan secara paralel
    results = await asyncio.gather(
        fetch_google_news(f"{code} saham IDX Indonesia", per_source),
        fetch_google_news(f"saham {code} bursa efek", per_source // 2),
        fetch_detik_rss(code, per_source // 2),
        fetch_kontan_rss(code, per_source // 2),
        return_exceptions=True
    )

    articles = []
    for r in results:
        if isinstance(r, list):
            articles.extend(r)

    # Deduplicate by title prefix (60 char)
    seen, unique = set(), []
    for a in articles:
        key = a["title"][:60].lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(a)

    return {
        "ticker":   ticker,
        "code":     code,
        "total":    len(unique),
        "articles": unique[:per_source * 2]
    }
