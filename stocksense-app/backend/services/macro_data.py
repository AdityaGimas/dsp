import yfinance as yf

def get_macro_data():
    """
    Mengambil data makro ekonomi (real-time untuk IHSG, USD/IDR, Minyak, Emas)
    dan data statis untuk BI Rate, Inflasi, PDB.
    """
    tickers = {
        "IHSG": "^JKSE",
        "USDIDR": "USDIDR=X",
        "CrudeOil": "CL=F",
        "Gold": "GC=F"
    }

    results = {}
    
    for key, symbol in tickers.items():
        try:
            t = yf.Ticker(symbol)
            hist = t.history(period="5d")
            if not hist.empty:
                current_price = float(hist["Close"].iloc[-1])
                prev_price = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current_price
                change = current_price - prev_price
                change_pct = (change / prev_price * 100) if prev_price else 0
                results[key] = {
                    "value": round(current_price, 2) if key != "IHSG" else round(current_price, 0),
                    "change": round(change, 2) if key != "IHSG" else round(change, 0),
                    "change_pct": round(change_pct, 2)
                }
            else:
                results[key] = None
        except Exception:
            results[key] = None

    # Hardcoded data for BI Rate, Inflation, GDP
    results["BIRate"] = {
        "value": 6.00,
        "change_pct": 0,
        "desc": "Tetap"
    }
    results["Inflation"] = {
        "value": 2.84,
        "change_pct": -0.13, # MoM change example
        "desc": "YoY"
    }
    results["GDP"] = {
        "value": 5.03,
        "change_pct": 0.06, # QoQ change example
        "desc": "YoY"
    }

    return results
