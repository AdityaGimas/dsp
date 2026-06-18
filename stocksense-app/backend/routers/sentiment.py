"""
sentiment.py — Dual sentiment inference:
  1. Finetuned IndoBERT (lokal, dari folder indobert-finansial-sentiment)
  2. Groq LLM (cloud, llama-3.1-8b-instant)
Model lokal di-load sekali pada startup (singleton), tidak perlu internet.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import os
import asyncio
from .grok import groq_chat, get_key, parse_json

router = APIRouter()

# ─── Path model lokal ─────────────────────────────────────────────────────────
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_MODEL_PATH  = os.path.join(
    _BACKEND_DIR, "..", "indobert-finansial-sentiment"
)
_MODEL_PATH  = os.path.normpath(_MODEL_PATH)

# ─── Singleton: load sekali, cache selamanya ──────────────────────────────────
_hf_pipe = None
_hf_lock = asyncio.Lock()

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

def _load_local_model():
    """Load IndoBERT dari disk. Dipanggil sekali saat pertama request."""
    global _hf_pipe
    if _hf_pipe is not None:
        return _hf_pipe
    try:
        from transformers import (
            pipeline,
            AutoModelForSequenceClassification,
            AutoTokenizer,
        )
        print(f"[Sentiment] Loading local model from: {_MODEL_PATH}")
        tok  = AutoTokenizer.from_pretrained(_MODEL_PATH, local_files_only=True)
        mdl  = AutoModelForSequenceClassification.from_pretrained(
            _MODEL_PATH, local_files_only=True
        )
        _hf_pipe = pipeline(
            "text-classification",
            model=mdl,
            tokenizer=tok,
            top_k=1,
            device=-1,   # CPU
        )
        print("[Sentiment] Local model loaded OK.")
        return _hf_pipe
    except Exception as e:
        print(f"[Sentiment] Failed to load local model: {e}")
        return None

# ─── Pydantic models ──────────────────────────────────────────────────────────
class ArticleInput(BaseModel):
    title:    str
    content:  str = ""
    category: str = "market"

class SentimentRequest(BaseModel):
    ticker:   str
    articles: List[ArticleInput]
    api_key:  Optional[str] = None

# ─── HF local inference ───────────────────────────────────────────────────────
def _run_hf_local(texts: list) -> list:
    """Run inference lokal (blocking, dipanggil via executor)."""
    pipe = _load_local_model()
    if pipe is None:
        return [{"label": "neutral", "score": 0.5}] * len(texts)
    results = []
    for text in texts:
        try:
            out   = pipe(text[:512], top_k=1)
            top   = out[0][0] if isinstance(out[0], list) else out[0]
            raw   = top.get("label", "LABEL_1")
            label = LABEL_MAP.get(raw, "neutral")
            score = float(top.get("score", 0.5))
            results.append({"label": label, "score": score})
        except Exception:
            results.append({"label": "neutral", "score": 0.5})
    return results

async def predict_hf(articles: List[ArticleInput]) -> list:
    """Async wrapper untuk local model inference."""
    texts = [f"{a.title} {a.content}"[:512] for a in articles]
    loop  = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _run_hf_local, texts),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        print("[Sentiment] Local model inference timeout")
        return [{"label": "neutral", "score": 0.5}] * len(articles)

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
        res  = await groq_chat(
            [{"role": "user", "content": prompt}], key,
            model=MODEL_NEWS, max_tokens=2000
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
