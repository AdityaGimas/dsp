"""Groq LLM API proxy — menggunakan model berbeda untuk tiap endpoint
agar tidak cepat kena rate limit free tier."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx, os, json, threading
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# ── Model berbeda tiap endpoint → rate limit tidak cepat habis ──────
MODEL_TECHNICAL  = "llama-3.1-8b-instant"      # cepat, cocok untuk structured JSON
MODEL_NEWS       = "llama-3.3-70b-versatile"               # berbeda bucket rate limit
MODEL_FINAL_RECO = "llama-3.3-70b-versatile"   # paling capable, pakai seperlunya


# ── Pool API key + rotasi (round-robin) + fallback otomatis ─────────
# Sumber key digabung dengan urutan: list koma → bernomor → tunggal.
#   GROQ_API_KEYS  = "gsk_a,gsk_b,gsk_c"          (dipisah koma)
#   GROQ_API_KEY_1 = gsk_a / GROQ_API_KEY_2 = ... (bernomor)
#   GROQ_API_KEY   = gsk_a                        (tunggal, kompatibel lama)
def get_key_pool() -> list:
    keys = []
    multi = os.getenv("GROQ_API_KEYS", "")
    if multi:
        keys += [k.strip() for k in multi.split(",")]
    i = 1
    while True:
        k = os.getenv(f"GROQ_API_KEY_{i}", "").strip()
        if not k:
            break
        keys.append(k)
        i += 1
    single = os.getenv("GROQ_API_KEY", "").strip()
    if single:
        keys.append(single)
    # dedupe sambil pertahankan urutan
    seen, out = set(), []
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


_rr_lock = threading.Lock()
_rr_index = 0


def _next_start(n: int) -> int:
    """Round-robin: tiap pemanggilan dimulai dari key giliran berikutnya."""
    global _rr_index
    with _rr_lock:
        idx = _rr_index % n
        _rr_index = (_rr_index + 1) % n
    return idx


def get_key(req_key: Optional[str]) -> str:
    """Kompatibilitas lama: 1 key (req override, atau key pertama dari pool)."""
    if req_key:
        return req_key
    pool = get_key_pool()
    if not pool:
        raise HTTPException(400, "Groq API key tidak ditemukan. Set GROQ_API_KEY atau GROQ_API_KEYS di .env, atau isi via tombol 'Groq API Key'.")
    return pool[0]


# Status code yang berarti "coba key lain" (limit / key bermasalah / server).
_ROTATE_CODES = {429, 401, 403, 408, 500, 502, 503, 504}


async def groq_chat_rotate(messages: list, model: str, max_tokens: int = 700, api_key: Optional[str] = None) -> dict:
    """
    Panggil Groq dengan rotasi key. Bila req mengirim api_key eksplisit, pakai
    key itu saja. Selain itu pakai seluruh pool: mulai dari key giliran
    berikutnya (round-robin); bila kena 429/limit otomatis lanjut ke key lain.
    Error hanya dilempar bila SEMUA key gagal.
    """
    pool = [api_key.strip()] if api_key else get_key_pool()
    if not pool:
        raise HTTPException(400, "Groq API key tidak ditemukan. Set GROQ_API_KEY atau GROQ_API_KEYS di .env, atau isi via tombol 'Groq API Key'.")
    n = len(pool)
    start = _next_start(n)
    last_detail = ""
    for offset in range(n):
        key = pool[(start + offset) % n]
        try:
            return await groq_chat(messages, key, model, max_tokens)
        except HTTPException as e:
            last_detail = str(e.detail)
            if e.status_code in _ROTATE_CODES:
                continue          # key ini limit/bermasalah → coba key berikutnya
            raise                 # error lain (mis. 400 prompt) → langsung lempar
    raise HTTPException(429, f"Semua {n} Groq API key kena limit atau gagal. Terakhir: {last_detail[:200]}")


async def groq_chat(messages: list, api_key: str, model: str, max_tokens: int = 700) -> dict:
    async with httpx.AsyncClient(timeout=40) as c:
        r = await c.post(GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}
        )
        if not r.is_success:
            raise HTTPException(r.status_code, f"Groq API error: {r.text[:300]}")
        return r.json()


def parse_json(text: str) -> dict:
    clean = text.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(clean)


# ── 1. TEKNIKAL ──────────────────────────────────────
class TechReq(BaseModel):
    ticker: str
    current_price: float
    indicators: dict
    ml_prediction: Optional[dict] = None
    api_key: Optional[str] = None


@router.post("/technical")
async def groq_technical(req: TechReq):
    """Model: llama-3.1-8b-instant — analisis teknikal → estimasi harga 3 hari."""
    key = get_key(req.api_key)
    ind = req.indicators
    ml  = req.ml_prediction or {}
    prompt = f"""Kamu adalah analis teknikal saham Indonesia. Analisis data teknikal saham {req.ticker} berikut.

HARGA SAAT INI: Rp {req.current_price:,.0f}
- RSI(14): {ind.get('rsi',{}).get('value','?')} — {ind.get('rsi',{}).get('signal','?')}
- MACD: {ind.get('macd',{}).get('value','?')} Hist: {ind.get('macd',{}).get('histogram','?')} — {ind.get('macd',{}).get('signal','?')}
- MA20/MA50: {"Golden Cross" if ind.get('moving_average',{}).get('golden_cross') else "Death Cross"}
- Bollinger: {ind.get('bollinger_bands',{}).get('position','?')}
- Stochastic: {ind.get('stochastic',{}).get('value','?')} — {ind.get('stochastic',{}).get('signal','?')}
- Volume Ratio: {ind.get('volume_ratio',{}).get('value','?')}x
- Referensi ML: {ml.get('recommendation','?')} conf {round(ml.get('confidence',0)*100)}%

