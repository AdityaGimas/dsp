from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stocks, prediction, news, sentiment, grok

app = FastAPI(title="StockSense LQ45 API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(stocks.router,     prefix="/api/stocks",     tags=["Stocks"])
app.include_router(prediction.router, prefix="/api/prediction", tags=["ML Prediction"])
app.include_router(news.router,       prefix="/api/news",       tags=["News"])
app.include_router(sentiment.router,  prefix="/api/sentiment",  tags=["Sentiment"])
app.include_router(grok.router,       prefix="/api/grok",       tags=["Grok LLM"])


@app.get("/")
def root():
    return {"message": "StockSense LQ45 API v2.0", "docs": "/docs"}
