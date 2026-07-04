"""Groq LLM API proxy — menggunakan model berbeda untuk tiap endpoint
agar tidak cepat kena rate limit free tier."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx, os, json, threading
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Model berbeda tiap endpoint -> rate limit tidak cepat habis
MODEL_TECHNICAL  = "llama-3.3-70b-versatile"
MODEL_NEWS       = "llama-3.3-70b-versatile"
MODEL_NEWS2      = "qwen/qwen3-32b"
MODEL_FINAL_RECO = "llama-3.3-70b-versatile"


# Pool API key + rotasi (round-robin) + fallback otomatis.
# Sumber key digabung urutan: list koma -> bernomor -> tunggal.
#   GROQ_API_KEYS  = "gsk_a,gsk_b,gsk_c"
#   GROQ_API_KEY_1 = gsk_a / GROQ_API_KEY_2 = ...
#   GROQ_API_KEY   = gsk_a   (kompatibel lama)
def get_key_pool() -> list:
    keys = []
    multi = os.getenv("GROQ_API_KEYS", "")
    if multi:
        keys += [k.strip() for k in multi.split(",")]
    i = 1
    while True:
        k = os.getenv(f"GROQ_API_KEY_{i}", "").strip()
        if not k:
            break
        keys.append(k)
        i += 1
    single = os.getenv("GROQ_API_KEY", "").strip()
    if single:
        keys.append(single)
    seen, out = set(), []
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


_rr_lock = threading.Lock()
_rr_index = 0


def _next_start(n: int) -> int:
    """Round-robin: tiap pemanggilan dimulai dari key giliran berikutnya."""
    global _rr_index
    with _rr_lock:
        idx = _rr_index % n
        _rr_index = (_rr_index + 1) % n
    return idx


def get_key(req_key: Optional[str]) -> str:
    """Kompatibilitas lama: 1 key (req override, atau key pertama dari pool)."""
    if req_key:
        return req_key
    pool = get_key_pool()
    if not pool:
        raise HTTPException(400, "Groq API key tidak ditemukan. Set GROQ_API_KEY atau GROQ_API_KEYS di .env, atau isi via tombol 'Groq API Key'.")
    return pool[0]


_ROTATE_CODES = {429, 401, 403, 408, 500, 502, 503, 504}


async def groq_chat_rotate(messages: list, model: str, max_tokens: int = 700, api_key: Optional[str] = None, json_mode: bool = False, reasoning_effort: Optional[str] = None) -> dict:
    """Panggil Groq dengan rotasi key + fallback bila kena limit. Error hanya
    dilempar bila SEMUA key gagal."""
    pool = [api_key.strip()] if api_key else get_key_pool()
    if not pool:
        raise HTTPException(400, "Groq API key tidak ditemukan. Set GROQ_API_KEY atau GROQ_API_KEYS di .env, atau isi via tombol 'Groq API Key'.")
    n = len(pool)
    start = _next_start(n)
    last_detail = ""
    for offset in range(n):
        key = pool[(start + offset) % n]
        try:
            return await groq_chat(messages, key, model, max_tokens, json_mode=json_mode, reasoning_effort=reasoning_effort)
        except HTTPException as e:
            last_detail = str(e.detail)
            if e.status_code in _ROTATE_CODES:
                continue
            raise
    raise HTTPException(429, f"Semua {n} Groq API key kena limit atau gagal. Terakhir: {last_detail[:200]}")


async def groq_chat(messages: list, api_key: str, model: str, max_tokens: int = 700, json_mode: bool = False, reasoning_effort: Optional[str] = None) -> dict:
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}
    if json_mode:
        # Paksa Groq mengembalikan JSON valid (JSON mode, OpenAI-compatible).
        payload["response_format"] = {"type": "json_object"}
    if reasoning_effort:
        # Untuk model reasoning (mis. Qwen3): "none" mematikan thinking -> JSON bersih.
        payload["reasoning_effort"] = reasoning_effort
    async with httpx.AsyncClient(timeout=40) as c:
        r = await c.post(GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload
        )
        if not r.is_success:
            raise HTTPException(r.status_code, f"Groq API error: {r.text[:300]}")
        return r.json()


def parse_json(text: str) -> dict:
    clean = text.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Ambil objek JSON pertama..terakhir bila ada teks tambahan di sekitarnya.
        start, end = clean.find("{"), clean.rfind("}")
        if start != -1 and end > start:
            return json.loads(clean[start:end + 1])
        raise


# Skema output (string biasa, BUKAN contoh angka) -> model wajib mengganti
# tiap placeholder <...> dengan nilai hasil analisis nyata, lalu balas JSON.
TECH_SCHEMA = (
    '{"price_tomorrow": <angka Rupiah>, "price_tomorrow_low": <angka>, "price_tomorrow_high": <angka>, '
    '"day2_price": <angka>, "day2_low": <angka>, "day2_high": <angka>, '
    '"day3_price": <angka>, "day3_low": <angka>, "day3_high": <angka>, '
    '"day1_confidence": <0.0-1.0>, "day2_confidence": <0.0-1.0>, "day3_confidence": <0.0-1.0>, '
    '"price_range_3d": {"min": <angka>, "max": <angka>}, '
    '"recommendation": "BUY|SELL|HOLD", "confidence": <0.0-1.0>, '
    '"reasons": ["alasan singkat 1", "alasan 2", "alasan 3"], '
    '"summary": "<2 kalimat: arah harga + alasan utama>", '
    '"detailed_explanation": "<paragraf naratif yang menjelaskan SEMUA nilai indikator secara lengkap>"}'
)

NEWS_SCHEMA = (
    '{"main_theme": "<1 kalimat tema utama>", "summary": "<2-3 kalimat>", '
    '"sentiment_direction": "Bullish|Bearish|Netral", '
    '"key_factors": ["faktor 1", "faktor 2", "faktor 3"], '
    '"news_recommendation": "BUY|SELL|HOLD", "news_confidence": <0.0-1.0>}'
)

FINAL_SCHEMA = (
    '{"final_recommendation": "BUY|SELL|HOLD", "overall_confidence": <0.0-1.0>, '
    '"signal_agreement": "Sepakat|Mayoritas|Bertentangan", '
    '"entry_price": <angka>, "stop_loss": <angka>, '
    '"take_profit_1": <angka>, "take_profit_2": <angka>, '
    '"risk_reward_ratio": <angka>, "summary": "<2-3 kalimat ringkasan keputusan>", '
    '"factor_analysis": ['
    '{"factor": "Prediksi ML (XGBoost)", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan 1-2 kalimat>"},'
    '{"factor": "Analisis Teknikal LLM", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "RSI (Momentum)", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "MACD (Tren)", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "Moving Average", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "Bollinger Bands", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "Stochastic", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "Volume", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "Sentimen Berita", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"},'
    '{"factor": "Makro Ekonomi", "signal": "BUY|SELL|HOLD", "weight": <0-100>, "score": <0-100>, "explanation": "<penjelasan>"}'
    ']}'
)

MACRO_SCHEMA = (
    '{"summary": "<1-2 kalimat ringkasan tingkat atas>", '
    '"impact_on_market": "Positif|Negatif|Netral", '
    '"detailed_analysis": "<paragraf naratif yang menjelaskan SEMUA data makro (IHSG, USDIDR, BIRate, GDP, Inflation) dan dampaknya terhadap iklim investasi pasar saham>"}'
)

# 1. TEKNIKAL
class TechReq(BaseModel):
    ticker: str
    current_price: float
    indicators: dict
    ml_prediction: Optional[dict] = None
    api_key: Optional[str] = None


@router.post("/technical")
async def groq_technical(req: TechReq):
    """Model: llama-3.3-70b-versatile - analisis teknikal -> estimasi harga 3 hari."""
    ind = req.indicators
    ml  = req.ml_prediction or {}
    ma  = ind.get('moving_average', {})
    ma_txt = "Golden Cross (MA20>MA50)" if ma.get('golden_cross') else "Death Cross (MA20<MA50)"
    prompt = f"""Kamu analis teknikal saham Indonesia. Analisis data teknikal saham {req.ticker} secara objektif.

