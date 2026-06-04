from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stocks, prediction

app = FastAPI(
    title="StockSense LQ45 API",
    description="API untuk dashboard analisis saham LQ45",
    version="1.0.0"
)

# CORS agar frontend bisa akses API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Ganti dengan domain frontend saat production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(prediction.router, prefix="/api/prediction", tags=["Prediction"])

@app.get("/")
def root():
    return {"message": "StockSense LQ45 API is running", "docs": "/docs"}
