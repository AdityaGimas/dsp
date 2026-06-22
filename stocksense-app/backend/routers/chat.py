"""Chat AI endpoint — percakapan bebas + analisis gambar (vision) via Groq.
Memakai ulang rotasi multi-API-key & penanganan limit dari grok.py."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os

from .grok import groq_chat_rotate

router = APIRouter()

# Model multimodal Groq (bisa baca gambar). Bisa di-override lewat .env.
CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")


class ChatMessage(BaseModel):
    role: str
    content: str = ""
    image: Optional[str] = None  # data URL base64 (mis. data:image/jpeg;base64,...)


class ChatReq(BaseModel):
    messages: List[ChatMessage]
    stock_context: Optional[dict] = None
    api_key: Optional[str] = None


def _system_prompt(ctx: Optional[dict]) -> str:
    base = (
        "Kamu adalah asisten analis saham untuk pasar saham Indonesia (IDX). "
        "Jawab dalam Bahasa Indonesia yang jelas, ringkas, dan mudah dipahami. "
        "Bila pengguna mengunggah gambar grafik/candlestick, analisis pola harga, "
        "tren, level support/resistance, serta indikator yang terlihat. "
        "Jelaskan alasanmu, tetapi selalu ingatkan bahwa ini bukan ajakan jual/beli "
        "dan keputusan akhir ada di tangan pengguna."
    )
    if ctx and ctx.get("ticker"):
        lines = ["", "Konteks saham yang sedang dilihat pengguna:", f"- Ticker: {ctx.get('ticker')}"]
        if ctx.get("price") is not None:
            lines.append(f"- Harga terakhir: {ctx.get('price')}")
        if ctx.get("change_pct") is not None:
            lines.append(f"- Perubahan: {ctx.get('change_pct')}%")
        if ctx.get("rsi") is not None:
            lines.append(f"- RSI: {ctx.get('rsi')} (sinyal: {ctx.get('rsi_signal')})")
        if ctx.get("macd_signal") is not None:
            lines.append(f"- Sinyal MACD: {ctx.get('macd_signal')}")
        if ctx.get("golden_cross") is not None:
            lines.append(f"- Golden cross: {ctx.get('golden_cross')}")
        if ctx.get("ml_recommendation") is not None:
            lines.append(
                f"- Rekomendasi model ML: {ctx.get('ml_recommendation')} "
                f"(confidence {ctx.get('ml_confidence')})"
            )
        lines.append("Gunakan konteks ini bila relevan dengan pertanyaan pengguna.")
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

    groq_messages = [{"role": "system", "content": _system_prompt(req.stock_context)}]
    groq_messages += [_to_groq_message(m) for m in req.messages]

    res = await groq_chat_rotate(
        groq_messages, CHAT_MODEL, max_tokens=1024, api_key=req.api_key
    )
    try:
        reply = res["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        reply = ""
    return {"reply": reply, "model": CHAT_MODEL}