HARGA SAAT INI: Rp {req.current_price:,.0f}
- RSI(14): {ind.get('rsi', {}).get('value', '?')} - {ind.get('rsi', {}).get('signal', '?')}
- MACD: {ind.get('macd', {}).get('value', '?')} Hist: {ind.get('macd', {}).get('histogram', '?')} - {ind.get('macd', {}).get('signal', '?')}
- MA20/MA50: {ma_txt}
- Bollinger: {ind.get('bollinger_bands', {}).get('position', '?')}
- Stochastic: {ind.get('stochastic', {}).get('value', '?')} - {ind.get('stochastic', {}).get('signal', '?')}
- Volume Ratio: {ind.get('volume_ratio', {}).get('value', '?')}x
- Referensi model ML: {ml.get('recommendation', '?')} (conf {round(ml.get('confidence', 0) * 100)}%)

ATURAN WAJIB (ikuti dengan ketat):
1. Hitung estimasi harga 3 hari ke depan dari DATA NYATA di atas. Sertakan rentang low-high realistis sesuai volatilitas. JANGAN menyalin angka contoh apa pun.
2. Tentukan arah: bandingkan day3_price terhadap harga sekarang (Rp {req.current_price:,.0f}).
3. "recommendation" HARUS konsisten dengan arah itu:
   - day3_price > +1.5% dari harga sekarang  -> "BUY"
   - day3_price < -1.5% dari harga sekarang  -> "SELL"
   - selain itu (relatif datar)              -> "HOLD"
   DILARANG memberi "BUY" bila harga diprediksi turun, atau "SELL" bila diprediksi naik.
