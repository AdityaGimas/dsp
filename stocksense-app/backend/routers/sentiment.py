"""
sentiment.py — Dual sentiment inference:
  1. Finetuned IndoBERT via Hugging Face Space (cloud, tanpa GPU lokal)
  2. Groq LLM (cloud, llama-3.1-8b-instant)
Model dijalankan di server Hugging Face Space, hanya butuh URL Space.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import os
import asyncio
import httpx
from dotenv import load_dotenv
from .grok import groq_chat, groq_chat_rotate, get_key, parse_json

load_dotenv()

router = APIRouter()

# ─── HF Space config ─────────────────────────────────────────────────────────
HF_API_TOKEN  = os.getenv("HF_API_TOKEN", "")
HF_SPACE_URL  = os.getenv("HF_SPACE_URL", "https://reehandn-sentiment-api.hf.space")

# Label map: IndoBERT dilatih dengan 0=bearish, 1=neutral, 2=bullish
# (sesuai notebook Pipeline_Finetune_Sentiment.ipynb)
LABEL_MAP = {
    "LABEL_0": "negative",   # bearish
    "LABEL_1": "neutral",
    "LABEL_2": "positive",   # bullish
    "positive": "positive",
    "neutral":  "neutral",
    "negative": "negative",
}

# ─── Pydantic models ──────────────────────────────────────────────────────────
class ArticleInput(BaseModel):
    title:    str
    content:  str = ""
    category: str = "market"

class SentimentRequest(BaseModel):
    ticker:   str
    articles: List[ArticleInput]
    api_key:  Optional[str] = None

# ─── HF Space API (cloud) ────────────────────────────────────────────────────
async def _call_hf_api(texts: list, max_retries: int = 3) -> list:
    """
    Panggil HF Space (Docker) untuk klasifikasi sentimen.
    Space menjalankan model finetuned IndoBERT dari repo HF.
    Mendukung retry otomatis saat Space sedang loading (cold start).
    """
    headers = {"Content-Type": "application/json"}
    if HF_API_TOKEN:
        headers["Authorization"] = f"Bearer {HF_API_TOKEN}"
    payload = {"inputs": texts}

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{HF_SPACE_URL}/predict",
                    headers=headers,
                    json=payload,
                )

                if resp.status_code == 503:
                    # Space sedang loading (cold start), tunggu lalu retry
                    wait_time = 30
                    print(f"[Sentiment] Space loading, retry in {wait_time}s (attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue

                if resp.status_code == 429:
                    print(f"[Sentiment] Rate limited, retry in 5s (attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(5)
                    continue

                if not resp.is_success:
                    print(f"[Sentiment] Space API error {resp.status_code}: {resp.text[:300]}")
                    return [{"label": "neutral", "score": 0.5}] * len(texts)

                return resp.json()

        except Exception as e:
            print(f"[Sentiment] Space API request failed (attempt {attempt+1}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(5)

    print("[Sentiment] All Space API retries exhausted")
    return [{"label": "neutral", "score": 0.5}] * len(texts)


async def predict_hf(articles: List[ArticleInput]) -> list:
    """
    Inference via Hugging Face Inference API (cloud).
    Mengirim semua teks sekaligus dalam satu batch request.
    """
    texts = [f"{a.title} {a.content}"[:512] for a in articles]

    raw_results = await _call_hf_api(texts)

    results = []
    for i, item in enumerate(raw_results):
        try:
            # HF API mengembalikan list of list: [[{label, score}, ...], ...]
            if isinstance(item, list):
                top = item[0]  # ambil label dengan score tertinggi
            else:
                top = item

            raw_label = top.get("label", "LABEL_1")
            label = LABEL_MAP.get(raw_label, "neutral")
            score = float(top.get("score", 0.5))
            results.append({"label": label, "score": score})
        except Exception:
            results.append({"label": "neutral", "score": 0.5})

    # Jika hasil lebih sedikit dari input (misal API error partial), pad dengan neutral
    while len(results) < len(articles):
        results.append({"label": "neutral", "score": 0.5})

    return results

# ─── Groq LLM inference ───────────────────────────────────────────────────────
async def predict_llm(ticker: str, articles: List[ArticleInput], api_key: str) -> list:
    if not articles:
        return []
    try:
        key = get_key(api_key)
    except Exception:
        return [{"label": "neutral", "score": 0.5}] * len(articles)

    prompt = f"""Anda adalah analis pasar modal Indonesia.
