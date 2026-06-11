"""Scraper berita saham dari RSS feed situs finansial Indonesia.
Sumber: CNBC Indonesia, Bisnis.com, Detik Finance, Kontan, IDX Channel"""
import feedparser
import httpx
from bs4 import BeautifulSoup
from datetime import datetime, timezone
import re

# ─── RSS FEED SOURCES ────────────────────────────────
RSS_SOURCES = [
    {
        "name": "CNBC Indonesia",
        "url": "https://www.cnbcindonesia.com/rss",
        "category": "market"
    },
    {
        "name": "Bisnis.com",
        "url": "https://feeds.bisnis.com/bisnis-investasi",
        "category": "investasi"
    },
    {
        "name": "Detik Finance",
        "url": "https://finance.detik.com/rss",
        "category": "finance"
    },
    {
        "name": "Kontan",
        "url": "https://rss.kontan.co.id/market/",
        "category": "market"
    },
    {
        "name": "IDX Channel",
        "url": "https://www.idxchannel.com/rss",
        "category": "market"
    },
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
}


def _parse_date(entry) -> str:
    """Ambil tanggal publikasi dari entry RSS."""
    for field in ("published_parsed", "updated_parsed"):
        val = getattr(entry, field, None)
        if val:
            try:
                dt = datetime(*val[:6], tzinfo=timezone.utc)
                return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            except Exception:
                pass
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _clean_text(text: str) -> str:
    """Bersihkan HTML tags dan whitespace berlebih."""
    if not text:
        return ""
    text = BeautifulSoup(text, "html.parser").get_text()
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:500]


def _is_relevant(title: str, desc: str, ticker: str) -> bool:
    """Cek apakah berita relevan dengan ticker/saham yang dicari."""
    company_map = {
        "BBCA": ["bca", "bank central asia"],
        "BBRI": ["bri", "bank rakyat"],
        "BMRI": ["mandiri", "bank mandiri"],
        "TLKM": ["telkom", "telekomunikasi"],
        "ASII": ["astra", "astra international"],
        "GOTO": ["goto", "gojek", "tokopedia"],
        "BBNI": ["bni", "bank negara"],
        "UNVR": ["unilever"],
        "KLBF": ["kalbe", "kalbe farma"],
        "ANTM": ["antam", "aneka tambang"],
        "PTBA": ["bukit asam"],
        "ADRO": ["adaro"],
        "INDF": ["indofood"],
        "ICBP": ["indofood cbp"],
        "SMGR": ["semen indonesia"],
        "PGAS": ["perusahaan gas", "pgn"],
        "MEDC": ["medco"],
        "INCO": ["vale indonesia"],
        "MDKA": ["merdeka copper"],
    }
    text_lower = (title + " " + desc).lower()
    ticker_clean = ticker.replace(".JK", "").upper()
    # Cek nama ticker langsung
    if ticker_clean.lower() in text_lower:
        return True
    # Cek nama perusahaan
    for aliases in company_map.get(ticker_clean, []):
        if aliases.lower() in text_lower:
            return True
    # Berita pasar umum tetap relevan
    general_keywords = ["ihsg", "idx", "bursa", "saham", "lq45", "indeks", "pasar modal"]
    return any(kw in text_lower for kw in general_keywords)


async def scrape_news(ticker: str, max_articles: int = 15) -> list:
    """
    Scrape berita terkini yang relevan dengan ticker dari berbagai RSS feed.
    Return list of article dicts sorted by date (newest first).
    """
    articles = []
    async with httpx.AsyncClient(headers=HEADERS, timeout=10.0, follow_redirects=True) as client:
        for source in RSS_SOURCES:
            try:
                resp = await client.get(source["url"])
                if resp.status_code != 200:
                    continue
                feed = feedparser.parse(resp.text)
                for entry in feed.entries[:20]:
                    title = _clean_text(getattr(entry, "title", ""))
                    desc = _clean_text(getattr(entry, "summary", "") or getattr(entry, "description", ""))
                    link = getattr(entry, "link", "")
                    pub_date = _parse_date(entry)
                    if not title:
                        continue
                    if not _is_relevant(title, desc, ticker):
                        continue
                    articles.append({
                        "source": source["name"],
                        "title": title,
                        "description": desc,
                        "url": link,
                        "published_at": pub_date,
                        "sentiment": None,      # diisi oleh endpoint sentimen FastAPI kamu
                        "sentiment_score": None,
                    })
            except Exception as e:
                print(f"[scraper] Gagal scrape {source['name']}: {e}")
                continue
    # Sort terbaru dulu, deduplikasi judul
    seen_titles = set()
    unique = []
    for a in sorted(articles, key=lambda x: x["published_at"], reverse=True):
        title_key = a["title"][:60].lower()
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique.append(a)
    return unique[:max_articles]


# ─── FALLBACK: berita dummy jika semua sumber gagal ─────────────
def get_fallback_news(ticker: str) -> list:
    code = ticker.replace(".JK", "")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        {
            "source": "Placeholder",
            "title": f"{code} Mencatatkan Kinerja Positif di Kuartal Terbaru",
            "description": f"Saham {code} menunjukkan kinerja solid didukung fundamental yang kuat.",
            "url": "",
            "published_at": now,
            "sentiment": "positive",
            "sentiment_score": 0.72,
        },
        {
            "source": "Placeholder",
            "title": "IHSG Bergerak Mixed di Tengah Sentimen Global",
            "description": "Indeks Harga Saham Gabungan bergerak bervariasi mengikuti pergerakan bursa regional.",
            "url": "",
            "published_at": now,
            "sentiment": "neutral",
            "sentiment_score": 0.50,
        },
        {
            "source": "Placeholder",
            "title": "Analis Rekomendasikan Akumulasi Saham Sektor Perbankan",
            "description": "Kebijakan suku bunga BI yang stabil menjadi katalis positif bagi emiten perbankan.",
            "url": "",
            "published_at": now,
            "sentiment": "positive",
            "sentiment_score": 0.68,
        },
    ]