4. "confidence" (0.0-1.0) mencerminkan seberapa kuat & sepakat indikator; turunkan bila sinyal bertentangan.
4b. "day1_confidence", "day2_confidence", "day3_confidence" (0.0-1.0) = keyakinanmu pada prediksi harga MASING-MASING hari (H+1, H+2, H+3), dinilai murni dari kekuatan sinyal, kejelasan tren, dan konsistensi indikator untuk hari tersebut. Nilai boleh berbeda antar hari sesuai keyakinan nyatamu; JANGAN menyamakan ketiganya. JANGAN membuat pola menurun otomatis hanya karena harinya lebih jauh (H+2/H+3) — nilai kecil hanya jika analisisnya memang kurang meyakinkan.
5. "detailed_explanation" WAJIB berisi penjelasan naratif lengkap mengenai semua nilai indikator (RSI, MACD, MA, Bollinger, Stochastic, Volume) secara detail.

Balas HANYA JSON valid berikut tanpa teks lain. Ganti SETIAP placeholder <...> dengan hasil analisismu (angka Rupiah, bukan contoh):
""" + TECH_SCHEMA
    res  = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_TECHNICAL, max_tokens=700, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "source": "groq_technical", **data}


# 2. RINGKASAN BERITA
class NewsReq(BaseModel):
    ticker: str
    articles: List[dict]
    sentiment_summary: Optional[dict] = None
    bert_summary: Optional[dict] = None
    llm_summary: Optional[dict] = None
    sector_filter: Optional[str] = "all"
    api_key: Optional[str] = None


@router.post("/news-summary")
async def groq_news_summary(req: NewsReq):
    """Model: llama-3.3-70b-versatile - ringkas berita + insight."""
    s   = req.sentiment_summary or {}
    b   = req.bert_summary or {}
    l   = req.llm_summary or {}
    
    txt = "\n".join(f"- [{a.get('source', '')}] {a.get('title', '')}" for a in req.articles[:10])
    
    sent_text = f"SENTIMEN TERUKUR: Positif {s.get('positive_pct', 0)}% | Netral {s.get('neutral_pct', 0)}% | Negatif {s.get('negative_pct', 0)}%"
    if b and l:
        sent_text = (
            f"KONSENSUS SENTIMEN:\n"
            f"- Model BERT: Positif {b.get('positive_pct', 0)}% | Netral {b.get('neutral_pct', 0)}% | Negatif {b.get('negative_pct', 0)}%\n"
            f"- Model LLM : Positif {l.get('positive_pct', 0)}% | Netral {l.get('neutral_pct', 0)}% | Negatif {l.get('negative_pct', 0)}%\n"
            f"Tugas tambahan: Dalam 'summary', bandingkan hasil sentimen BERT vs LLM ini, sebutkan apakah mereka sepakat atau berbeda pandangan, dan hubungkan dengan narasi berita utama."
        )

    prompt = f"""Kamu analis pasar modal Indonesia. Ringkas berita saham {req.ticker} secara objektif.
