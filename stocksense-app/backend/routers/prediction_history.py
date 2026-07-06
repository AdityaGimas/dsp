"""
prediction_history.py — endpoint riwayat prediksi harga.

- POST /api/prediction-history/save : simpan prediksi XGBoost & LLM hari ini.
- GET  /api/prediction-history/{ticker} : ambil riwayat + akurasi (vs harga aktual).

Dipisah dari router /api/prediction agar tidak bentrok dengan rute GET /{ticker}.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import traceback

from services import prediction_store

router = APIRouter()


def _dump(m):
    if m is None:
        return {}
    return m.model_dump() if hasattr(m, "model_dump") else m.dict()


class PointIn(BaseModel):
    horizon: Optional[int] = None
    date: Optional[str] = None
    price: Optional[float] = None
    low: Optional[float] = None
    high: Optional[float] = None


class ModelPredIn(BaseModel):
    recommendation: Optional[str] = None
    confidence: Optional[float] = None
    model_accuracy: Optional[float] = None
    points: List[PointIn] = []


class SaveIn(BaseModel):
    ticker: str
    base_price: Optional[float] = None
    pred_date: Optional[str] = None
    xgb: Optional[ModelPredIn] = None
    llm: Optional[ModelPredIn] = None


@router.post("/save")
def save_history(body: SaveIn):
    try:
        return prediction_store.save_prediction(
            ticker=body.ticker,
            base_price=body.base_price,
            xgb=_dump(body.xgb),
            llm=_dump(body.llm),
            pred_date=body.pred_date,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}")
def get_history(ticker: str, limit: int = 30):
    try:
        return prediction_store.get_history(ticker, limit)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
