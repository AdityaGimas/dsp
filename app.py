import streamlit as st
import yfinance as yf
import pandas as pd
import plotly.graph_objects as go

from indicators import add_indicators
from forecasting import train_forecast
from news_sentiment import NewsSentiment
from recommendation import generate_recommendation

# =========================
# CACHE RESOURCE
# =========================
@st.cache_resource
def load_sentiment_engine():
    return NewsSentiment()

# =========================
# PAGE CONFIG
# =========================
st.set_page_config(
    page_title="AI Stock Analysis Dashboard",
    page_icon="📈",
    layout="wide"
)

st.title("📈 AI Stock Analysis Dashboard")
st.caption("Forecasting Harga Saham + Sentiment Analysis + AI Recommendation")

# =========================
# SIDEBAR
# =========================
st.sidebar.header("Parameter")

LQ45_MAPPING = {
    "BBCA.JK": "Bank Central Asia",
    "ANTM.JK": "Aneka Tambang",
    "BBRI.JK": "Bank Rakyat Indonesia",
    "BMRI.JK": "Bank Mandiri",
    "TLKM.JK": "Telkom Indonesia",
    "GOTO.JK": "GoTo Gojek Tokopedia"
}

selected_ticker = st.sidebar.selectbox(
    "Pilih Saham (LQ-45)",
    options=list(LQ45_MAPPING.keys()),
    format_func=lambda x: f"{x} - {LQ45_MAPPING[x]}" 
)

ticker = selected_ticker
company_name = LQ45_MAPPING[selected_ticker]

period = st.sidebar.selectbox(
    "Data Historis",
    ["6mo", "1y", "2y", "5y"],
    index=2
)

analyze_btn = st.sidebar.button("🚀 Analisis Saham")

# =========================
# STATE INITIALIZATION
# =========================
# Memori untuk menyimpan status apakah analisis sudah berjalan
if 'analyzed' not in st.session_state:
    st.session_state.analyzed = False

# =========================
# MAIN PROCESS (DATA FETCHING)
# =========================
# Blok ini HANYA berjalan ketika tombol ditekan
if analyze_btn:
    try:
        with st.status("Memproses Analisis Saham...", expanded=True) as status:
            
            st.write("📥 Mengunduh data historis...")
            df = yf.download(ticker, period=period, progress=False)

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Validasi ketat: Tangkap data hasil rate-limit yang isinya NaN semua
            if df.empty or ("Close" in df.columns and df["Close"].isna().all()):
                status.update(label="Gagal mengambil data", state="error")
                st.error("Data dari Yahoo Finance kosong atau dilarang akses (rate-limit akibat terlalu sering request). Tunggu sebentar dan coba lagi.")
                st.stop()

            df = add_indicators(df)

            # Validasi pasca-kalkulasi: Cegah masuk ke ML jika baris tersisa terlalu sedikit
            if len(df) < 15:
                status.update(label="Data tidak cukup", state="error")
                st.error("Data bersih yang tersisa terlalu sedikit untuk melatih model AI. Coba perlebar rentang Data Historis.")
                st.stop()

            st.write("🤖 Menjalankan prediksi kuantitatif...")
            forecast_price = train_forecast(df)
            
            current_price = df["Close"].iloc[-1]
            if hasattr(current_price, "item"):
                current_price = current_price.item()
            current_price = float(current_price)

            change_pct = ((forecast_price - current_price) / current_price) * 100

            st.write("📰 Memuat mesin sentimen AI...")
            sentiment_engine = load_sentiment_engine()

            st.write(f"🔍 Mencari berita terkait {company_name}...")
            links = sentiment_engine.get_news(company_name)

            st.write("🌐 Melakukan ekstraksi teks berita...")
            texts = sentiment_engine.scrape(links)

            sentiment_result = None
            recommendation_text = None
            
            if texts:
                st.write("🧠 Menganalisis bobot sentimen...")
                sentiment_result = sentiment_engine.sentiment(company_name, texts)
                
                st.write("⚙️ Menyusun rekomendasi AI...")
                recommendation_text = generate_recommendation(
                    current_price, forecast_price, sentiment_result
                )

            # SIMPAN SEMUA HASIL KE MEMORI (SESSION STATE)
            st.session_state.df = df
            st.session_state.current_price = current_price
            st.session_state.forecast_price = forecast_price
            st.session_state.change_pct = change_pct
            st.session_state.links = links
            st.session_state.texts = texts
            st.session_state.sentiment_result = sentiment_result
            st.session_state.recommendation_text = recommendation_text
            st.session_state.analyzed = True # Beri tanda bahwa data sudah siap

            status.update(label="Analisis Selesai!", state="complete", expanded=False)

    except Exception as e:
        st.error(f"Terjadi error: {e}")