Sektor Fokus: {req.sector_filter.upper()}

BERITA ({len(req.articles)} artikel):
{txt}

{sent_text}

ATURAN:
1. "sentiment_direction" & "news_recommendation" HARUS konsisten dengan komposisi sentimen di atas dan isi berita:
   - mayoritas Positif -> cenderung "Bullish" / "BUY"
   - mayoritas Negatif -> cenderung "Bearish" / "SELL"
   - campuran/seimbang -> "Netral" / "HOLD"
2. Jangan mengarang berita yang tidak ada di daftar.
3. Fokuskan ringkasan pada Sektor: {req.sector_filter.upper()} (jika bukan 'ALL').

Balas HANYA JSON valid berikut tanpa teks lain (ganti tiap placeholder <...> dengan nilai nyata):
""" + NEWS_SCHEMA
    res  = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_NEWS, max_tokens=400, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "source": "groq_news", **data}


# 3. REKOMENDASI AKHIR
class FinalReq(BaseModel):
    ticker: str
    current_price: float
    ml_prediction: Optional[dict] = None
    groq_technical: Optional[dict] = None
    sentiment_summary: Optional[dict] = None
    bert_summary: Optional[dict] = None
    llm_sentiment_summary: Optional[dict] = None
    groq_news: Optional[dict] = None
    macro_data: Optional[dict] = None
    indicators: Optional[dict] = None
    api_key: Optional[str] = None


@router.post("/final-recommendation")
async def final_recommendation(req: FinalReq):
    """Model: llama-3.3-70b-versatile - gabung semua sinyal -> Entry/SL/TP + factor_analysis."""
    ml    = req.ml_prediction  or {}
    gt    = req.groq_technical or {}
    s     = req.sentiment_summary or {}
    bert  = req.bert_summary or {}
    llm_s = req.llm_sentiment_summary or {}
    gn    = req.groq_news      or {}
    macro = req.macro_data or {}
    ind   = req.indicators or {}

    ml_t  = (ml.get("predictions") or [{}])[0].get("price", "?")
    ml_p1 = (ml.get("predictions") or [{}, {}, {}])
    ml_preds = " | ".join(
        f"H+{i+1}: Rp {p.get('price','?'):,} ({p.get('change_pct', 0):+.1f}%)"
        for i, p in enumerate(ml_p1[:3]) if p.get('price')
    ) or "?"

    # --- Indikator teknikal detail ---
    rsi   = ind.get('rsi', {})
    macd  = ind.get('macd', {})
    ma    = ind.get('moving_average', {})
    bb    = ind.get('bollinger_bands', {})
    stoch = ind.get('stochastic', {})
    vol   = ind.get('volume_ratio', {})
    ma_txt = "Golden Cross (MA20>MA50, bullish)" if ma.get('golden_cross') else "Death Cross (MA20<MA50, bearish)"

    ind_str = ""
    if ind:
        ind_str = f"""
INDIKATOR TEKNIKAL:
- RSI(14): {rsi.get('value','?')} → {rsi.get('signal','?')} (oversold <30 bullish, overbought >70 bearish)
- MACD: nilai {macd.get('value','?')}, histogram {macd.get('histogram','?')} → {macd.get('signal','?')}
- MA20/MA50: {ma_txt}, MA20={ma.get('ma20','?')}, MA50={ma.get('ma50','?')}
- Bollinger Bands: posisi harga {bb.get('position','?')}, upper={bb.get('upper','?')}, lower={bb.get('lower','?')}
- Stochastic: K={stoch.get('value','?')} → {stoch.get('signal','?')}
- Volume Ratio: {vol.get('value','?')}x (>1.5 = volume tinggi konfirmasi sinyal)"""

    # --- Makro detail ---
    macro_str = ""
    if macro:
        ihsg     = macro.get("IHSG", {})
        usd      = macro.get("USDIDR", {})
        bi       = macro.get("BIRate", {})
        gdp      = macro.get("GDP", {})
        infl     = macro.get("Inflation", {})
        ihsg_tr  = ihsg.get("trend", {}) or {}
        _wp = ihsg_tr.get("week_pct") or 0
        _mp = ihsg_tr.get("month_pct") or 0
        if ihsg_tr:
            ihsg_trend_txt = "Tren " + str(ihsg_tr.get("direction", "?")) + " (1 minggu " + ("+" if _wp >= 0 else "") + format(_wp, ".2f") + "%, 1 bulan " + ("+" if _mp >= 0 else "") + format(_mp, ".2f") + "%, " + str(ihsg_tr.get("up_days", "?")) + " hari naik vs " + str(ihsg_tr.get("down_days", "?")) + " hari turun dari 10 hari terakhir)"
        else:
            ihsg_trend_txt = "Tren tidak tersedia"
        macro_str = f"""