Beri prediksi 3 hari ke depan DENGAN RENTANG HARGA (bukan nilai pas). Sertakan low dan high realistis berdasarkan volatilitas.
Balas HANYA JSON valid ini tanpa teks lain (ganti semua angka dengan estimasi nyata dalam Rupiah):
{{"price_tomorrow": 5100, "price_tomorrow_low": 4950, "price_tomorrow_high": 5250,
  "day2_price": 5150, "day2_low": 4900, "day2_high": 5400,
  "day3_price": 5200, "day3_low": 4850, "day3_high": 5550,
  "price_range_3d": {{"min": 4850, "max": 5550}},
  "recommendation": "BUY",
  "confidence": 0.82,
  "reasons": ["r1","r2","r3"],
  "summary": "<2 kalimat>"}}"""
    res  = await groq_chat_rotate([{"role":"user","content":prompt}], MODEL_TECHNICAL, max_tokens=700, api_key=req.api_key)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "source": "groq_technical", **data}


# ── 2. RINGKASAN BERITA ────────────────────────────────
class NewsReq(BaseModel):
    ticker: str
    articles: List[dict]
    sentiment_summary: dict
    api_key: Optional[str] = None


@router.post("/news-summary")
async def groq_news_summary(req: NewsReq):
    """Model: llama-3.3-70b-versatile — ringkas berita + insight."""
    key = get_key(req.api_key)
    s   = req.sentiment_summary
    txt = "\n".join(f"- [{a.get('source','')}] {a.get('title','')}" for a in req.articles[:10])
    prompt = f"""Kamu analis pasar modal Indonesia. Buat ringkasan berita saham {req.ticker}.

BERITA ({len(req.articles)} artikel):
{txt}

SENTIMEN: Positif {s.get('positive_pct',0)}% | Netral {s.get('neutral_pct',0)}% | Negatif {s.get('negative_pct',0)}%

Balas HANYA JSON valid ini tanpa teks lain:
{{"main_theme":"<1 kalimat>","summary":"<2-3 kalimat>","sentiment_direction":"Bullish"|"Bearish"|"Netral","key_factors":["f1","f2","f3"],"news_recommendation":"BUY"|"SELL"|"HOLD","news_confidence":<0.0-1.0>}}"""
    res  = await groq_chat_rotate([{"role":"user","content":prompt}], MODEL_NEWS, max_tokens=400, api_key=req.api_key)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "source": "groq_news", **data}


# ── 3. REKOMENDASI AKHIR ───────────────────────────────
class FinalReq(BaseModel):
    ticker: str
    current_price: float
    ml_prediction: Optional[dict] = None
    groq_technical: Optional[dict] = None
    sentiment_summary: Optional[dict] = None
    groq_news: Optional[dict] = None
    macro_data: Optional[dict] = None
    api_key: Optional[str] = None


@router.post("/final-recommendation")
async def final_recommendation(req: FinalReq):
    """Model: llama-3.3-70b-versatile — gabung semua sinyal → Entry/SL/TP."""
    key  = get_key(req.api_key)
    ml   = req.ml_prediction  or {}
    gt   = req.groq_technical or {}
    s    = req.sentiment_summary or {}
    gn   = req.groq_news      or {}
    ml_t = (ml.get("predictions") or [{}])[0].get("price","?")
    macro = req.macro_data or {}
    
    macro_str = ""
    if macro:
        ihsg = macro.get("IHSG", {}).get("value", "?")
        usd = macro.get("USDIDR", {}).get("value", "?")
        bi = macro.get("BIRate", {}).get("value", "?")
        macro_str = f"KONDISI MAKRO: IHSG {ihsg} | USD/IDR {usd} | BI Rate {bi}%"

    prompt = f"""Kamu chief analyst saham Indonesia. Gabungkan semua sinyal untuk {req.ticker}.

HARGA: Rp {req.current_price:,.0f}
{macro_str}
SINYAL ML: {ml.get('recommendation','?')} conf {round(ml.get('confidence',0)*100)}% target {ml_t}
SINYAL GROQ TEKNIKAL: {gt.get('recommendation','?')} conf {round(gt.get('confidence',0)*100)}% estimasi {gt.get('price_tomorrow','?')}
SINYAL BERITA: {gn.get('news_recommendation','?')} conf {round(gn.get('news_confidence',0)*100)}% skor sentimen {s.get('score',50)}/100

Balas HANYA JSON valid ini tanpa teks lain (ganti angka-angka dengan nilai nyatanya, bukan string):
{{"final_recommendation":"BUY"|"SELL"|"HOLD","overall_confidence":0.85,"signal_agreement":"Sepakat"|"Mayoritas"|"Bertentangan","entry_price": 5000,"stop_loss": 4800,"take_profit_1": 5300,"take_profit_2": 5500,"risk_reward_ratio": 2.5,"summary":"<2 kalimat>"}}"""
    res  = await groq_chat_rotate([{"role":"user","content":prompt}], MODEL_FINAL_RECO, max_tokens=400, api_key=req.api_key)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, **data}
