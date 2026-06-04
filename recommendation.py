import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def generate_recommendation(current_price, forecast_price, sentiment):
    # Kunci parameter agar output analitis, deterministik, dan tidak berhalusinasi
    generation_config = {
        "temperature": 0.1,
        "top_p": 0.8,
        "max_output_tokens": 800,
    }

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config=generation_config
    )

    prompt = f"""
    Anda adalah asisten analis kuantitatif pasar saham. Tugas Anda HANYA mensintesis data yang diberikan.
    DILARANG memberikan saran keuangan pribadi, menjanjikan keuntungan, atau mengarang data fundamental lain.

    DATA INPUT:
    - Harga Saat Ini: Rp {current_price:,.2f}
    - Prediksi Harga (H+1): Rp {forecast_price:,.2f}
    - Sentimen Berita Dominan: {sentiment['sentiment']} (Skor Model: {sentiment['score']})
    - Sinyal Sentimen: {sentiment['buy_hold_sell']}
    - Ringkasan Berita: {sentiment['summary']}

    INSTRUKSI OUTPUT:
    Berikan analisis dengan format markdown persis seperti ini tanpa kalimat pembuka/penutup tambahan:

    **1. Sintesis Data Kuantitatif & Sentimen**
    (Jelaskan korelasi antara arah prediksi harga H+1 dengan sentimen berita saat ini secara objektif. Maksimal 2 paragraf padat)

    **2. Identifikasi Risiko**
    (Sebutkan minimal 2 risiko spesifik berdasarkan sentimen berita atau ketidakpastian prediksi pergerakan harga tersebut)

    **3. Konklusi Sinyal Indikatif**
    (Berikan kesimpulan BUY, HOLD, atau SELL murni berdasarkan agregasi sinyal teknikal dan sentimen di atas, disertai 1 kalimat alasan utama)

    ---
    *Disclaimer: Analisis ini digenerasi secara otomatis oleh AI berdasarkan indikator teknikal historis dan sentimen publik terbatas. Keputusan investasi sepenuhnya berada di tangan investor.*
    """

    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Gagal menghasilkan rekomendasi AI. Error: {e}"