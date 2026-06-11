from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter()


class ArticleInput(BaseModel):
    title: str
    content: str = ""


class SentimentRequest(BaseModel):
    ticker: str
    articles: List[ArticleInput]


@router.post("/predict")
def predict_sentiment(req: SentimentRequest):
    """
    Prediksi sentimen berita menggunakan model finetune kamu.

    ISI BAGIAN INI DENGAN MODEL FINETUNE KAMU:
      1. Load model (IndoBERT, dsb.)
      2. Tokenize title + content
      3. Predict label per artikel
    """
    # ── DUMMY — ganti dengan model kamu ──────────────────
    import random
    random.seed(len(req.articles) + len(req.ticker))

    results = []
    pos = neu = neg = 0
    for art in req.articles:
        # TODO: ganti ini → label = model.predict(art.title + " " + art.content)
        label = random.choices(
            ["positive", "neutral", "negative"],
            weights=[0.55, 0.30, 0.15]
        )[0]
        score = round(random.uniform(0.62, 0.96), 3)
        label_id = {"positive": "Positif", "neutral": "Netral", "negative": "Negatif"}[label]

        if label == "positive": pos += 1
        elif label == "neutral": neu += 1
        else: neg += 1

        results.append({
            "title":       art.title,
            "sentiment":   label,        # English: "positive" | "neutral" | "negative"
            "label":       label_id,     # Indonesian untuk display
            "score":       score,
        })
    # ── AKHIR DUMMY ──────────────────────────

    total    = len(results)
    pos_pct  = round(pos / total * 100) if total else 0
    neu_pct  = round(neu / total * 100) if total else 0
    neg_pct  = round(neg / total * 100) if total else 0
    agg      = round((pos * 100 + neu * 50) / total) if total else 50

    # overall dalam English untuk konsistensi dengan JS
    overall  = "positive" if pos_pct > 50 else ("negative" if neg_pct > 50 else "neutral")
    overall_label = {"positive": "Positif", "neutral": "Netral", "negative": "Negatif"}[overall]

    return {
        "ticker":         req.ticker,
        "total_articles": total,
        "results":        results,
        "summary": {
            "positive":        pos,
            "neutral":         neu,
            "negative":        neg,
            "positive_pct":    pos_pct,
            "neutral_pct":     neu_pct,
            "negative_pct":    neg_pct,
            "score":           agg,          # alias aggregate_score untuk JS
            "aggregate_score": agg,
            "overall":         overall,      # English: "positive"|"neutral"|"negative"
            "overall_label":   overall_label # Indonesian untuk display
        }
    }
