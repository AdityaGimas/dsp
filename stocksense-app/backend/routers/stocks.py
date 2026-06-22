from fastapi import APIRouter, HTTPException, Query
from services.market_data import (
    get_stock_list,
    get_stock_info,
    get_stock_history,
    get_technical_indicators,
)

router = APIRouter()

_REFRESH_DESC = "Jika true, abaikan cache dan ambil data terbaru"


@router.get("/list")
def list_stocks():
    """Kembalikan daftar 45 saham LQ45."""
    return {"stocks": get_stock_list()}


@router.get("/{ticker}/info")
def stock_info(ticker: str, refresh: bool = Query(False, description=_REFRESH_DESC)):
    """
    Info lengkap saham: harga terkini, market cap, P/E, dll.
    Contoh: /api/stocks/BBCA.JK/info  (atau ?refresh=true untuk data terbaru)
    """
    try:
        return get_stock_info(ticker, _refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Data tidak ditemukan: {str(e)}")


@router.get("/{ticker}/history")
def stock_history(
    ticker: str,
    period: str = Query(default="6mo", description="1mo | 3mo | 6mo | 1y | 2y | 5y"),
    refresh: bool = Query(False, description=_REFRESH_DESC),
):
    """
    Data historis OHLCV.
    Contoh: /api/stocks/BBCA.JK/history?period=6mo  (tambah &refresh=true untuk fresh)
    """
    try:
        data = get_stock_history(ticker, period, _refresh=refresh)
        return {"ticker": ticker, "period": period, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/indicators")
def technical_indicators(ticker: str, refresh: bool = Query(False, description=_REFRESH_DESC)):
    """
    Indikator teknikal: RSI, MACD, Bollinger Bands, Stochastic, Volume Ratio.
    Contoh: /api/stocks/BBCA.JK/indicators  (atau ?refresh=true untuk data terbaru)
    """
    try:
        return get_technical_indicators(ticker, _refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