KONDISI MAKRO INDONESIA:
- IHSG: {ihsg.get('value','?')} (hari ini {ihsg.get('change_pct',0):+.2f}%). {ihsg_trend_txt}. Analisa IHSG sebagai TREN (arah beberapa waktu terakhir), bukan hanya perubahan hari ini.
- USD/IDR: Rp {usd.get('value','?'):,} ({usd.get('change_pct',0):+.2f}%, {'Rupiah melemah' if (usd.get('change_pct') or 0) > 0 else 'Rupiah menguat'})
- BI Rate: {bi.get('value','?')}% ({bi.get('desc','?')})
- PDB (YoY): {gdp.get('value','?')}% ({gdp.get('desc','?')})
- Inflasi (YoY): {infl.get('value','?')}% ({infl.get('desc','?')})"""

    # --- Aliran dana asing (foreign net buy/sell) ---
    ff_payload = None
    ff_market_txt = "- Aliran Dana Asing (pasar): tidak tersedia"
    ff_stock_txt = ""
    try:
        from services.foreign_flow import get_foreign_flow, get_stock_foreign_flow
        _ffall = get_foreign_flow()
        _ffm = (_ffall or {}).get("market")
        _ffs = get_stock_foreign_flow(req.ticker)
        ff_payload = {"market": _ffm, "stock": _ffs, "date": (_ffall or {}).get("date")}
        if _ffm:
            ff_market_txt = "- Aliran Dana Asing (pasar/IHSG): " + str(_ffm.get("status")) + " (net asing Rp " + format(_ffm.get("net") or 0, ",.0f") + ") -> " + ("dana asing MASUK" if (_ffm.get("net") or 0) > 0 else "dana asing KELUAR")
        if _ffs:
            ff_stock_txt = "- Aliran Dana Asing (" + str(req.ticker) + "): " + str(_ffs.get("status")) + " (net asing Rp " + format(_ffs.get("net") or 0, ",.0f") + ")"
    except Exception:
        ff_payload = None

    # --- Sentimen detail ---
    sent_str = ""
    if s or bert or llm_s or gn:
        # Pilih sumber BERT summary: preferensi dari bert_summary (dihitung frontend)
        # fallback ke sentiment_summary (dihitung backend)
        b = bert if bert else s
        l = llm_s if llm_s else {}

        # Bangun baris IndoBERT
        bert_line = (
            f"Positif {b.get('positive_pct', 0)}% | Netral {b.get('neutral_pct', 0)}% "
            f"| Negatif {b.get('negative_pct', 0)}% | Skor: {b.get('score', 50)}/100 "
            f"→ {b.get('overall_label', b.get('overall', '?'))}"
        ) if b else "Data tidak tersedia"

        # Bangun baris LLM per-artikel
        llm_line = (
            f"Positif {l.get('positive_pct', 0)}% | Netral {l.get('neutral_pct', 0)}% "
            f"| Negatif {l.get('negative_pct', 0)}% | Skor: {l.get('score', 50)}/100 "
            f"→ {l.get('overall_label', l.get('overall', '?'))}"
        ) if l else "Data tidak tersedia"

        # Kesimpulan konsensus
        bert_overall = b.get('overall', 'neutral') if b else 'neutral'
        llm_overall  = l.get('overall', 'neutral') if l else 'neutral'
        if bert_overall == llm_overall:
            consensus = f"Kedua model sepakat: sentimen {bert_overall}"
        else:
            consensus = f"Model berbeda pendapat — IndoBERT: {bert_overall}, LLM: {llm_overall}. Pertimbangkan sebagai sinyal campuran."

        sent_str = f"""
