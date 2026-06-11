"""Groq LLM API proxy — menggunakan model berbeda untuk tiap endpoint
agar tidak cepat kena rate limit free tier."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx, os, json
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# ── Model berbeda tiap endpoint → rate limit tidak cepat habis ──────
MODEL_TECHNICAL  = "llama-3.1-8b-instant"      # cepat, cocok untuk structured JSON
MODEL_NEWS       = "llama-3.3-70b-versatile"               # berbeda bucket rate limit
MODEL_FINAL_RECO = "llama-3.3-70b-versatile"   # paling capable, pakai seperlunya


def get_key(req_key: Optional[str]) -> str:
    key = req_key or os.getenv("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(400, "Groq API key tidak ditemukan. Isi di tombol 'Groq API Key' atau set GROQ_API_KEY di .env")
    return key


async def groq_chat(messages: list, api_key: str, model: str, max_tokens: int = 600) -> dict:
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
    """Model: llama-3.1-8b-instant — analisis teknikal → estimasi harga."""
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

Balas HANYA JSON valid ini tanpa teks lain:
{{"price_tomorrow":<angka>,"price_range_5d":{{"min":<angka>,"max":<angka>}},"recommendation":"BUY"|"SELL"|"HOLD","confidence":<0.0-1.0>,"reasons":["r1","r2","r3"],"summary":"<2 kalimat>"}}"""
    res  = await groq_chat([{"role":"user","content":prompt}], key, MODEL_TECHNICAL)
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
    res  = await groq_chat([{"role":"user","content":prompt}], key, MODEL_NEWS, max_tokens=400)
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
    prompt = f"""Kamu chief analyst saham Indonesia. Gabungkan semua sinyal untuk {req.ticker}.

HARGA: Rp {req.current_price:,.0f}
SINYAL ML: {ml.get('recommendation','?')} conf {round(ml.get('confidence',0)*100)}% target {ml_t}
SINYAL GROQ TEKNIKAL: {gt.get('recommendation','?')} conf {round(gt.get('confidence',0)*100)}% estimasi {gt.get('price_tomorrow','?')}
SINYAL BERITA: {gn.get('news_recommendation','?')} conf {round(gn.get('news_confidence',0)*100)}% skor sentimen {s.get('score',50)}/100

Balas HANYA JSON valid ini tanpa teks lain:
{{"final_recommendation":"BUY"|"SELL"|"HOLD","overall_confidence":<0.0-1.0>,"signal_agreement":"Sepakat"|"Mayoritas"|"Bertentangan","entry_price":<angka>,"stop_loss":<angka>,"take_profit_1":<angka>,"take_profit_2":<angka>,"risk_reward_ratio":<angka>,"summary":"<2 kalimat>"}}"""
    res  = await groq_chat([{"role":"user","content":prompt}], key, MODEL_FINAL_RECO, max_tokens=400)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, **data}