# =========================
# UI RENDERING
# =========================
# Blok ini akan selalu merender antarmuka selama data ada di memori
if st.session_state.analyzed:
    
    # Ambil data dari memori
    df = st.session_state.df
    current_price = st.session_state.current_price
    forecast_price = st.session_state.forecast_price
    change_pct = st.session_state.change_pct
    sentiment_result = st.session_state.sentiment_result
    texts = st.session_state.texts
    links = st.session_state.links
    recommendation_text = st.session_state.recommendation_text

    st.subheader("Ringkasan Saham")
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Harga Saat Ini", f"Rp {current_price:,.2f}")
    with col2:
        st.metric("Forecast", f"Rp {forecast_price:,.2f}")
    with col3:
        st.metric("Potensi Perubahan", f"{change_pct:.2f}%")

    # =========================
    # STOCK CHART & OVERLAYS
    # =========================
    st.subheader("Grafik Harga Historis")

    # Interaktivitas sekarang tidak akan me-reset aplikasi
    overlay_options = st.multiselect(
        "Tampilkan Indikator (Overlay):",
        ["MA5", "MA20"],
        default=[] 
    )

    fig = go.Figure()

    fig.add_trace(
        go.Candlestick(
            x=df.index,
            open=df['Open'],
            high=df['High'],
            low=df['Low'],
            close=df['Close'],
            name="Harga",
            increasing_line_color='green', 
            decreasing_line_color='red'
        )
    )

    colors = {"MA5": "#1f77b4", "MA20": "#ff7f0e"}
    for indicator in overlay_options:
        fig.add_trace(
            go.Scatter(
                x=df.index,
                y=df[indicator],
                mode="lines",
                name=indicator,
                line=dict(color=colors.get(indicator, "black"), width=1.5)
            )
        )

    fig.update_layout(
        height=600,
        xaxis_title="Tanggal",
        yaxis_title="Harga (Rp)",
        xaxis_rangeslider_visible=False, 
        hovermode="x unified", 
        margin=dict(l=0, r=0, t=40, b=0),
        legend=dict(
            orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1
        )
    )

    st.plotly_chart(fig, width="stretch")

    # =========================
    # TECHNICAL INDICATORS
    # =========================
    st.subheader("Indikator Teknikal")
    
    latest = df.iloc[-1]
    ma5 = latest["MA5"]
    rsi = latest["RSI"]
    macd = latest["MACD"]

    if hasattr(ma5, "item"): ma5 = ma5.item()
    if hasattr(rsi, "item"): rsi = rsi.item()
    if hasattr(macd, "item"): macd = macd.item()

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("MA5", round(float(ma5), 2))
    with col2:
        st.metric("RSI", round(float(rsi), 2))
    with col3:
        st.metric("MACD", round(float(macd), 2))

    # =========================
    # NEWS SENTIMENT & AI REC
    # =========================
    st.subheader("Analisis Sentimen Berita")
    
    if texts and sentiment_result:
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Sentiment", sentiment_result["sentiment"])
        with col2:
            st.metric("Score", sentiment_result["score"])
        with col3:
            st.metric("Signal", sentiment_result["buy_hold_sell"])

        st.info(sentiment_result["summary"])

        with st.expander("Daftar Berita"):
            for link in links:
                st.write(link)

        st.subheader("AI Recommendation")
        st.success(recommendation_text)
    else:
        st.warning("Tidak ditemukan berita yang relevan untuk dianalisis.")

elif not analyze_btn and not st.session_state.analyzed:
    st.info("Masukkan ticker saham dan klik tombol Analisis Saham untuk memulai.")