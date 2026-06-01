import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

genai.configure(
    api_key=os.getenv("GEMINI_API_KEY")
)

def generate_recommendation(
        current_price,
        forecast_price,
        sentiment):

    model = genai.GenerativeModel("gemini-2.5-flash")

    prompt = f"""
    Buat rekomendasi investasi.

    Harga saat ini:
    {current_price}

    Forecast:
    {forecast_price}

    Sentimen:
    {sentiment}

    Berikan:
    1. Ringkasan
    2. Risiko
    3. Rekomendasi BUY/HOLD/SELL
    """

    response = model.generate_content(prompt)

    return response.text