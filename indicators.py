import pandas as pd

def add_indicators(df):
    # 1. Filter hanya kolom utama yang dibutuhkan
    available_cols = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in df.columns]
    df = df[available_cols].copy()
    
    # --- 2. PENYEMBUHAN DATA (CRUCIAL FIX) ---
    # Jika ada lubang harga (NaN) akibat hari libur/glitch YF, 
    # isi dengan harga penutupan dari hari sebelumnya (forward fill).
    # Ini mencegah efek domino yang menghancurkan algoritma rolling()
    df = df.ffill()
    
    # Jika baris pertama secara historis masih NaN (tidak bisa ffill mundur), hapus baris tersebut
    df = df.dropna(subset=["Close"])

    # Atasi kekosongan pada volume transaksi menjadi nol
    if "Volume" in df.columns:
        df["Volume"] = df["Volume"].fillna(0)

    # 3. Kalkulasi Indikator Teknikal
    df["MA5"] = df["Close"].rolling(5).mean()
    df["MA20"] = df["Close"].rolling(20).mean()

    delta = df["Close"].diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()

    # Mencegah error pembagian dengan nol jika harga stagnan berkepanjangan
    rs = avg_gain / avg_loss.replace(0, 1e-10)
    df["RSI"] = 100 - (100 / (1 + rs))

    ema12 = df["Close"].ewm(span=12, adjust=False).mean()
    ema26 = df["Close"].ewm(span=26, adjust=False).mean()
    df["MACD"] = ema12 - ema26

    # 4. Hapus NaN yang MURNI disebabkan oleh masa tunggu indikator (misal 20 baris pertama MA20)
    return df.dropna(subset=["MA20", "RSI", "MACD"])