Tugas: Berikan sentimen terhadap DAMPAK berita terhadap saham {ticker}.

Label wajib:
- positive : berita mendukung saham / pasar naik
- negative : berita menekan harga / risiko
- neutral  : dampak campuran atau sekadar informasi

Berita:
"""
    for i, a in enumerate(articles):
        prompt += f"[{i}] {a.title}\n"

    prompt += '\nBalas HANYA dengan JSON valid berformat object: {"results": [{"index": int, "label": "positive"|"neutral"|"negative", "score": 0.0-1.0}]}'

    try:
        from .grok import MODEL_NEWS
        res  = await groq_chat_rotate(
            [{"role": "user", "content": prompt}],
            model=MODEL_NEWS, max_tokens=2000, api_key=api_key, json_mode=True
        )
        content = res["choices"][0]["message"]["content"]
        # Cari block JSON jika ada teks tambahan
        import re
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            clean = match.group(0)
        else:
            clean = content.strip().replace("```json", "").replace("```", "").strip()
            
        import json
        data = json.loads(clean)
        
        # fallback neutral
        out  = [{"label": "neutral", "score": 0.5}] * len(articles)
        
        results_list = data.get("results", [])
        for item in results_list:
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(articles):
                out[idx] = {
                    "label": item.get("label", "neutral").lower(),
                    "score": float(item.get("score", 0.5)),
                }
        return out
    except Exception as e:
        print(f"[Sentiment] LLM Error: {e}")
        return [{"label": "neutral", "score": 0.5}] * len(articles)

# ─── Endpoint ──────────────────────────────────────────────────────────────────
@router.post("/predict")
async def predict_sentiment(req: SentimentRequest):
    """
    Prediksi sentimen dual-model: IndoBERT lokal + Groq LLM.
    Hasil per artikel berisi: sentiment (HF), llm_sentiment (Groq).
    """
    # Jalankan paralel
    hf_res, llm_res = await asyncio.gather(
        predict_hf(req.articles),
        predict_llm(req.ticker, req.articles, req.api_key),
    )

    LABEL_ID = {"positive": "Positif", "neutral": "Netral", "negative": "Negatif"}
    results = []
    pos = neu = neg = 0

    for i, art in enumerate(req.articles):
        hf_label  = LABEL_MAP.get(hf_res[i].get("label",  "neutral"), "neutral")
        hf_score  = float(hf_res[i].get("score", 0.5))
        llm_label = LABEL_MAP.get(llm_res[i].get("label", "neutral"), "neutral")
        llm_score = float(llm_res[i].get("score", 0.5))

        if hf_label not in LABEL_MAP: hf_label  = "neutral"
        if llm_label not in LABEL_MAP: llm_label = "neutral"

        if hf_label == "positive": pos += 1
        elif hf_label == "negative": neg += 1
        else: neu += 1

        results.append({
            "title":        art.title,
            "category":     art.category,
            "sentiment":    hf_label,
            "label":        LABEL_ID.get(hf_label,  "Netral"),
            "score":        hf_score,
            "llm_sentiment":llm_label,
            "llm_label":    LABEL_ID.get(llm_label, "Netral"),
            "llm_score":    llm_score,
        })

    total   = len(results)
    pos_pct = round(pos / total * 100) if total else 0
    neu_pct = round(neu / total * 100) if total else 0
    neg_pct = round(neg / total * 100) if total else 0
    agg     = round((pos * 100 + neu * 50) / total) if total else 50

    overall = "positive" if pos_pct > 50 else ("negative" if neg_pct > 50 else "neutral")

    return {
        "ticker":        req.ticker,
        "total_articles":total,
        "results":       results,
        "summary": {
            "positive":     pos,
            "neutral":      neu,
            "negative":     neg,
            "positive_pct": pos_pct,
            "neutral_pct":  neu_pct,
            "negative_pct": neg_pct,
            "score":        agg,
            "aggregate_score": agg,
            "overall":      overall,
            "overall_label":LABEL_ID.get(overall, "Netral"),
        },
    }
