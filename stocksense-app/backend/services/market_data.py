import yfinance as yf
import pandas as pd
import numpy as np
import ta

from .cache import ttl_cache

# Daftar 45 saham LQ45 (suffix .JK untuk IDX)
LQ45_TICKERS = [
    "ACES.JK", "ADRO.JK", "AMRT.JK", "ANTM.JK", "ASII.JK",
    "BBCA.JK", "BBNI.JK", "BBRI.JK", "BBTN.JK", "BMRI.JK",
    "BRIS.JK", "BRPT.JK", "BUKA.JK", "CPIN.JK", "EMTK.JK",
    "ERAA.JK", "EXCL.JK", "GGRM.JK", "GOTO.JK", "HMSP.JK",
    "HRUM.JK", "ICBP.JK", "INCO.JK", "INDF.JK", "INKP.JK",
    "INTP.JK", "ITMG.JK", "JPFA.JK", "KLBF.JK", "MAPI.JK",
    "MBMA.JK", "MDKA.JK", "MEDC.JK", "MIKA.JK", "MNCN.JK",
    "PGAS.JK", "PTBA.JK", "PTPP.JK", "SMGR.JK", "TBIG.JK",
    "TLKM.JK", "TOWR.JK", "UNTR.JK", "UNVR.JK", "WSKT.JK",
]

LQ45_NAMES = {
    "ACES.JK": "Ace Hardware", "ADRO.JK": "Adaro Energy", "AMRT.JK": "Sumber Alfaria",
    "ANTM.JK": "Aneka Tambang", "ASII.JK": "Astra International", "BBCA.JK": "Bank Central Asia",
    "BBNI.JK": "Bank Negara Indonesia", "BBRI.JK": "Bank Rakyat Indonesia",
    "BBTN.JK": "Bank Tabungan Negara", "BMRI.JK": "Bank Mandiri", "BRIS.JK": "Bank Syariah Indonesia",
    "BRPT.JK": "Barito Pacific", "BUKA.JK": "Bukalapak", "CPIN.JK": "Charoen Pokphand",
    "EMTK.JK": "Elang Mahkota", "ERAA.JK": "Erajaya Swasembada", "EXCL.JK": "XL Axiata",
    "GGRM.JK": "Gudang Garam", "GOTO.JK": "GoTo Gojek Tokopedia", "HMSP.JK": "HM Sampoerna",
    "HRUM.JK": "Harum Energy", "ICBP.JK": "Indofood CBP", "INCO.JK": "Vale Indonesia",
    "INDF.JK": "Indofood Sukses Makmur", "INKP.JK": "Indah Kiat Pulp", "INTP.JK": "Indocement",
    "ITMG.JK": "Indo Tambangraya", "JPFA.JK": "Japfa Comfeed", "KLBF.JK": "Kalbe Farma",
    "MAPI.JK": "Mitra Adiperkasa", "MBMA.JK": "Merdeka Battery", "MDKA.JK": "Merdeka Copper Gold",
    "MEDC.JK": "Medco Energi", "MIKA.JK": "Mitra Keluarga", "MNCN.JK": "Media Nusantara Citra",
    "PGAS.JK": "Perusahaan Gas Negara", "PTBA.JK": "Bukit Asam", "PTPP.JK": "PP Persero",
    "SMGR.JK": "Semen Indonesia", "TBIG.JK": "Tower Bersama", "TLKM.JK": "Telkom Indonesia",
    "TOWR.JK": "Sarana Menara", "UNTR.JK": "United Tractors", "UNVR.JK": "Unilever Indonesia",
    "WSKT.JK": "Waskita Karya",
}


@ttl_cache(3600)  # daftar statis, cache 1 jam
def get_stock_list():
    """Kembalikan daftar saham LQ45 beserta info singkat."""
    result = []
    for ticker in LQ45_TICKERS:
        code = ticker.replace(".JK", "")
        result.append({
            "ticker": ticker,
            "code": code,
            "name": LQ45_NAMES.get(ticker, code),
        })
    return result


