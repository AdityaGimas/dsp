from fastapi import APIRouter, HTTPException, Query
from services.market_data import (
    get_stock_list,
    get_stock_info,
    get_stock_history,
    get_technical_indicators,
)

router = APIRouter()


@router.get("/list")
def list_stocks():
    """Kembalikan daftar 45 saham LQ45."""
    return {"stocks": get_stock_list()}


@router.get("/{ticker}/info")
def stock_info(ticker: str):
    """
    Info lengkap saham: harga terkini, market cap, P/E, dll.
    Contoh: /api/stocks/BBCA.JK/info
    """
    try:
        return get_stock_info(ticker)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Data tidak ditemukan: {str(e)}")


@router.get("/{ticker}/history")
def stock_history(
    ticker: str,
    period: str = Query(default="6mo", description="1mo | 3mo | 6mo | 1y | 2y | 5y"),
):
    """
    Data historis OHLCV.
    Contoh: /api/stocks/BBCA.JK/history?period=6mo
    """
    try:
        data = get_stock_history(ticker, period)
        return {"ticker": ticker, "period": period, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/indicators")
def technical_indicators(ticker: str):
    """
    Indikator teknikal: RSI, MACD, Bollinger Bands, Stochastic, Volume Ratio.
    Contoh: /api/stocks/BBCA.JK/indicators
    """
    try:
        return get_technical_indicators(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
