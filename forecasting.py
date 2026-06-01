from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
import pandas as pd

def train_forecast(df):

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

    X = df[features]
    y = df["Close"]

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

    model.fit(X_train, y_train)

    latest = X.iloc[-1:]
    prediction = model.predict(latest)[0]

    return prediction