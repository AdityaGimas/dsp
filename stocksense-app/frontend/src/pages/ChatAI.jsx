import { useEffect, useRef, useState } from "react"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const LS_KEY = "chat_stocksense"

// Kecilkan gambar di sisi browser supaya base64 tidak terlalu besar (hemat
// kuota localStorage & batas ukuran gambar Groq).
function downscaleImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let w = img.width
        let h = img.height
        if (w > h && w > maxSize) {
          h = Math.round((h * maxSize) / w)
          w = maxSize
        } else if (h > maxSize) {
          w = Math.round((w * maxSize) / h)
          h = maxSize
        }
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        canvas.getContext("2d").drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", quality))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ChatAI() {
  const { currentTicker } = useApp()
  const code = currentTicker ? currentTicker.replace(".JK", "") : ""

  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]")
    } catch (e) {
      return []
    }
  })
  const [input, setInput] = useState("")
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ctx, setCtx] = useState(null)

  const scrollRef = useRef(null)
  const fileRef = useRef(null)

  // Simpan riwayat ke browser (abaikan bila kuota penuh).
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(messages))
    } catch (e) {
      /* kuota localStorage penuh, abaikan */
    }
  }, [messages])

  // Auto-scroll ke bawah.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Ambil konteks saham aktif (info + indikator + prediksi ML).
  useEffect(() => {
    if (!currentTicker) {
      setCtx(null)
      return
    }
    let alive = true
    Promise.allSettled([
      api.getStockInfo(currentTicker),
      api.getIndicators(currentTicker),
      api.getPrediction(currentTicker),
    ]).then(([inf, ind, pred]) => {
      if (!alive) return
      const info = inf.status === "fulfilled" ? inf.value : null
      const indi = ind.status === "fulfilled" ? ind.value : null
      const pr = pred.status === "fulfilled" ? pred.value : null
      setCtx({
        ticker: currentTicker,
        price: info?.current_price ?? null,
        change_pct: info?.change_percent ?? info?.change_pct ?? null,
        rsi: indi?.rsi?.value ?? null,
        rsi_signal: indi?.rsi?.signal ?? null,
        macd_signal: indi?.macd?.signal ?? null,
        golden_cross: indi?.moving_average?.golden_cross ?? null,
        ml_recommendation: pr?.recommendation ?? null,
        ml_confidence: pr?.confidence ?? null,
      })
    })
    return () => {
      alive = false
    }
  }, [currentTicker])

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setErr("File harus berupa gambar.")
      return
    }
    try {
      const dataUrl = await downscaleImage(file, 1024, 0.85)
      setImage(dataUrl)
      setErr("")
    } catch (e2) {
      setErr("Gagal memproses gambar: " + e2.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function send() {
    const text = input.trim()
    if ((!text && !image) || busy) return
    const userMsg = { role: "user", content: text, image: image || undefined, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    setImage(null)
    setBusy(true)
    setErr("")
    try {
      const payloadMsgs = next.map((m) => ({ role: m.role, content: m.content || "", image: m.image }))
      const res = await api.chat({ messages: payloadMsgs, stock_context: ctx || undefined })
      setMessages((cur) => [...cur, { role: "assistant", content: res.reply || "(kosong)", ts: Date.now() }])
    } catch (e) {
      setErr(e.message)
      setMessages((cur) => [...cur, { role: "assistant", content: "⚠️ Gagal mendapatkan jawaban: " + e.message, error: true, ts: Date.now() }])
    } finally {
      setBusy(false)
    }
  }

  function clearChat() {
    setMessages([])
    setErr("")
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      <TickerSearchBar label="Chat AI">
        <button className="fetch-news-btn" onClick={clearChat} disabled={busy || !messages.length}>
          <span className="btn-txt">🗑 Hapus Riwayat</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        <div className="chat-wrap">
          <div className="chat-context-bar">
            {ctx && ctx.ticker ? (
              <span>
                Konteks aktif: <b>{code}</b>
                {ctx.price != null ? " · Rp " + Number(ctx.price).toLocaleString("id-ID") : ""}
                {ctx.rsi != null ? " · RSI " + Math.round(ctx.rsi) : ""}
                {ctx.ml_recommendation ? " · ML: " + ctx.ml_recommendation : ""}
              </span>
            ) : (
              <span>Belum ada saham terpilih — chat tetap bisa dipakai untuk pertanyaan umum.</span>
            )}
          </div>

          <div className="chat-messages" ref={scrollRef}>
            {!messages.length && (
              <div className="chat-empty">
                <div className="chat-empty-icon">💬</div>
                <div className="chat-empty-title">Tanya apa saja soal saham</div>
                <div className="chat-empty-sub">
                  Ketik pertanyaan, atau unggah screenshot grafik/candlestick untuk dianalisis teknikalnya oleh AI.
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={"chat-row " + (m.role === "user" ? "chat-row-user" : "chat-row-ai")}>
                <div className={"chat-bubble " + (m.role === "user" ? "cb-user" : m.error ? "cb-error" : "cb-ai")}>
                  {m.image && <img src={m.image} alt="lampiran" className="chat-img" />}
                  {m.content && <div className="chat-text">{m.content}</div>}
                </div>
              </div>
            ))}

            {busy && (
              <div className="chat-row chat-row-ai">
                <div className="chat-bubble cb-ai chat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {err && <div className="error-msg chat-err">{err}</div>}

          <div className="chat-input-bar">
            {image && (
              <div className="chat-preview">
                <img src={image} alt="preview" />
                <button className="chat-preview-x" onClick={() => setImage(null)} title="Hapus gambar">
                  ×
                </button>
              </div>
            )}
            <div className="chat-input-row">
              <button
                className="chat-attach"
                onClick={() => fileRef.current && fileRef.current.click()}
                title="Unggah gambar"
                disabled={busy}
              >
                📎
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
              <textarea
                className="chat-textarea"
                placeholder="Tulis pertanyaan... (Enter kirim, Shift+Enter baris baru)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                disabled={busy}
              />
              <button className="chat-send" onClick={send} disabled={busy || (!input.trim() && !image)}>
                {busy ? "…" : "➤"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
