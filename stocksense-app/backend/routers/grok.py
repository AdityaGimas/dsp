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

# Model berbeda tiap endpoint -> rate limit tidak cepat habis
MODEL_TECHNICAL  = "llama-3.1-8b-instant"
MODEL_NEWS       = "llama-3.3-70b-versatile"
MODEL_FINAL_RECO = "llama-3.3-70b-versatile"


# Pool API key + rotasi (round-robin) + fallback otomatis.
# Sumber key digabung urutan: list koma -> bernomor -> tunggal.
#   GROQ_API_KEYS  = "gsk_a,gsk_b,gsk_c"
#   GROQ_API_KEY_1 = gsk_a / GROQ_API_KEY_2 = ...
#   GROQ_API_KEY   = gsk_a   (kompatibel lama)
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


_ROTATE_CODES = {429, 401, 403, 408, 500, 502, 503, 504}


async def groq_chat_rotate(messages: list, model: str, max_tokens: int = 700, api_key: Optional[str] = None, json_mode: bool = False) -> dict:
    """Panggil Groq dengan rotasi key + fallback bila kena limit. Error hanya
    dilempar bila SEMUA key gagal."""
    pool = [api_key.strip()] if api_key else get_key_pool()
    if not pool:
        raise HTTPException(400, "Groq API key tidak ditemukan. Set GROQ_API_KEY atau GROQ_API_KEYS di .env, atau isi via tombol 'Groq API Key'.")
    n = len(pool)
    start = _next_start(n)
    last_detail = ""
    for offset in range(n):
        key = pool[(start + offset) % n]
        try:
            return await groq_chat(messages, key, model, max_tokens, json_mode=json_mode)
        except HTTPException as e:
            last_detail = str(e.detail)
            if e.status_code in _ROTATE_CODES:
                continue
            raise
    raise HTTPException(429, f"Semua {n} Groq API key kena limit atau gagal. Terakhir: {last_detail[:200]}")


async def groq_chat(messages: list, api_key: str, model: str, max_tokens: int = 700, json_mode: bool = False) -> dict:
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}
    if json_mode:
        # Paksa Groq mengembalikan JSON valid (JSON mode, OpenAI-compatible).
        payload["response_format"] = {"type": "json_object"}
    async with httpx.AsyncClient(timeout=40) as c:
        r = await c.post(GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload
        )
        if not r.is_success:
            raise HTTPException(r.status_code, f"Groq API error: {r.text[:300]}")
        return r.json()


def parse_json(text: str) -> dict:
    clean = text.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Ambil objek JSON pertama..terakhir bila ada teks tambahan di sekitarnya.
        start, end = clean.find("{"), clean.rfind("}")
        if start != -1 and end > start:
            return json.loads(clean[start:end + 1])
        raise


# Skema output (string biasa, BUKAN contoh angka) -> model wajib mengganti
# tiap placeholder <...> dengan nilai hasil analisis nyata, lalu balas JSON.
TECH_SCHEMA = (
    '{"price_tomorrow": <angka Rupiah>, "price_tomorrow_low": <angka>, "price_tomorrow_high": <angka>, '
    '"day2_price": <angka>, "day2_low": <angka>, "day2_high": <angka>, '
    '"day3_price": <angka>, "day3_low": <angka>, "day3_high": <angka>, '
    '"price_range_3d": {"min": <angka>, "max": <angka>}, '
    '"recommendation": "BUY|SELL|HOLD", "confidence": <0.0-1.0>, '
    '"reasons": ["alasan singkat 1", "alasan 2", "alasan 3"], '
    '"summary": "<2 kalimat: arah harga + alasan utama>"}'
)

NEWS_SCHEMA = (
    '{"main_theme": "<1 kalimat tema utama>", "summary": "<2-3 kalimat>", '
    '"sentiment_direction": "Bullish|Bearish|Netral", '
    '"key_factors": ["faktor 1", "faktor 2", "faktor 3"], '
    '"news_recommendation": "BUY|SELL|HOLD", "news_confidence": <0.0-1.0>}'
)

FINAL_SCHEMA = (
    '{"final_recommendation": "BUY|SELL|HOLD", "overall_confidence": <0.0-1.0>, '
    '"signal_agreement": "Sepakat|Mayoritas|Bertentangan", '
    '"entry_price": <angka>, "stop_loss": <angka>, '
    '"take_profit_1": <angka>, "take_profit_2": <angka>, '
    '"risk_reward_ratio": <angka>, "summary": "<2 kalimat>"}'
)


# 1. TEKNIKAL
class TechReq(BaseModel):
    ticker: str
    current_price: float
    indicators: dict
    ml_prediction: Optional[dict] = None
    api_key: Optional[str] = None


