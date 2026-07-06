from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stocks, prediction, prediction_history, news, sentiment, grok, macro, chat

app = FastAPI(title="StockSense LQ45 API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(stocks.router,     prefix="/api/stocks",     tags=["Stocks"])
app.include_router(prediction.router, prefix="/api/prediction", tags=["ML Prediction"])
app.include_router(prediction_history.router, prefix="/api/prediction-history", tags=["Prediction History"])
app.include_router(news.router,       prefix="/api/news",       tags=["News"])
app.include_router(sentiment.router,  prefix="/api/sentiment",  tags=["Sentiment"])
app.include_router(grok.router,       prefix="/api/grok",       tags=["Grok LLM"])
app.include_router(macro.router,      prefix="/api/macro",      tags=["Macro Economics"])
app.include_router(chat.router,       prefix="/api/chat",       tags=["Chat AI"])


@app.get("/")
def root():
    return {"message": "StockSense LQ45 API v2.0", "docs": "/docs"}
