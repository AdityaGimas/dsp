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
        print(f"[prediction v2-return] REQUEST ticker={ticker}", flush=True)
        # 1. Fetch Data
        t = yf.Ticker(ticker)
        df = t.history(period="2y", auto_adjust=True)
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

        # --- Fitur RELATIF (stasioner) supaya model tidak bergantung pada level
        #     harga absolut. Ini mencegah prediksi "nyangkut" di rentang harga lama
        #     saat harga menembus level terendah/tertinggi baru. ---
        df['Close_SMA7_ratio']  = df['Close'] / df['SMA_7'] - 1
        df['Close_SMA21_ratio'] = df['Close'] / df['SMA_21'] - 1
        df['SMA7_SMA21_ratio']  = df['SMA_7'] / df['SMA_21'] - 1
        df['BB_pct']            = (df['Close'] - df['BB_Low']) / (df['BB_High'] - df['BB_Low'])
        df['MACD_norm']         = df['MACD'] / df['Close']
        df['MACD_sig_norm']     = df['MACD_Signal'] / df['Close']
        vol_ma = df['Volume'].rolling(20).mean()
        df['Volume_ratio']      = df['Volume'] / vol_ma

        df.replace([np.inf, -np.inf], np.nan, inplace=True)
        df.dropna(inplace=True)

        if len(df) < 30:
            raise ValueError("Data historis setelah feature engineering tidak cukup.")

        # Fitur tanpa harga absolut -> semuanya rasio/indikator ternormalisasi.
        features = ['RSI_14', 'MACD_norm', 'MACD_sig_norm', 'BB_pct',
                    'Close_SMA7_ratio', 'Close_SMA21_ratio', 'SMA7_SMA21_ratio',
                    'Return_1d', 'Return_3d', 'Volatility', 'Volume_ratio']
        X = df[features]

        # Estimate daily volatility for range calculation
        daily_volatility = float(df['Return_1d'].rolling(20).std().iloc[-1])

        predictions_out = []
        base_price = float(df['Close'].iloc[-1])
        today = datetime.date.today()
        current_date = today

        last_features = pd.DataFrame([X.iloc[-1].values], columns=features)

        # 3. Training & Prediction — 3 trading days ahead.
        #    TARGET = RETURN (persentase perubahan) n hari ke depan, BUKAN harga absolut.
        #    Return bersifat stasioner (berpusat ~0) sehingga XGBoost tidak terkurung
        #    di rentang harga lama dan prediksi selalu relatif terhadap harga sekarang.
        preds_prices = []
        per_horizon_acc = []
        model_accuracy = 0.0

        actual_days = 0
        loop_date = current_date

        while actual_days < 3:
            loop_date += datetime.timedelta(days=1)
            if loop_date.weekday() >= 5:  # Skip weekend
                continue
            actual_days += 1

            df[f'Target_ret_{actual_days}'] = df['Close'].shift(-actual_days) / df['Close'] - 1.0
            train_df = df.dropna(subset=[f'Target_ret_{actual_days}'])

            if len(train_df) < 20:
                continue

            X_train = train_df[features]
            y_train = train_df[f'Target_ret_{actual_days}']

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

            # Validasi MAPE berbasis HARGA (rekonstruksi dari return) agar akurasi
            # tetap sebanding dengan versi sebelumnya.
            split = int(len(train_df) * 0.8)
            X_val      = X_train.iloc[split:]
            close_val  = train_df['Close'].iloc[split:]
            y_val_ret  = y_train.iloc[split:]
            pred_val_ret = model.predict(X_val)
            actual_val_price = close_val * (1.0 + y_val_ret)
            pred_val_price   = close_val * (1.0 + pred_val_ret)
            mape = np.mean(np.abs((actual_val_price - pred_val_price) / actual_val_price)) * 100
            acc_h = max(0.0, 100.0 - mape)
            model_accuracy += acc_h

            pred_ret = float(model.predict(last_features)[0])
            pred_price = base_price * (1.0 + pred_ret)
            preds_prices.append((loop_date, float(pred_price)))
            per_horizon_acc.append(acc_h)

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

            # Range widens with time horizon — 1sigma for day1, 1.5sigma for day2, 2sigma for day3
            sigma_mult = 1.0 + i * 0.5
            daily_range = p_price * daily_volatility * sigma_mult
            price_low  = round(p_price - daily_range, 0) if p_price > 1000 else round(p_price - daily_range, 2)
            price_high = round(p_price + daily_range, 0) if p_price > 1000 else round(p_price + daily_range, 2)

            # Confidence per horizon: diturunkan dari akurasi validasi (100 - MAPE)
            # horizon ybs. Horizon lebih jauh biasanya MAPE lebih besar -> conf turun
            # secara alami (data-driven), bukan pengurangan tetap. Clamp sbg pengaman.
            acc_i = per_horizon_acc[i] if i < len(per_horizon_acc) else model_accuracy
            conf = round(min(max(acc_i / 100.0, 0.45), 0.95), 2)

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

        print(f"[prediction v2-return] {ticker} base={base_price:.2f} preds={[round(p[1], 2) for p in preds_prices]} acc={model_accuracy}", flush=True)

        return PredictionResponse(
            ticker=ticker,
            model_name="XGBoost v2 (return)",
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