@router.post("/technical")
async def groq_technical(req: TechReq):
    """Model: llama-3.1-8b-instant - analisis teknikal -> estimasi harga 3 hari."""
    ind = req.indicators
    ml  = req.ml_prediction or {}
    ma  = ind.get('moving_average', {})
    ma_txt = "Golden Cross (MA20>MA50)" if ma.get('golden_cross') else "Death Cross (MA20<MA50)"
    prompt = f"""Kamu analis teknikal saham Indonesia. Analisis data teknikal saham {req.ticker} secara objektif.

HARGA SAAT INI: Rp {req.current_price:,.0f}
- RSI(14): {ind.get('rsi', {}).get('value', '?')} - {ind.get('rsi', {}).get('signal', '?')}
- MACD: {ind.get('macd', {}).get('value', '?')} Hist: {ind.get('macd', {}).get('histogram', '?')} - {ind.get('macd', {}).get('signal', '?')}
- MA20/MA50: {ma_txt}
- Bollinger: {ind.get('bollinger_bands', {}).get('position', '?')}
- Stochastic: {ind.get('stochastic', {}).get('value', '?')} - {ind.get('stochastic', {}).get('signal', '?')}
- Volume Ratio: {ind.get('volume_ratio', {}).get('value', '?')}x
- Referensi model ML: {ml.get('recommendation', '?')} (conf {round(ml.get('confidence', 0) * 100)}%)

ATURAN WAJIB (ikuti dengan ketat):
1. Hitung estimasi harga 3 hari ke depan dari DATA NYATA di atas. Sertakan rentang low-high realistis sesuai volatilitas. JANGAN menyalin angka contoh apa pun.
2. Tentukan arah: bandingkan day3_price terhadap harga sekarang (Rp {req.current_price:,.0f}).
3. "recommendation" HARUS konsisten dengan arah itu:
   - day3_price > +1.5% dari harga sekarang  -> "BUY"
   - day3_price < -1.5% dari harga sekarang  -> "SELL"
   - selain itu (relatif datar)              -> "HOLD"
   DILARANG memberi "BUY" bila harga diprediksi turun, atau "SELL" bila diprediksi naik.
4. "confidence" (0.0-1.0) mencerminkan seberapa kuat & sepakat indikator; turunkan bila sinyal bertentangan.

Balas HANYA JSON valid berikut tanpa teks lain. Ganti SETIAP placeholder <...> dengan hasil analisismu (angka Rupiah, bukan contoh):
""" + TECH_SCHEMA
    res  = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_TECHNICAL, max_tokens=700, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "source": "groq_technical", **data}


# 2. RINGKASAN BERITA
class NewsReq(BaseModel):
    ticker: str
    articles: List[dict]
    sentiment_summary: dict
    api_key: Optional[str] = None


@router.post("/news-summary")
async def groq_news_summary(req: NewsReq):
    """Model: llama-3.3-70b-versatile - ringkas berita + insight."""
    s   = req.sentiment_summary
    txt = "\n".join(f"- [{a.get('source', '')}] {a.get('title', '')}" for a in req.articles[:10])
    prompt = f"""Kamu analis pasar modal Indonesia. Ringkas berita saham {req.ticker} secara objektif.

BERITA ({len(req.articles)} artikel):
{txt}

SENTIMEN TERUKUR: Positif {s.get('positive_pct', 0)}% | Netral {s.get('neutral_pct', 0)}% | Negatif {s.get('negative_pct', 0)}%

ATURAN:
1. "sentiment_direction" & "news_recommendation" HARUS konsisten dengan komposisi sentimen di atas dan isi berita:
   - mayoritas Positif -> cenderung "Bullish" / "BUY"
   - mayoritas Negatif -> cenderung "Bearish" / "SELL"
   - campuran/seimbang -> "Netral" / "HOLD"
2. Jangan mengarang berita yang tidak ada di daftar.

Balas HANYA JSON valid berikut tanpa teks lain (ganti tiap placeholder <...> dengan nilai nyata):
""" + NEWS_SCHEMA
    res  = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_NEWS, max_tokens=400, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "source": "groq_news", **data}


# 3. REKOMENDASI AKHIR
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
    """Model: llama-3.3-70b-versatile - gabung semua sinyal -> Entry/SL/TP."""
    ml   = req.ml_prediction  or {}
    gt   = req.groq_technical or {}
    s    = req.sentiment_summary or {}
    gn   = req.groq_news      or {}
    ml_t = (ml.get("predictions") or [{}])[0].get("price", "?")
    macro = req.macro_data or {}

    macro_str = ""
    if macro:
        ihsg = macro.get("IHSG", {}).get("value", "?")
        usd = macro.get("USDIDR", {}).get("value", "?")
        bi = macro.get("BIRate", {}).get("value", "?")
        macro_str = f"KONDISI MAKRO: IHSG {ihsg} | USD/IDR {usd} | BI Rate {bi}%"

    prompt = f"""Kamu chief analyst saham Indonesia. Gabungkan semua sinyal untuk {req.ticker} secara objektif.

HARGA SEKARANG: Rp {req.current_price:,.0f}
{macro_str}
SINYAL ML: {ml.get('recommendation', '?')} conf {round(ml.get('confidence', 0) * 100)}% target {ml_t}
SINYAL GROQ TEKNIKAL: {gt.get('recommendation', '?')} conf {round(gt.get('confidence', 0) * 100)}% estimasi {gt.get('price_tomorrow', '?')}
SINYAL BERITA: {gn.get('news_recommendation', '?')} conf {round(gn.get('news_confidence', 0) * 100)}% skor sentimen {s.get('score', 50)}/100

ATURAN WAJIB:
1. Timbang semua sinyal. Mayoritas bullish -> condong "BUY"; mayoritas bearish -> condong "SELL"; bila saling bertentangan -> "HOLD" dan set "signal_agreement" = "Bertentangan".
2. "final_recommendation" HARUS konsisten dengan level harga:
   - "BUY"  : take_profit_1 & take_profit_2 DI ATAS entry_price, stop_loss DI BAWAH entry_price
   - "SELL" : take_profit_1 & take_profit_2 DI BAWAH entry_price, stop_loss DI ATAS entry_price
   - "HOLD" : level rapat di sekitar harga sekarang
3. "risk_reward_ratio" = jarak ke take_profit_1 dibagi jarak ke stop_loss, harus > 0.
4. Semua harga dalam Rupiah dan masuk akal terhadap harga sekarang.

Balas HANYA JSON valid berikut tanpa teks lain (ganti tiap placeholder <...> dengan angka nyata, bukan string):
""" + FINAL_SCHEMA
    res  = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_FINAL_RECO, max_tokens=400, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, **data}
