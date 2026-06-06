from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()


# ─────────────────────────────────────────────
# SCHEMA — sesuaikan dengan output model kamu
# ─────────────────────────────────────────────

class PredictionDay(BaseModel):
    date: str               # "2025-06-04"
    price: float            # harga prediksi
    change_pct: float       # perubahan % dari hari sebelumnya
    confidence: float       # 0.0 – 1.0


class PredictionResponse(BaseModel):
    ticker: str
    model_name: str
    model_accuracy: float           # % akurasi model (MAPE atau sejenisnya)
    predictions: List[PredictionDay]
    recommendation: str             # "BUY" | "SELL" | "HOLD"
    confidence: float               # keyakinan rekomendasi 0–1
    stop_loss: Optional[float]
    entry: Optional[float]
    target: Optional[float]


# ─────────────────────────────────────────────
# ENDPOINT PREDIKSI — ISI BAGIAN INI
# ─────────────────────────────────────────────

@router.get("/{ticker}", response_model=PredictionResponse)
def get_prediction(ticker: str):
    """
    Endpoint prediksi harga saham.
    Contoh: /api/prediction/BBCA.JK

    ╔══════════════════════════════════════════════════╗
    ║  AREA YANG PERLU KAMU ISI SENDIRI                ║
    ║                                                  ║
    ║  Langkah:                                        ║
    ║  1. Load model kamu (LSTM, ARIMA, dll)           ║
    ║  2. Ambil data input (dari yfinance atau lainnya)║
    ║  3. Jalankan prediksi                            ║
    ║  4. Return hasil dalam format PredictionResponse ║
    ╚══════════════════════════════════════════════════╝
    """

    # ── CONTOH RETURN (ganti dengan logika model kamu) ──────────
    # Hapus blok dummy ini setelah model kamu siap

    import datetime
    today = datetime.date.today()

    dummy_predictions = []
    base_price = 6767.0
    for i in range(1, 8):
        date = today + datetime.timedelta(days=i)
        # skip weekend
        if date.weekday() >= 5:
            continue
        change = round((i * 0.5) + ((-1) ** i * 0.2), 2)
        price = round(base_price * (1 + change / 100), 0)
        dummy_predictions.append(PredictionDay(
            date=str(date),
            price=price,
            change_pct=change,
            confidence=round(0.75 - i * 0.02, 2),
        ))

    return PredictionResponse(
        ticker=ticker,
        model_name="Dummy Model",          # ganti: "LSTM", "ARIMA", dst
        model_accuracy=67.0,                # ganti dengan akurasi modelmu
        predictions=dummy_predictions,
        recommendation="HOLD",             # ganti dengan output modelmu
        confidence=0.0,                    # ganti dengan confidence modelmu
        stop_loss=None,
        entry=base_price,
        target=None,
    )
    # ── AKHIR CONTOH ─────────────────────────────────────────────
