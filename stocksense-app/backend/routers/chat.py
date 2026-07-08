"""Chat AI endpoint — AI Advisor Manajemen Saham IDX via Groq.
Dilengkapi dengan konteks grafik harga, mode analisis, dan format Markdown.
Memakai ulang rotasi multi-API-key & penanganan limit dari grok.py.

Konteks yang dikirim ke AI (semua dari data yang sudah di-fetch di frontend):
  - Harga, RSI, MACD, Golden Cross
  - ML Forecasting: entry, target, stop-loss, prediksi 3 hari, akurasi model
  - Berita & Sentimen: skor agregat, % positif/negatif, top headlines
  - Makro Ekonomi: BI Rate, Inflasi, PDB, IHSG, USD/IDR
  - Grafik Candlestick: periode, tren, high/low
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
import os

from .grok import groq_chat_rotate

router = APIRouter()

# Model multimodal Groq (bisa baca gambar). Bisa di-override lewat .env.
CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

# Label periode chart yang ramah dibaca
_PERIOD_LABEL = {
    "1mo": "1 Bulan Terakhir",
    "3mo": "3 Bulan Terakhir",
    "6mo": "6 Bulan Terakhir",
    "1y": "1 Tahun Terakhir",
    "2y": "2 Tahun Terakhir",
    "5y": "5 Tahun Terakhir",
}


class ChatMessage(BaseModel):
    role: str
    content: str = ""
    image: Optional[str] = None  # data URL base64 (mis. data:image/jpeg;base64,...)


class ChatReq(BaseModel):
    messages: List[ChatMessage]
    stock_context: Optional[dict] = None
    mode: Optional[str] = "general"  # general | technical | news | macro
    api_key: Optional[str] = None
    model: Optional[str] = None


def _rsi_interpretation(rsi: float) -> str:
    """Terjemahkan nilai RSI ke kondisi pasar."""
    if rsi >= 80:
        return "sangat overbought (jenuh beli ekstrem)"
    if rsi >= 70:
        return "overbought (jenuh beli)"
    if rsi >= 60:
        return "cenderung kuat"
    if rsi >= 40:
        return "netral"
    if rsi >= 30:
        return "cenderung lemah"
    if rsi >= 20:
        return "oversold (jenuh jual)"
    return "sangat oversold (jenuh jual ekstrem)"


def _sentiment_label_id(s: str) -> str:
    m = {"positive": "Positif 📈", "negative": "Negatif 📉", "neutral": "Netral ➡️"}
    return m.get(str(s).lower(), str(s))


def _mode_instructions(mode: str) -> str:
    """Instruksi detail per mode — setiap mode punya struktur output, fokus, dan persona berbeda."""

    DATA_REMINDER = (
        "\n\n> ⚠️ **PENTING**: Gunakan HANYA data yang tersedia di bagian 'Konteks Data Dashboard' di bawah. "
        "Jangan mengarang angka atau menggunakan data dari pengetahuan umum jika data spesifik sudah tersedia."
    )

    if mode == "technical":
        return (
            "\n\n## MODE: ANALISIS TEKNIKAL 📊"
            "\nKamu bertindak sebagai **analis teknikal profesional**."
            "\nStruktur jawaban WAJIB:"
            "\n1. **Tren Utama** — Identifikasi tren dominan (uptrend/downtrend/sideways) berdasarkan candlestick dan data chart"
            "\n2. **Analisis Indikator** — Bahas RSI (nilai aktual dari konteks, overbought/oversold/divergensi), MACD (sinyal dari konteks), MA (golden/death cross dari konteks), Bollinger Bands (jika tersedia)"
            "\n3. **Level Kunci** — Sebutkan 1-2 level support dan 1-2 level resistance terdekat (gunakan chart_high dan chart_low dari konteks sebagai referensi)"
            "\n4. **Pola Chart** — Identifikasi pola candlestick atau chart pattern yang terbentuk (jika ada)"
            "\n5. **Setup Trading** — Entry ideal (gunakan ml_entry jika tersedia), stop loss (gunakan ml_stop_loss), target harga (gunakan ml_target), sebutkan risk/reward ratio"
            "\n6. **Kesimpulan Teknikal** — Verdict: BELI / HOLD / JUAL berdasarkan analisis teknikal dan prediksi model ML"
            "\nLarangan: JANGAN membahas berita atau makroekonomi kecuali relevan langsung dengan pola teknikal."
            + DATA_REMINDER
        )
    if mode == "news":
        return (
            "\n\n## MODE: ANALISIS BERITA & SENTIMEN 📰"
            "\nKamu bertindak sebagai **analis sentimen pasar dan strategi investasi berbasis berita**."
            "\nStruktur jawaban WAJIB:"
            "\n1. **Sentimen Pasar** — Tentukan sentimen saat ini berdasarkan data sentimen di konteks (overall, skor, % positif/negatif). Sebutkan angka pastinya."
            "\n2. **Berita Terbaru** — Bahas 3-5 headline berita yang tersedia di konteks. Jelaskan dampaknya ke harga."
            "\n3. **Katalis Positif** — Identifikasi berita/event positif dari headlines yang tersedia"
            "\n4. **Katalis Negatif & Risiko** — Identifikasi berita/event negatif dari headlines yang tersedia"
            "\n5. **Dampak ke Harga** — Apakah sentimen saat ini mendukung arah prediksi model ML?"
            "\n6. **Proyeksi Sentimen** — Apakah tren sentimen membaik atau memburuk?"
            "\n7. **Kesimpulan** — Apakah sentimen pasar mendukung posisi BELI/HOLD/JUAL?"
            "\nLarangan: Jangan mengarang berita. Gunakan HANYA headlines yang tersedia di konteks."
            + DATA_REMINDER
        )
    if mode == "macro":
        return (
            "\n\n## MODE: ANALISIS MAKRO EKONOMI 🌍"
            "\nKamu bertindak sebagai **ekonom makro dan analis pasar modal**."
            "\nStruktur jawaban WAJIB:"
            "\n1. **Kondisi Makro Indonesia** — Suku bunga BI Rate (gunakan nilai aktual dari konteks, arah kebijakan), inflasi YoY (gunakan nilai aktual dari konteks dan dampaknya ke margin), PDB YoY"
            "\n2. **Kondisi Pasar Modal** — IHSG (nilai aktual + perubahan dari konteks), sentimen pasar saham secara umum"
            "\n3. **Nilai Tukar** — USD/IDR (nilai aktual dari konteks) dan dampaknya ke emiten"
            "\n4. **Dampak Langsung ke Emiten** — Bagaimana kondisi makro di atas memengaruhi bisnis emiten ini secara konkret"
            "\n5. **Skenario Risiko Makro** — Apa yang terjadi jika BI Rate naik lagi? Rupiah melemah? Inflasi memburuk?"
            "\n6. **Outlook 3-6 Bulan** — Prediksi kondisi makro dan implikasinya ke harga saham"
            "\n7. **Kesimpulan** — Apakah kondisi makro mendukung atau menghambat apresiasi saham ini?"
            "\nLarangan: JANGAN menggunakan angka makro dari pengetahuan umum jika data tersedia di konteks."
            + DATA_REMINDER
        )
    # default: general
    return (
        "\n\n## MODE: ANALISIS UMUM (HOLISTIK) 🔍"
        "\nKamu memberikan **analisis investasi komprehensif dan seimbang** yang mencakup semua aspek."
        "\nStruktur jawaban WAJIB:"
        "\n1. **Ringkasan Eksekutif** — 2-3 kalimat kesimpulan utama tentang kondisi saham saat ini"
        "\n2. **Snapshot Teknikal** — Tren, RSI (nilai aktual), MACD (sinyal aktual), level support/resistance kunci"
        "\n3. **Prediksi Model ML** — Sebutkan rekomendasi, entry, target, stop-loss, dan akurasi model dari konteks"
        "\n4. **Sentimen & Berita** — Skor sentimen aktual (% positif/negatif), berita terbaru dari headlines di konteks"
        "\n5. **Kondisi Makro** — BI Rate, inflasi, IHSG, USD/IDR dari konteks"
        "\n6. **Risiko Utama** — 2-3 risiko paling signifikan yang perlu diwaspadai investor"
        "\n7. **Scorecard Investasi**:"
        "\n   | Aspek | Status | Keterangan |"
        "\n   |-------|--------|-----------|"
        "\n   | Teknikal | 🟢/🟡/🔴 | ... |"
        "\n   | Prediksi ML | 🟢/🟡/🔴 | ... |"
        "\n   | Sentimen Berita | 🟢/🟡/🔴 | ... |"
        "\n   | Makro & Ekonomi | 🟢/🟡/🔴 | ... |"
        "\n8. **Rekomendasi Akhir** — **BELI / HOLD / JUAL** dengan level harga target dan stop-loss dari data prediksi"
        "\nBerikan analisis yang actionable. Gunakan semua data dari konteks dashboard sebagai basis analisis."
        + DATA_REMINDER
    )


def _build_technical_context(ctx: dict, lines: list):
    """Tambah blok indikator teknikal ke lines."""
    lines.append("\n### 📊 Indikator Teknikal")

    if ctx.get("rsi") is not None:
        rsi_val = ctx.get("rsi")
        rsi_interp = _rsi_interpretation(float(rsi_val))
        lines.append(f"- **RSI (14)**: {round(float(rsi_val), 1)} → kondisi {rsi_interp}")

    if ctx.get("macd_signal") is not None:
        lines.append(f"- **Sinyal MACD**: {ctx.get('macd_signal')}")

    if ctx.get("golden_cross") is not None:
        gc = ctx.get("golden_cross")
        lines.append(f"- **Golden Cross (MA20/MA50)**: {'Ya ✅ (sinyal bullish)' if gc else 'Tidak ❌ (belum golden cross)'}")

    # Chart summary
    chart_period = ctx.get("chart_period")
    if chart_period:
        period_label = _PERIOD_LABEL.get(chart_period, chart_period)
        lines.append(f"\n**Ringkasan Grafik ({period_label}):**")
        if ctx.get("chart_trend"):
            trend_icon = "📈" if ctx.get("chart_trend") == "bullish" else "📉"
            lines.append(f"- Tren: **{ctx.get('chart_trend').upper()}** {trend_icon}")
        if ctx.get("chart_change_pct") is not None:
            lines.append(f"- Perubahan dalam periode: **{ctx.get('chart_change_pct')}**")
        if ctx.get("chart_high") is not None:
            high_fmt = f"Rp {ctx.get('chart_high'):,.0f}" if isinstance(ctx.get("chart_high"), (int, float)) else str(ctx.get("chart_high"))
            lines.append(f"- Tertinggi periode: **{high_fmt}** (potensi resistance)")
        if ctx.get("chart_low") is not None:
            low_fmt = f"Rp {ctx.get('chart_low'):,.0f}" if isinstance(ctx.get("chart_low"), (int, float)) else str(ctx.get("chart_low"))
            lines.append(f"- Terendah periode: **{low_fmt}** (potensi support)")


def _build_prediction_context(ctx: dict, lines: list):
    """Tambah blok prediksi ML/XGBoost ke lines."""
    has_pred = any(ctx.get(k) is not None for k in [
        "ml_recommendation", "ml_confidence", "ml_entry", "ml_target", "ml_stop_loss"
    ])
    if not has_pred:
        return

    lines.append("\n### 🤖 Prediksi Model ML (XGBoost)")
    lines.append(f"> Data ini adalah hasil model prediksi machine learning, bukan opini manusia.")

    if ctx.get("ml_recommendation") is not None:
        conf = ctx.get("ml_confidence")
        conf_pct = f"{round(float(conf) * 100)}%" if conf is not None else "-"
        acc = ctx.get("ml_accuracy")
        acc_str = f" | Akurasi model: **{acc}%**" if acc is not None else ""
        lines.append(f"- **Rekomendasi**: **{ctx.get('ml_recommendation')}** (confidence: {conf_pct}){acc_str}")

    if ctx.get("ml_entry") is not None:
        entry_fmt = f"Rp {ctx.get('ml_entry'):,.0f}" if isinstance(ctx.get("ml_entry"), (int, float)) else str(ctx.get("ml_entry"))
        lines.append(f"- **Harga Entry**: {entry_fmt}")

    if ctx.get("ml_target") is not None:
        target_fmt = f"Rp {ctx.get('ml_target'):,.0f}" if isinstance(ctx.get("ml_target"), (int, float)) else str(ctx.get("ml_target"))
        lines.append(f"- **Target Harga**: {target_fmt}")

    if ctx.get("ml_stop_loss") is not None:
        sl_fmt = f"Rp {ctx.get('ml_stop_loss'):,.0f}" if isinstance(ctx.get("ml_stop_loss"), (int, float)) else str(ctx.get("ml_stop_loss"))
        lines.append(f"- **Stop Loss**: {sl_fmt}")

    # Kalkulasi Risk/Reward jika ada data lengkap
    try:
        entry = float(ctx.get("ml_entry", 0))
        target = float(ctx.get("ml_target", 0))
        sl = float(ctx.get("ml_stop_loss", 0))
        if entry and target and sl and entry != sl:
            reward = abs(target - entry)
            risk = abs(entry - sl)
            rr = round(reward / risk, 2) if risk else 0
            lines.append(f"- **Risk/Reward Ratio**: 1:{rr}")
    except Exception:
        pass

    # Prediksi 3 hari ke depan
    preds = ctx.get("ml_predictions", [])
    if preds:
        lines.append("\n**Proyeksi Harga 3 Hari Trading ke Depan:**")
        lines.append("| Hari | Tanggal | Harga Prediksi | Perubahan |")
        lines.append("|------|---------|----------------|-----------|")
        for i, p in enumerate(preds[:3]):
            price = p.get("price", 0)
            chg = p.get("change_pct", 0)
            price_fmt = f"Rp {float(price):,.0f}" if price else "-"
            chg_fmt = f"{'+' if float(chg) >= 0 else ''}{float(chg):.2f}%" if chg is not None else "-"
            lines.append(f"| Hari {i+1} | {p.get('date', '-')} | {price_fmt} | {chg_fmt} |")


def _build_sentiment_context(ctx: dict, lines: list):
    """Tambah blok berita & sentimen ke lines."""
    has_sentiment = any(ctx.get(k) is not None for k in [
        "sentiment_overall", "sentiment_score", "sentiment_positive_pct"
    ])
    has_news = bool(ctx.get("news_headlines"))
    if not has_sentiment and not has_news:
        return

    lines.append("\n### 📰 Berita & Sentimen Pasar")
    lines.append("> Data sentimen ini dianalisis oleh model IndoBERT yang sudah di-finetune khusus untuk pasar saham Indonesia.")

    if has_sentiment:
        overall = ctx.get("sentiment_overall", "neutral")
        score = ctx.get("sentiment_score")
        pos_pct = ctx.get("sentiment_positive_pct")
        neg_pct = ctx.get("sentiment_negative_pct")
        neu_pct = ctx.get("sentiment_neutral_pct")

        overall_label = _sentiment_label_id(overall)
        score_str = f" (skor: {score}/100)" if score is not None else ""
        lines.append(f"- **Sentimen Keseluruhan**: {overall_label}{score_str}")

        dist_parts = []
        if pos_pct is not None:
            dist_parts.append(f"Positif: **{pos_pct}%**")
        if neu_pct is not None:
            dist_parts.append(f"Netral: **{neu_pct}%**")
        if neg_pct is not None:
            dist_parts.append(f"Negatif: **{neg_pct}%**")
        if dist_parts:
            lines.append(f"- **Distribusi Sentimen**: {' | '.join(dist_parts)}")

    if has_news:
        headlines = ctx.get("news_headlines", [])
        lines.append(f"\n**Top {len(headlines)} Berita Terbaru:**")
        for i, h in enumerate(headlines[:8], 1):
            title = h.get("title", "-")
            sent = h.get("sentiment", "neutral")
            sent_icon = "📈" if sent == "positive" else ("📉" if sent == "negative" else "➡️")
            lines.append(f"{i}. {sent_icon} {title}")

    lines.append(
        "\nSaat menjawab pertanyaan tentang sentimen, gunakan data di atas sebagai referensi utama. "
        "Jangan mengarang berita yang tidak ada dalam daftar ini."
    )


def _build_macro_context(ctx: dict, lines: list):
    """Tambah blok makro ekonomi ke lines."""
    has_macro = any(ctx.get(k) is not None for k in [
        "macro_bi_rate", "macro_inflation", "macro_gdp", "macro_ihsg", "macro_usdidr"
    ])
    if not has_macro:
        return

    lines.append("\n### 🌍 Data Makro Ekonomi Indonesia")
    lines.append("> Data resmi dari Bank Indonesia (BI Rate), BPS (Inflasi, PDB), dan pasar real-time (IHSG, USD/IDR).")

    if ctx.get("macro_bi_rate") is not None:
        bi_rate = ctx.get("macro_bi_rate")
        bi_desc = ctx.get("macro_bi_rate_desc", "")
        desc_str = f" ({bi_desc})" if bi_desc else ""
        lines.append(f"- **BI Rate (Suku Bunga Acuan)**: **{bi_rate}%**{desc_str}")

    if ctx.get("macro_inflation") is not None:
        infl = ctx.get("macro_inflation")
        lines.append(f"- **Inflasi YoY**: **{infl}%**")

    if ctx.get("macro_gdp") is not None:
        gdp = ctx.get("macro_gdp")
        lines.append(f"- **Pertumbuhan PDB YoY**: **{gdp}%**")

    if ctx.get("macro_ihsg") is not None:
        ihsg = ctx.get("macro_ihsg")
        ihsg_chg = ctx.get("macro_ihsg_change")
        ihsg_fmt = f"{float(ihsg):,.2f}" if ihsg else "-"
        if ihsg_chg is not None:
            chg_icon = "▲" if float(ihsg_chg) >= 0 else "▼"
            ihsg_str = f"**{ihsg_fmt}** ({chg_icon} {abs(float(ihsg_chg)):.2f}%)"
        else:
            ihsg_str = f"**{ihsg_fmt}**"
        lines.append(f"- **IHSG (Indeks Harga Saham Gabungan)**: {ihsg_str}")

    if ctx.get("macro_usdidr") is not None:
        usdidr = ctx.get("macro_usdidr")
        usdidr_chg = ctx.get("macro_usdidr_change")
        usdidr_fmt = f"Rp {float(usdidr):,.0f}" if usdidr else "-"
        if usdidr_chg is not None:
            usdidr_str = f"**{usdidr_fmt}** (chg: {usdidr_chg:.2f}%)"
        else:
            usdidr_str = f"**{usdidr_fmt}**"
        lines.append(f"- **Kurs USD/IDR**: {usdidr_str}")

    lines.append(
        "\nGunakan data makro di atas untuk menganalisis dampak kondisi ekonomi terhadap emiten. "
        "Jangan menggunakan angka makro lain yang tidak ada di sini."
    )


def _system_prompt(ctx: Optional[dict], mode: str = "general") -> str:
    """Bangun system prompt lengkap untuk StockSense AI Advisor."""
    base = (
        "Kamu adalah **StockSense AI Advisor**, asisten manajemen investasi saham profesional "
        "yang spesialis di pasar saham Indonesia (IDX/BEI). "
        "Kamu memiliki keahlian mendalam dalam analisis teknikal, fundamental, dan makroekonomi."
        "\n\n**ATURAN UTAMA — WAJIB DIIKUTI:**"
        "\n- Jawab dalam **Bahasa Indonesia** yang profesional namun mudah dipahami"
        "\n- Gunakan format **Markdown**: bold untuk angka penting, bullet list untuk poin-poin, tabel untuk perbandingan data"
        "\n- **HANYA gunakan data yang tersedia di bagian 'Konteks Data Dashboard'** di bawah"
        "\n- Jika data tidak tersedia untuk pertanyaan tertentu, sampaikan dengan jujur bahwa data belum dimuat"
        "\n- Jangan mengarang angka, berita, atau fakta yang tidak ada di konteks"
        "\n- Selalu sertakan **disclaimer** singkat bahwa analisis ini bukan rekomendasi jual/beli resmi"
        "\n- Bila pengguna mengunggah gambar grafik/candlestick, analisis pola harga yang terlihat"
    )

    # Tambah instruksi mode analisis
    base += _mode_instructions(mode)

    # Tambah konteks saham jika tersedia
    if ctx and ctx.get("ticker"):
        ticker = ctx.get("ticker", "")
        lines = [
            "",
            "---",
            f"## 📋 Konteks Data Dashboard — {ticker}",
            f"> Data berikut diambil LANGSUNG dari dashboard StockSense untuk saham **{ticker}**.",
            f"> Gunakan data ini sebagai satu-satunya sumber fakta dalam analisis kamu.",
            "",
        ]

        # ── Harga & Info Dasar
        lines.append("### 💰 Harga & Info Terkini")
        if ctx.get("price") is not None:
            price_fmt = f"Rp {ctx.get('price'):,.0f}" if isinstance(ctx.get("price"), (int, float)) else str(ctx.get("price"))
            lines.append(f"- **Harga Terakhir**: {price_fmt}")

        if ctx.get("change_pct") is not None:
            chg = ctx.get("change_pct")
            arah = "naik ▲" if float(chg) >= 0 else "turun ▼"
            lines.append(f"- **Perubahan Hari Ini**: **{chg}%** ({arah})")

        # ── Indikator Teknikal
        _build_technical_context(ctx, lines)

        # ── Prediksi ML
        _build_prediction_context(ctx, lines)

        # ── Berita & Sentimen
        _build_sentiment_context(ctx, lines)

        # ── Makro Ekonomi
        _build_macro_context(ctx, lines)

        lines.append("")
        lines.append("---")
        lines.append(
            "*Akhiri setiap jawaban dengan disclaimer: 'Analisis ini bersifat informatif dan bukan merupakan rekomendasi investasi resmi. Keputusan investasi sepenuhnya ada di tangan investor.'*"
        )

        base += "\n" + "\n".join(lines)

    return base


def _to_groq_message(m: ChatMessage) -> dict:
    # Pesan teks biasa.
    if not m.image:
        return {"role": m.role, "content": m.content or ""}
    # Pesan multimodal (teks + gambar) untuk model vision (format OpenAI-compatible).
    parts = []
    if m.content:
        parts.append({"type": "text", "text": m.content})
    parts.append({"type": "image_url", "image_url": {"url": m.image}})
    return {"role": m.role, "content": parts}


@router.post("")
async def chat(req: ChatReq):
    """Endpoint utama chat. Path kosong -> tepat /api/chat (hindari redirect 307)."""
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages tidak boleh kosong")

    mode = req.mode or "general"
    groq_messages = [{"role": "system", "content": _system_prompt(req.stock_context, mode)}]
    groq_messages += [_to_groq_message(m) for m in req.messages]

    # Gunakan model pilihan user atau fallback ke CHAT_MODEL bawaan
    model_to_use = req.model if req.model else CHAT_MODEL

    res = await groq_chat_rotate(
        groq_messages, model_to_use, max_tokens=2048, api_key=req.api_key
    )
    try:
        reply = res["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        reply = ""
    return {"reply": reply, "model": model_to_use}
