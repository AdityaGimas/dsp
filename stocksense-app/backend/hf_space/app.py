"""
IndoBERT Financial Sentiment API — Hugging Face Space
Loads the finetuned model from reehandn/model-financial-sentiment
and serves predictions via REST API.
"""
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch
import os

app = FastAPI(title="IndoBERT Financial Sentiment API")

# ─── Load model from HF repo ─────────────────────────────────────────────────
MODEL_ID = os.getenv("MODEL_ID", "reehandn/model-financial-sentiment")
HF_TOKEN = os.getenv("HF_TOKEN", None)  # Secret di Space settings

print(f"[Init] Loading model: {MODEL_ID}")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID, token=HF_TOKEN)
model.eval()
print("[Init] Model loaded successfully!")

# Label map: 0=bearish/negative, 1=neutral, 2=bullish/positive
LABEL_MAP = {0: "negative", 1: "neutral", 2: "positive"}


# ─── API schema ───────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    inputs: List[str]


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.post("/predict")
async def predict(req: PredictRequest):
    """Classify sentiment for a batch of texts."""
    results = []
    for text in req.inputs:
        encoded = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )
        with torch.no_grad():
            outputs = model(**encoded)

        probs = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]
        top_idx = torch.argmax(probs).item()
        top_score = probs[top_idx].item()

        results.append({
            "label": LABEL_MAP.get(top_idx, f"LABEL_{top_idx}"),
            "score": round(top_score, 4),
        })
    return results


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_ID}
