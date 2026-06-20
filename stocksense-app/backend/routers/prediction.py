from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import yfinance as yf
import pandas as pd
import numpy as np
import datetime
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator
from ta.volatility import BollingerBands
import traceback

try:
    from xgboost import XGBRegressor
except ImportError:
    XGBRegressor = None

router = APIRouter()

class PredictionDay(BaseModel):
    date: str
    price: float
    price_low: float
    price_high: float
    change_pct: float
    confidence: float

class PredictionResponse(BaseModel):
    ticker: str
    model_name: str
    model_accuracy: float
    predictions: List[PredictionDay]
    recommendation: str
    confidence: float
    stop_loss: Optional[float]
    entry: Optional[float]
    target: Optional[float]

@router.get("/{ticker}", response_model=PredictionResponse)
def get_prediction(ticker: str):
    if XGBRegressor is None:
        raise HTTPException(status_code=500, detail="Library 'xgboost' belum diinstal di backend. Silakan jalankan 'pip install xgboost scikit-learn'.")

    try:
        # 1. Fetch Data
        t = yf.Ticker(ticker)
        df = t.history(period="2y")
        if df.empty or len(df) < 50:
            raise ValueError("Data historis tidak cukup untuk training model.")

        df = df[['Open', 'High', 'Low', 'Close', 'Volume']].copy()

        # 2. Feature Engineering
        df['SMA_7'] = SMAIndicator(close=df['Close'], window=7).sma_indicator()
        df['SMA_21'] = SMAIndicator(close=df['Close'], window=21).sma_indicator()
        df['RSI_14'] = RSIIndicator(close=df['Close'], window=14).rsi()

        macd = MACD(close=df['Close'])
        df['MACD'] = macd.macd()
        df['MACD_Signal'] = macd.macd_signal()

        bb = BollingerBands(close=df['Close'], window=20, window_dev=2)
        df['BB_High'] = bb.bollinger_hband()
        df['BB_Low'] = bb.bollinger_lband()

        df['Return_1d'] = df['Close'].pct_change(1)
        df['Return_3d'] = df['Close'].pct_change(3)
        df['Volatility'] = df['Return_1d'].rolling(10).std()

        df.dropna(inplace=True)

        if len(df) < 30:
            raise ValueError("Data historis setelah feature engineering tidak cukup.")

        features = ['Open', 'High', 'Low', 'Close', 'Volume', 'SMA_7', 'SMA_21',
                    'RSI_14', 'MACD', 'MACD_Signal', 'BB_High', 'BB_Low',
                    'Return_1d', 'Return_3d', 'Volatility']
        X = df[features]

        # Estimate daily volatility for range calculation
        daily_volatility = float(df['Return_1d'].rolling(20).std().iloc[-1])

        predictions_out = []
        base_price = float(df['Close'].iloc[-1])
        today = datetime.date.today()
        current_date = today

        last_features = pd.DataFrame([X.iloc[-1].values], columns=features)

        # 3. Training & Prediction — 3 trading days ahead
        preds_prices = []
        model_accuracy = 0.0

        actual_days = 0
        loop_date = current_date

        while actual_days < 3:
            loop_date += datetime.timedelta(days=1)
            if loop_date.weekday() >= 5:  # Skip weekend
                continue
            actual_days += 1

            df[f'Target_{actual_days}'] = df['Close'].shift(-actual_days)
            train_df = df.dropna(subset=[f'Target_{actual_days}'])

            if len(train_df) < 20:
                continue

            X_train = train_df[features]
            y_train = train_df[f'Target_{actual_days}']

            model = XGBRegressor(
                n_estimators=150,
                max_depth=4,
                learning_rate=0.08,
                random_state=42,
                objective='reg:squarederror',
                subsample=0.85,
                colsample_bytree=0.85,
            )
            model.fit(X_train, y_train)

            split = int(len(train_df) * 0.8)
            y_test = y_train.iloc[split:]
            y_pred_test = model.predict(X_train.iloc[split:])
            mape = np.mean(np.abs((y_test - y_pred_test) / y_test)) * 100
            model_accuracy += (100 - mape)

            pred = model.predict(last_features)[0]
            preds_prices.append((loop_date, float(pred)))

        if len(preds_prices) > 0:
            model_accuracy = round(model_accuracy / len(preds_prices), 2)
        else:
            model_accuracy = 0.0

        # Build output with ranges
        confidence_base = min(max(model_accuracy / 100.0, 0.5), 0.95)
        prev_p = base_price

        for i, (p_date, p_price) in enumerate(preds_prices):
            change = p_price - prev_p
            change_pct = (change / prev_p) * 100

            # Range widens with time horizon — 1σ for day1, 1.5σ for day2, 2σ for day3
            sigma_mult = 1.0 + i * 0.5
            daily_range = p_price * daily_volatility * sigma_mult
            price_low  = round(p_price - daily_range, 0) if p_price > 1000 else round(p_price - daily_range, 2)
            price_high = round(p_price + daily_range, 0) if p_price > 1000 else round(p_price + daily_range, 2)

            # Confidence decreases further out
            conf = round(confidence_base - (i * 0.04), 2)

            predictions_out.append(PredictionDay(
                date=str(p_date),
                price=round(p_price, 0) if p_price > 1000 else round(p_price, 2),
                price_low=price_low,
                price_high=price_high,
                change_pct=round(change_pct, 2),
                confidence=conf
            ))
            prev_p = p_price

        # 4. Recommendation Logic
        if len(preds_prices) > 0:
            final_pred_price = preds_prices[-1][1]
            total_expected_return = (final_pred_price - base_price) / base_price * 100
        else:
            total_expected_return = 0

        current_rsi = float(df['RSI_14'].iloc[-1])

        if total_expected_return > 2.0 and current_rsi < 70:
            recommendation = "BUY"
        elif total_expected_return < -2.0 or current_rsi > 80:
            recommendation = "SELL"
        else:
            recommendation = "HOLD"

        target_price = base_price * (1 + max(total_expected_return/100, 0.03)) if recommendation == "BUY" else base_price * 0.95
        stop_loss = base_price * 0.95 if recommendation == "BUY" else base_price * 1.05

        return PredictionResponse(
            ticker=ticker,
            model_name="XGBoost",
            model_accuracy=model_accuracy,
            predictions=predictions_out,
            recommendation=recommendation,
            confidence=round(confidence_base, 2),
            stop_loss=round(stop_loss, 0) if base_price > 1000 else round(stop_loss, 2),
            entry=round(base_price, 0) if base_price > 1000 else round(base_price, 2),
            target=round(target_price, 0) if base_price > 1000 else round(target_price, 2)
        )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
