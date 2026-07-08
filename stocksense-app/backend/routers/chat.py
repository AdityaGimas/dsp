"""Chat AI endpoint â€” AI Advisor Manajemen Saham IDX via Groq.
Dilengkapi dengan konteks grafik harga, mode analisis, dan format Markdown.
Memakai ulang rotasi multi-API-key & penanganan limit dari grok.py."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
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


def _mode_instructions(mode: str) -> str:
    """Instruksi detail per mode — setiap mode punya struktur output, fokus, dan persona berbeda."""
    if mode == "technical":
        return (
            "\n\n## MODE: ANALISIS TEKNIKAL 📊"
            "\nKamu bertindak sebagai **analis teknikal profesional**."
            "\nStruktur jawaban WAJIB:"
            "\n1. **Tren Utama** — Identifikasi tren dominan (uptrend/downtrend/sideways) berdasarkan candlestick"
            "\n2. **Analisis Indikator** — Bahas RSI (nilai, overbought/oversold/divergensi), MACD (histogram, persilangan, momentum), MA20 vs MA50 (golden/death cross), Bollinger Bands (posisi dan lebar)"
            "\n3. **Level Kunci** — Sebutkan 1-2 level support dan 1-2 level resistance terdekat dengan harga saat ini (gunakan angka spesifik dari data)"
            "\n4. **Pola Chart** — Identifikasi pola candlestick atau chart pattern yang terbentuk (jika ada)"
            "\n5. **Setup Trading** — Entry yang ideal, stop loss, dan target harga (sebutkan risk/reward ratio)"
            "\n6. **Kesimpulan Teknikal** — Verdict: BELI / HOLD / JUAL berdasarkan analisis teknikal"
            "\nLarangan: JANGAN membahas berita atau makroekonomi kecuali relevan langsung dengan pola teknikal."
        )
    if mode == "news":
        return (
            "\n\n## MODE: ANALISIS BERITA & SENTIMEN 📰"
            "\nKamu bertindak sebagai **analis sentimen pasar dan strategi investasi berbasis berita**."
            "\nStruktur jawaban WAJIB:"
            "\n1. **Sentimen Pasar** — Tentukan apakah sentimen saat ini positif/negatif/netral dan alasannya"
            "\n2. **Katalis Positif** — Berita, event, atau pengumuman yang mendorong kenaikan (sebutkan spesifik)"
            "\n3. **Katalis Negatif & Risiko** — Berita atau faktor yang menekan harga"
            "\n4. **Analisis Fundamental Singkat** — Kondisi bisnis emiten: pendapatan, laba, posisi kompetitif"
            "\n5. **Dampak ke Harga** — Apakah berita sudah 'priced-in' di chart? Gap antara fundamental dan harga pasar?"
            "\n6. **Proyeksi Sentimen** — Apakah sentimen akan membaik atau memburuk 1-3 bulan ke depan?"
            "\n7. **Kesimpulan** — Apakah sentimen pasar mendukung posisi BELI/HOLD/JUAL?"
            "\nLarangan: Jangan terlalu dalam ke analisis teknikal — cukup kaitkan sentimen dengan pergerakan harga secara singkat."
        )
    if mode == "macro":
        return (
            "\n\n## MODE: ANALISIS MAKRO EKONOMI 🌍"
            "\nKamu bertindak sebagai **ekonom makro dan analis pasar modal**."
            "\nStruktur jawaban WAJIB:"
            "\n1. **Kondisi Makro Indonesia** — Suku bunga BI Rate (arah kebijakan moneter), inflasi dan dampaknya ke margin perusahaan, nilai tukar Rupiah terhadap USD"
            "\n2. **Faktor Global** — Kondisi ekonomi AS dan China, harga komoditas relevan (minyak, batu bara, nikel, CPO sesuai sektor emiten), aliran modal asing ke Indonesia"
            "\n3. **Dampak Langsung ke Emiten** — Bagaimana kondisi makro di atas memengaruhi bisnis emiten ini secara konkret (pendapatan, biaya, demand)"
            "\n4. **Skenario Risiko Makro** — Apa yang terjadi jika suku bunga naik? Rupiah melemah? Komoditas turun?"
            "\n5. **Outlook 3-6 Bulan** — Prediksi kondisi makro dan implikasinya ke harga saham"
            "\n6. **Kesimpulan** — Apakah kondisi makro mendukung atau menghambat apresiasi saham ini?"
            "\nLarangan: JANGAN terlalu teknikal. Fokus pada big picture ekonomi dan kaitkan ke dampak konkret bisnis emiten."
        )
    # default: general
    return (
        "\n\n## MODE: ANALISIS UMUM (HOLISTIK) 🔍"
        "\nKamu memberikan **analisis investasi komprehensif dan seimbang** yang mencakup semua aspek."
        "\nStruktur jawaban WAJIB:"
        "\n1. **Ringkasan Eksekutif** — 2-3 kalimat kesimpulan utama tentang kondisi saham saat ini"
        "\n2. **Snapshot Teknikal** — Tren, RSI, MACD, level support/resistance kunci (singkat, 3-4 poin)"
        "\n3. **Kondisi Fundamental** — Kinerja bisnis terkini, valuasi (P/E vs sektor), posisi kompetitif"
        "\n4. **Sentimen & Makro** — Berita terbaru, kondisi ekonomi yang relevan, sentimen investor"
        "\n5. **Risiko Utama** — 2-3 risiko paling signifikan yang perlu diwaspadai investor"
        "\n6. **Scorecard Investasi**:"
        "\n   | Aspek | Status | Keterangan |"
        "\n   |-------|--------|-----------|"
        "\n   | Teknikal | 🟢/🟡/🔴 | ... |"
        "\n   | Fundamental | 🟢/🟡/🔴 | ... |"
        "\n   | Makro & Sentimen | 🟢/🟡/🔴 | ... |"
        "\n7. **Rekomendasi Akhir** — **BELI / HOLD / JUAL** dengan alasan ringkas dan level harga target"
        "\nBerikan analisis yang actionable. Gunakan data dari konteks yang tersedia sebagai basis analisis."
    )


def _system_prompt(ctx: Optional[dict], mode: str = "general") -> str:
    """Bangun system prompt lengkap untuk StockSense AI Advisor."""
    base = (
        "Kamu adalah **StockSense AI Advisor**, asisten manajemen investasi saham profesional "
        "yang spesialis di pasar saham Indonesia (IDX/BEI). "
        "Kamu memiliki keahlian mendalam dalam analisis teknikal, fundamental, dan makroekonomi. "
        "\n\nPanduan respons:"
        "\n- Jawab dalam **Bahasa Indonesia** yang profesional namun mudah dipahami"
        "\n- Gunakan format **Markdown**: bold untuk angka penting, bullet list untuk poin-poin, "
        "tabel untuk perbandingan data"
        "\n- Struktur jawaban: ringkasan singkat â†’ analisis detail â†’ kesimpulan/rekomendasi"
        "\n- Selalu sertakan **disclaimer** singkat bahwa analisis ini bukan rekomendasi "
        "jual/beli resmi dan keputusan investasi ada di tangan pengguna"
        "\n- Bila pengguna mengunggah gambar grafik/candlestick, analisis pola harga, "
        "tren, level support/resistance, dan indikator yang terlihat secara detail"
    )

    # Tambah instruksi mode analisis
    base += _mode_instructions(mode)

    # Tambah konteks saham jika tersedia
    if ctx and ctx.get("ticker"):
        ticker = ctx.get("ticker", "")
        lines = [
            "",
            f"---",
            f"**Konteks Saham Aktif â€” {ticker}:**",
        ]

        if ctx.get("price") is not None:
            price_fmt = f"Rp {ctx.get('price'):,.0f}" if isinstance(ctx.get('price'), (int, float)) else str(ctx.get('price'))
            lines.append(f"- Harga terakhir: **{price_fmt}**")

        if ctx.get("change_pct") is not None:
            chg = ctx.get('change_pct')
            arah = "naik â†‘" if float(chg) >= 0 else "turun â†“"
            lines.append(f"- Perubahan hari ini: **{chg}%** ({arah})")

        if ctx.get("rsi") is not None:
            rsi_val = ctx.get('rsi')
            rsi_interp = _rsi_interpretation(float(rsi_val))
            lines.append(f"- RSI: **{round(float(rsi_val), 1)}** â†’ kondisi {rsi_interp}")

        if ctx.get("macd_signal") is not None:
            lines.append(f"- Sinyal MACD: **{ctx.get('macd_signal')}**")

        if ctx.get("golden_cross") is not None:
            gc = ctx.get('golden_cross')
            lines.append(f"- Golden Cross: **{'Ya âœ…' if gc else 'Tidak âŒ'}**")

        if ctx.get("ml_recommendation") is not None:
            conf = ctx.get('ml_confidence')
            conf_pct = f"{round(float(conf)*100)}%" if conf is not None else "-"
            lines.append(
                f"- Rekomendasi Model ML: **{ctx.get('ml_recommendation')}** "
                f"(confidence: {conf_pct})"
            )

        # Konteks grafik jika tersedia
        chart_period = ctx.get("chart_period")
        if chart_period:
            period_label = _PERIOD_LABEL.get(chart_period, chart_period)
            lines.append(f"")
            lines.append(f"**Grafik yang sedang dilihat pengguna ({period_label}):**")

            if ctx.get("chart_trend"):
                trend_icon = "ðŸ“ˆ" if ctx.get('chart_trend') == "bullish" else "ðŸ“‰"
                lines.append(f"- Tren periode: **{ctx.get('chart_trend').upper()}** {trend_icon}")

            if ctx.get("chart_change_pct") is not None:
                lines.append(f"- Perubahan dalam periode: **{ctx.get('chart_change_pct')}**")

            if ctx.get("chart_high") is not None:
                high_fmt = f"Rp {ctx.get('chart_high'):,.0f}" if isinstance(ctx.get('chart_high'), (int, float)) else str(ctx.get('chart_high'))
                lines.append(f"- Harga tertinggi periode: **{high_fmt}**")

            if ctx.get("chart_low") is not None:
                low_fmt = f"Rp {ctx.get('chart_low'):,.0f}" if isinstance(ctx.get('chart_low'), (int, float)) else str(ctx.get('chart_low'))
                lines.append(f"- Harga terendah periode: **{low_fmt}**")

            lines.append(
                f"Saat menjawab pertanyaan tentang tren atau pergerakan harga, "
                f"jadikan data grafik {period_label} ini sebagai referensi utama."
            )

        lines.append("")
        lines.append(
            "Gunakan semua konteks di atas bila relevan. "
            "Jika data tidak tersedia, sampaikan dengan jujur."
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
        groq_messages, model_to_use, max_tokens=1536, api_key=req.api_key
    )
    try:
        reply = res["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        reply = ""
    return {"reply": reply, "model": model_to_use}
