from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
import pandas as pd

def train_forecast(df):
    df_model = df.copy()
    
    # BIKIN TARGET MASA DEPAN:
    # Target_Close adalah harga Close 1 hari SETELAH data fitur hari ini
    df_model["Target_Close"] = df_model["Close"].shift(-1)
    
    # Pisahkan baris terakhir (hari ini) karena Target_Close-nya pasti NaN
    # Baris ini yang akan kita gunakan untuk memprediksi harga besok
    latest_features = df_model.iloc[-1:]
    
    # Hapus baris terakhir dari data training agar tidak error karena NaN
    df_train = df_model.dropna(subset=["Target_Close"])
    
    # --- TAMBAHKAN PENJAGA INI ---
    if len(df_train) < 5:
        raise ValueError("Sampel data historis valid terlalu sedikit untuk melakukan pembagian train/test pada model regresi.")
    features = [
        "Open",
        "High",
        "Low",
        "Volume",
        "MA5",
        "MA20",
        "RSI",
        "MACD"
    ]

    X = df_train[features]
    y = df_train["Target_Close"]

    # Validasi time-series tidak boleh di-shuffle
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        shuffle=False
    )

    model = XGBRegressor(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=5
    )

    # Latih model: Belajar pola fitur hari H untuk menebak harga H+1
    model.fit(X_train, y_train)

    # Lakukan prediksi harga besok menggunakan fitur teknikal penutupan hari ini
    X_latest = latest_features[features]
    prediction = model.predict(X_latest)[0]

    return float(prediction)