@ttl_cache(300)  # cache 5 menit per ticker
def get_stock_info(ticker: str):
    """Ambil info lengkap saham: harga terkini, market cap, dll."""
    t = yf.Ticker(ticker)
    info = t.info
    # Ambil harga hari ini vs kemarin
    hist = t.history(period="5d")
    current_price = float(hist["Close"].iloc[-1]) if not hist.empty else 0
    prev_price = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current_price
    change = current_price - prev_price
    change_pct = (change / prev_price * 100) if prev_price else 0

    return {
        "ticker": ticker,
        "code": ticker.replace(".JK", ""),
        "name": LQ45_NAMES.get(ticker, info.get("longName", ticker)),
        "sector": info.get("sector", ""),
        "industry": info.get("industry", ""),
        "current_price": round(current_price, 2),
        "prev_price": round(prev_price, 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "market_cap": info.get("marketCap"),
        "volume": info.get("volume"),
        "avg_volume": info.get("averageVolume"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "pe_ratio": info.get("trailingPE"),
        "eps": info.get("trailingEps"),
        "dividend_yield": info.get("dividendYield"),
    }


@ttl_cache(600)  # cache 10 menit per (ticker, period)
def get_stock_history(ticker: str, period: str = "6mo"):
    """
    Ambil data historis OHLCV.
    period: 1mo, 3mo, 6mo, 1y, 2y, 5y
    """
    t = yf.Ticker(ticker)
    hist = t.history(period=period)
    if hist.empty:
        return []
    hist = hist.reset_index()
    records = []
    for _, row in hist.iterrows():
        records.append({
            "date": row["Date"].strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })
    return records


@ttl_cache(600)  # cache 10 menit per ticker
def get_technical_indicators(ticker: str):
    """Hitung indikator teknikal dari data historis."""
    t = yf.Ticker(ticker)
    hist = t.history(period="3mo")
    if hist.empty or len(hist) < 30:
        return {}
    close = hist["Close"]
    high = hist["High"]
    low = hist["Low"]
    volume = hist["Volume"]

    # RSI
    rsi_series = ta.momentum.RSIIndicator(close=close, window=14).rsi()
    rsi = round(float(rsi_series.iloc[-1]), 2)

    # MACD
    macd_obj = ta.trend.MACD(close=close)
    macd_val = round(float(macd_obj.macd().iloc[-1]), 2)
    macd_signal = round(float(macd_obj.macd_signal().iloc[-1]), 2)
    macd_diff = round(macd_val - macd_signal, 2)

    # MA 20 & MA 50
    ma20 = round(float(close.rolling(20).mean().iloc[-1]), 2)
    ma50 = round(float(close.rolling(50).mean().iloc[-1]), 2) if len(close) >= 50 else None
    golden_cross = (ma20 > ma50) if ma50 else False

    # Bollinger Bands
    bb = ta.volatility.BollingerBands(close=close, window=20)
    bb_upper = round(float(bb.bollinger_hband().iloc[-1]), 2)
    bb_lower = round(float(bb.bollinger_lband().iloc[-1]), 2)
    bb_mid = round(float(bb.bollinger_mavg().iloc[-1]), 2)
    current_price = round(float(close.iloc[-1]), 2)
    if current_price > bb_mid:
        bb_position = "Mid-Upper"
    else:
        bb_position = "Mid-Lower"

    # Stochastic
    stoch = ta.momentum.StochasticOscillator(high=high, low=low, close=close)
    stoch_val = round(float(stoch.stoch().iloc[-1]), 2)

    # Volume ratio
    avg_vol = float(volume.rolling(20).mean().iloc[-1])
    vol_ratio = round(float(volume.iloc[-1]) / avg_vol, 2) if avg_vol else 1.0

    # Sinyal teknikal
    signals = []
    if rsi < 70: signals.append("buy")
    if macd_diff > 0: signals.append("buy")
    if golden_cross: signals.append("buy")
    if vol_ratio > 1: signals.append("buy")
    buy_count = signals.count("buy")
    overall_signal = "Beli" if buy_count >= 3 else ("Jual" if buy_count <= 1 else "Netral")

    return {
        "rsi": {"value": rsi, "signal": "Overbought" if rsi > 70 else ("Oversold" if rsi < 30 else "Netral")},
        "macd": {"value": macd_val, "signal_line": macd_signal, "histogram": macd_diff,
                 "signal": "Bullish" if macd_diff > 0 else "Bearish"},
        "moving_average": {"ma20": ma20, "ma50": ma50, "golden_cross": golden_cross,
                           "signal": "Beli" if golden_cross else "Jual"},
        "bollinger_bands": {"upper": bb_upper, "mid": bb_mid, "lower": bb_lower,
                            "position": bb_position},
        "stochastic": {"value": stoch_val,
                       "signal": "Overbought" if stoch_val > 80 else ("Oversold" if stoch_val < 20 else "Netral")},
        "volume_ratio": {"value": vol_ratio, "signal": "Di atas avg" if vol_ratio > 1 else "Di bawah avg"},
        "overall": {"signal": overall_signal, "buy_count": buy_count, "total": 4},
    }
