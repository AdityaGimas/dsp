# StockSense LQ45 Dashboard

## Struktur Proyek
```
stocksense-lq45/
├── backend/
│   ├── main.py              ← Entry point FastAPI
│   ├── routers/
│   │   ├── stocks.py        ← Endpoint data saham (harga, historis, info)
│   │   └── prediction.py    ← Endpoint prediksi (kamu isi sendiri)
│   ├── services/
│   │   └── market_data.py   ← Ambil data dari yfinance
│   └── requirements.txt
├── frontend/
│   └── index.html           ← Dashboard lengkap
└── README.md
```

## Cara Menjalankan

### 1. Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Jalankan FastAPI
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 3. Buka Dashboard
Buka file `frontend/index.html` di browser.
Atau jalankan server sederhana:
```bash
cd frontend
python -m http.server 3000
```
Lalu buka http://localhost:3000

### API Endpoints
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/stocks/list` | Daftar saham LQ45 |
| GET | `/api/stocks/{ticker}/info` | Info saham (harga, market cap, dll) |
| GET | `/api/stocks/{ticker}/history?period=6mo` | Data historis OHLCV |
| GET | `/api/stocks/{ticker}/indicators` | Indikator teknikal (RSI, MACD, dll) |
| GET | `/api/prediction/{ticker}` | **← Kamu isi endpoint ini** |

### Format Response Prediksi (yang perlu kamu buat)
```json
{
  "ticker": "BBCA.JK",
  "predictions": [
    { "date": "2025-06-04", "price": 10340, "change_pct": 1.87, "confidence": 0.64 },
    { "date": "2025-06-05", "price": 10480, "change_pct": 1.35, "confidence": 0.58 }
  ],
  "recommendation": "BUY",
  "confidence": 0.814,
  "stop_loss": 9800,
  "entry": 10150,
  "target": 10730,
  "model_accuracy": 87.3
}
```