SENTIMEN BERITA (DUAL-MODEL):
- IndoBERT (model finetuned): {bert_line}
- LLM per-artikel (Groq):     {llm_line}
- Konsensus: {consensus}
- Ringkasan LLM: Rekomendasi {gn.get('news_recommendation','?')} (conf {round(gn.get('news_confidence',0)*100)}%), arah {gn.get('sentiment_direction','?')}
- Tema utama: {gn.get('main_theme', 'tidak diketahui')}
- Faktor kunci: {', '.join(gn.get('key_factors', []))}"""

    # --- LLM teknikal detail ---
    grok_str = ""
    if gt:
        reasons = gt.get('reasons', [])
        grok_str = f"""
PREDIKSI LLM TEKNIKAL:
- Rekomendasi: {gt.get('recommendation','?')} (conf {round(gt.get('confidence',0)*100)}%)
- H+1: Rp {gt.get('price_tomorrow','?'):,} (rentang {gt.get('price_tomorrow_low','?')}-{gt.get('price_tomorrow_high','?')})
- H+2: Rp {gt.get('day2_price','?'):,} | H+3: Rp {gt.get('day3_price','?'):,}
- Alasan: {'; '.join(reasons)}
- Ringkasan: {gt.get('summary','?')}"""

    prompt = f"""Kamu chief analyst saham Indonesia. Analisis KOMPREHENSIF dan putuskan rekomendasi FINAL untuk {req.ticker}.

HARGA SEKARANG: Rp {req.current_price:,.0f}

PREDIKSI ML (XGBoost):
- Rekomendasi: {ml.get('recommendation','?')} (conf {round(ml.get('confidence',0)*100)}%, akurasi model {ml.get('model_accuracy',0):.1f}%)
- Prediksi: {ml_preds}
- Stop Loss: Rp {ml.get('stop_loss','?'):,} | Target: Rp {ml.get('target','?'):,}
{grok_str}
{ind_str}
{sent_str}
{macro_str}
{ff_market_txt}
{ff_stock_txt}

ATURAN WAJIB:
1. Evaluasi SETIAP faktor di atas dan berikan signal (BUY/SELL/HOLD), weight (kepentingan 0-100), score (kekuatan sinyal 0-100), dan explanation detail dalam bahasa Indonesia.
2. "weight" tiap faktor TIDAK boleh sama rata - bedakan sesuai besar pengaruhnya terhadap rekomendasi akhir, dengan TOTAL seluruh weight HARUS = 100. Gunakan bobot dasar berikut sebagai acuan (boleh kamu sesuaikan hingga plus/minus 3 poin sesuai kondisi terkini, tetapi totalnya tetap 100): Prediksi ML (XGBoost)=20, Analisis Teknikal LLM=12, MACD (Tren)=10, Moving Average=10, RSI (Momentum)=9, Sentimen Berita=9, Makro Ekonomi=9, Volume=8, Bollinger Bands=7, Stochastic=6. Faktor berbobot besar (Prediksi ML, MACD, Moving Average) harus lebih menentukan arah rekomendasi dibanding faktor berbobot kecil (Stochastic, Bollinger Bands).
2b. Untuk faktor "Makro Ekonomi", di dalam "explanation" WAJIB sebutkan sub-faktor makro mana (IHSG, USD/IDR, BI Rate, Inflasi, atau PDB) yang PALING mempengaruhi pergerakan saham ini saat ini beserta alasan singkatnya, dan urutkan pengaruhnya dari yang terbesar. Pertimbangkan juga ALIRAN DANA ASING (net buy/sell): net buy berarti dana asing masuk (positif), net sell berarti dana asing keluar (tekanan jual).
3. Timbang semua sinyal. Mayoritas bullish -> condong "BUY"; mayoritas bearish -> condong "SELL"; bila bertentangan -> "HOLD".
4. "final_recommendation" HARUS konsisten dengan level harga:
   - "BUY"  : take_profit_1 & take_profit_2 DI ATAS entry_price, stop_loss DI BAWAH entry_price
   - "SELL" : take_profit_1 & take_profit_2 DI BAWAH entry_price, stop_loss DI ATAS entry_price
   - "HOLD" : level rapat di sekitar harga sekarang
