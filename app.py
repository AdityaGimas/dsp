import streamlit as st
import yfinance as yf
import pandas as pd
import plotly.graph_objects as go

from indicators import add_indicators
from forecasting import train_forecast
from news_sentiment import NewsSentiment
from recommendation import generate_recommendation


# =========================
# PAGE CONFIG
# =========================

st.set_page_config(
    page_title="AI Stock Analysis Dashboard",
    page_icon="📈",
    layout="wide"
)

st.title("📈 AI Stock Analysis Dashboard")
st.caption(
    "Forecasting Harga Saham + Sentiment Analysis + AI Recommendation"
)


# =========================
# SIDEBAR
# =========================

st.sidebar.header("Parameter")

ticker = st.sidebar.text_input(
    "Ticker Saham",
    value="BBCA.JK"
)

company_name = st.sidebar.text_input(
    "Nama Perusahaan",
    value="Bank Central Asia"
)

period = st.sidebar.selectbox(
    "Data Historis",
    [
        "6mo",
        "1y",
        "2y",
        "5y"
    ],
    index=2
)

analyze_btn = st.sidebar.button(
    "🚀 Analisis Saham"
)


# =========================
# MAIN PROCESS
# =========================

if analyze_btn:

    try:

        # =========================
        # DOWNLOAD STOCK DATA
        # =========================

        with st.spinner(
            "Mengambil data saham..."
        ):

            df = yf.download(
                ticker,
                period=period,
                progress=False
            )

            # FIX YFINANCE MULTIINDEX
            import pandas as pd

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            df = add_indicators(df)

            if df.empty:
                st.error(
                    "Data saham tidak ditemukan."
                )
                st.stop()

            df = add_indicators(df)

        # =========================
        # FORECASTING
        # =========================

        with st.spinner(
            "Melakukan forecasting..."
        ):

            forecast_price = train_forecast(df)

            current_price = df["Close"].iloc[-1]

            if hasattr(current_price, "item"):
                current_price = current_price.item()

            current_price = float(current_price)

            change_pct = (
                (forecast_price - current_price)
                / current_price
            ) * 100

        # =========================
        # TOP METRICS
        # =========================

        st.subheader("Ringkasan Saham")

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric(
                "Harga Saat Ini",
                f"Rp {current_price:,.2f}"
            )

        with col2:
            st.metric(
                "Forecast",
                f"Rp {forecast_price:,.2f}"
            )

        with col3:
            st.metric(
                "Potensi Perubahan",
                f"{change_pct:.2f}%"
            )

        # =========================
        # STOCK CHART
        # =========================

        st.subheader(
            "Grafik Harga Historis"
        )

        fig = go.Figure()

        fig.add_trace(
            go.Scatter(
                x=df.index,
                y=df["Close"],
                mode="lines",
                name="Close Price"
            )
        )

        fig.update_layout(
            height=500,
            xaxis_title="Tanggal",
            yaxis_title="Harga"
        )

        st.plotly_chart(
            fig,
            use_container_width=True
        )

        # =========================
        # TECHNICAL INDICATORS
        # =========================

        st.subheader(
            "Indikator Teknikal"
        )

        latest = df.iloc[-1]

        ma5 = latest["MA5"]
        rsi = latest["RSI"]
        macd = latest["MACD"]

        if hasattr(ma5, "item"):
            ma5 = ma5.item()

        if hasattr(rsi, "item"):
            rsi = rsi.item()

        if hasattr(macd, "item"):
            macd = macd.item()

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric(
                "MA5",
                round(float(ma5), 2)
            )

        with col2:
            st.metric(
                "RSI",
                round(float(rsi), 2)
            )

        with col3:
            st.metric(
                "MACD",
                round(float(macd), 2)
            )

        # =========================
        # NEWS SENTIMENT
        # =========================

        st.subheader(
            "Analisis Sentimen Berita"
        )

        sentiment_engine = NewsSentiment()

        with st.spinner(
            "Mencari berita..."
        ):

            links = sentiment_engine.get_news(
                company_name
            )

            texts = sentiment_engine.scrape(
                links
            )

        if texts:

            with st.spinner(
                "Menganalisis sentimen..."
            ):

                sentiment_result = (
                    sentiment_engine.sentiment(
                        company_name,
                        texts
                    )
                )

            col1, col2, col3 = st.columns(3)

            with col1:
                st.metric(
                    "Sentiment",
                    sentiment_result[
                        "sentiment"
                    ]
                )

            with col2:
                st.metric(
                    "Score",
                    sentiment_result[
                        "score"
                    ]
                )

            with col3:
                st.metric(
                    "Signal",
                    sentiment_result[
                        "buy_hold_sell"
                    ]
                )

            st.info(
                sentiment_result[
                    "summary"
                ]
            )

            # =========================
            # SHOW LINKS
            # =========================

            with st.expander(
                "Daftar Berita"
            ):

                for link in links:
                    st.write(link)

            # =========================
            # AI RECOMMENDATION
            # =========================

            st.subheader(
                "AI Recommendation"
            )

            recommendation = (
                generate_recommendation(
                    current_price,
                    forecast_price,
                    sentiment_result
                )
            )

            st.success(
                recommendation
            )

        else:

            st.warning(
                "Tidak ditemukan berita yang relevan."
            )

    except Exception as e:

        st.error(
            f"Terjadi error: {e}"
        )

else:

    st.info(
        """
        Masukkan ticker saham dan klik
        tombol Analisis Saham untuk memulai.
        """
    )