5. "risk_reward_ratio" = jarak ke take_profit_1 dibagi jarak ke stop_loss, harus > 0.
6. Semua harga dalam Rupiah dan masuk akal terhadap harga sekarang Rp {req.current_price:,.0f}.
7. factor_analysis harus berisi TEPAT 10 faktor sesuai schema.

Balas HANYA JSON valid berikut tanpa teks lain (ganti tiap placeholder <...> dengan nilai nyata):
""" + FINAL_SCHEMA
    res  = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_FINAL_RECO, max_tokens=1200, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"ticker": req.ticker, "foreign_flow": ff_payload, **data}


# 4. MAKRO EKONOMI
class MacroReq(BaseModel):
    macro_data: dict
    api_key: Optional[str] = None

@router.post("/macro")
async def groq_macro(req: MacroReq):
    """Model: llama-3.3-70b-versatile - analisis data makro ekonomi."""
    m = req.macro_data
    ihsg = m.get('IHSG', {})
    usd = m.get('USDIDR', {})
    bi = m.get('BIRate', {})
    gdp = m.get('GDP', {})
    infl = m.get('Inflation', {})
    ihsg_tr = ihsg.get("trend", {}) or {}
    _wp = ihsg_tr.get("week_pct") or 0
    _mp = ihsg_tr.get("month_pct") or 0
    if ihsg_tr:
        ihsg_trend_txt = "Tren " + str(ihsg_tr.get("direction", "?")) + " (1 minggu " + ("+" if _wp >= 0 else "") + format(_wp, ".2f") + "%, 1 bulan " + ("+" if _mp >= 0 else "") + format(_mp, ".2f") + "%, " + str(ihsg_tr.get("up_days", "?")) + " naik vs " + str(ihsg_tr.get("down_days", "?")) + " turun / 10 hari)"
    else:
        ihsg_trend_txt = "Tren tidak tersedia"
    
    ff = m.get("ForeignFlow", {}) or {}
    if ff:
        ff_txt = "Aliran dana asing pasar: " + str(ff.get("status", "?")) + " (net Rp " + format(ff.get("net") or 0, ",.0f") + ")"
    else:
        ff_txt = "Aliran dana asing: tidak tersedia"
    prompt = f"""Kamu analis ekonomi makro Indonesia. Analisis data makro terkini dan dampaknya terhadap pasar saham secara keseluruhan.

DATA MAKRO TERKINI:
- IHSG: {ihsg.get('value','?')} (hari ini {ihsg.get('change_pct',0):+.2f}%). {ihsg_trend_txt}
- USD/IDR: Rp {usd.get('value','?'):,} ({usd.get('change_pct',0):+.2f}%)
- BI Rate: {bi.get('value','?')}% ({bi.get('desc','?')})
- PDB (YoY): {gdp.get('value','?')}% ({gdp.get('desc','?')})
- Inflasi (YoY): {infl.get('value','?')}% ({infl.get('desc','?')})
- {ff_txt}

ATURAN WAJIB:
1. "impact_on_market" tentukan apakah kondisi makro saat ini cenderung Positif, Negatif, atau Netral untuk pasar saham secara keseluruhan.
2. "detailed_analysis" WAJIB berupa paragraf naratif yang menganalisis kelima data di atas (IHSG, kurs, suku bunga, PDB, dan inflasi) menjadi satu kesatuan cerita mengenai dampaknya terhadap pasar. Khusus IHSG, analisa sebagai TREN (arah pergerakan beberapa waktu terakhir), bukan hanya angka hari ini. Sertakan juga dampak ALIRAN DANA ASING (net buy/sell) terhadap kondisi pasar.

Balas HANYA JSON valid berikut tanpa teks lain (ganti placeholder <...>):
""" + MACRO_SCHEMA
    res = await groq_chat_rotate([{"role": "user", "content": prompt}], MODEL_TECHNICAL, max_tokens=600, api_key=req.api_key, json_mode=True)
    data = parse_json(res["choices"][0]["message"]["content"])
    return {"source": "groq_macro", **data}
