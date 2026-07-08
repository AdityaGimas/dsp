import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Line } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const LS_KEY = "chat_stocksense"

// ── Timeframe config ──────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
]

// ── Mode config ───────────────────────────────────────────────────────────────
const MODES = [
  { key: "general",   label: "🔍 Umum" },
  { key: "technical", label: "📊 Teknikal" },
  { key: "news",      label: "📰 Berita" },
  { key: "macro",     label: "🌍 Makro" },
]

// Quick prompts per mode
const QUICK_PROMPTS = {
  general: [
    { icon: "📋", text: "Analisis lengkap saham ini" },
    { icon: "💡", text: "Apakah layak untuk diinvestasi sekarang?" },
    { icon: "🎯", text: "Beli, hold, atau jual?" },
    { icon: "⚠️", text: "Apa risiko terbesar dari saham ini?" },
  ],
  technical: [
    { icon: "📈", text: "Analisis grafik periode ini secara teknikal" },
    { icon: "🔍", text: "Identifikasi level support dan resistance" },
    { icon: "📡", text: "Apakah RSI dan MACD memberi sinyal yang sama?" },
    { icon: "🕯️", text: "Adakah pola chart yang terbentuk?" },
    { icon: "↔️", text: "Bandingkan MA20 dan MA50 saat ini" },
  ],
  news: [
    { icon: "📰", text: "Bagaimana sentimen berita berdampak ke harga?" },
    { icon: "🔥", text: "Apa katalis positif terbaru saham ini?" },
    { icon: "📊", text: "Bagaimana sentimen pasar minggu ini?" },
    { icon: "🚨", text: "Apa risiko dari berita negatif terkini?" },
  ],
  macro: [
    { icon: "🏦", text: "Dampak suku bunga BI terhadap saham ini" },
    { icon: "💱", text: "Pengaruh nilai tukar rupiah ke kinerja emiten" },
    { icon: "🌍", text: "Faktor global apa yang mempengaruhi saham ini?" },
    { icon: "📉", text: "Apa risiko makro yang perlu diwaspadai?" },
  ],
}

// ── Image downscaler ──────────────────────────────────────────────────────────
function downscaleImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > h && w > maxSize) { h = Math.round((h * maxSize) / w); w = maxSize }
        else if (h > maxSize) { w = Math.round((w * maxSize) / h); h = maxSize }
        const canvas = document.createElement("canvas")
        canvas.width = w; canvas.height = h
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

// ── Minimal Markdown renderer ─────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return ""
  let html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^---$/gm, "<hr/>")
    .replace(/^\d+\. (.+)$/gm, "<li data-ol>$1</li>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li data-ol>[^<]*<\/li>\n?)+/g, m => `<ol>${m.replace(/ data-ol/g, "")}</ol>`)
    .replace(/(<li>[^<]*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n(?!<[uo]l|<pre|<h[123]|<hr)/g, "</p><p>")
    .replace(/\n(?!<[uo]l|<\/[uo]l|<li|<\/li|<pre|<\/pre|<h[123]|<\/h[123]|<hr)/g, "<br/>")
  return `<p>${html}</p>`
}

// ── Format timestamp ──────────────────────────────────────────────────────────
function fmtTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

// ── RSI helpers ───────────────────────────────────────────────────────────────
function rsiColor(val) {
  if (val >= 70) return "var(--red)"
  if (val <= 30) return "var(--green)"
  return "var(--blue)"
}
function rsiLabel(val) {
  if (val >= 70) return "Overbought"
  if (val <= 30) return "Oversold"
  return "Netral"
}

// ── Badge class helpers ───────────────────────────────────────────────────────
function macdBadgeClass(signal) {
  if (!signal) return "neutral"
  const s = String(signal).toLowerCase()
  if (s.includes("bull") || s.includes("beli") || s.includes("buy")) return "bullish"
  if (s.includes("bear") || s.includes("jual") || s.includes("sell")) return "bearish"
  return "neutral"
}
function mlBadgeClass(rec) {
  if (!rec) return "neutral"
  const r = String(rec).toUpperCase()
  if (r === "BUY" || r === "BELI" || r === "STRONG BUY") return "buy"
  if (r === "SELL" || r === "JUAL" || r === "STRONG SELL") return "sell"
  return "hold"
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
function buildChartData(histData, trend) {
  if (!histData || !histData.length) return null
  const labels = histData.map(d => {
    const dt = new Date(d.date)
    return dt.toLocaleDateString("id-ID", { month: "short", day: "numeric" })
  })
  const prices = histData.map(d => d.close)
  const color = trend === "bearish" ? "#f55e5e" : "#4f9cf9"
  const colorAlpha = trend === "bearish" ? "rgba(245,94,94,0.12)" : "rgba(79,156,249,0.10)"
  return {
    labels,
    datasets: [{
      data: prices,
      borderColor: color,
      backgroundColor: colorAlpha,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 3,
      fill: true,
      tension: 0.3,
    }]
  }
}

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: ctx => `Rp ${Number(ctx.parsed.y).toLocaleString("id-ID")}`,
      },
      backgroundColor: "rgba(22,25,32,0.95)",
      borderColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      titleColor: "#b0b7c6",
      bodyColor: "#e8eaf0",
      padding: 8,
    }
  },
  scales: {
    x: {
      display: true,
      ticks: {
        color: "#7e8494",
        font: { size: 9, family: "'Space Mono', monospace" },
        maxTicksLimit: 6,
        maxRotation: 0,
      },
      grid: { display: false },
      border: { display: false },
    },
    y: {
      display: true,
      position: "right",
      ticks: {
        color: "#7e8494",
        font: { size: 9, family: "'Space Mono', monospace" },
        maxTicksLimit: 4,
        callback: v => `${(v / 1000).toFixed(0)}K`,
      },
      grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
      border: { display: false },
    },
  },
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function ChatAI() {
  const { currentTicker } = useApp()
  const code = currentTicker ? currentTicker.replace(".JK", "") : ""

  // Chat state
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] }
  })
  const [input, setInput] = useState("")
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ctx, setCtx] = useState(null)
  const [mode, setMode] = useState("general")

  // Chart state
  const [period, setPeriod] = useState("3mo")
  const [histData, setHistData] = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const [chartStats, setChartStats] = useState(null)

  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const textareaRef = useRef(null)

  // Persist messages
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(messages)) } catch { /* quota full */ }
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Fetch stock context
  useEffect(() => {
    if (!currentTicker) { setCtx(null); return }
    let alive = true
    Promise.allSettled([
      api.getStockInfo(currentTicker),
      api.getIndicators(currentTicker),
      api.getPrediction(currentTicker),
    ]).then(([inf, ind, pred]) => {
      if (!alive) return
      const info = inf.status === "fulfilled" ? inf.value : null
      const indi = ind.status === "fulfilled" ? ind.value : null
      const pr   = pred.status === "fulfilled" ? pred.value : null
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
    return () => { alive = false }
  }, [currentTicker])

  // Fetch history for chart
  useEffect(() => {
    if (!currentTicker) { setHistData(null); setChartStats(null); return }
    let alive = true
    setHistLoading(true)
    setHistData(null)
    api.getHistory(currentTicker, period)
      .then(res => {
        if (!alive) return
        const data = res?.data || []
        setHistData(data)
        if (data.length >= 2) {
          const prices = data.map(d => d.close)
          const first = prices[0], last = prices[prices.length - 1]
          const high = Math.max(...prices), low = Math.min(...prices)
          const changePct = ((last - first) / first * 100).toFixed(2)
          const trend = last >= first ? "bullish" : "bearish"
          setChartStats({ trend, changePct: `${changePct > 0 ? "+" : ""}${changePct}%`, high, low })
        } else {
          setChartStats(null)
        }
      })
      .catch(() => { if (alive) { setHistData([]); setChartStats(null) } })
      .finally(() => { if (alive) setHistLoading(false) })
    return () => { alive = false }
  }, [currentTicker, period])

  const chartData = useMemo(
    () => buildChartData(histData, chartStats?.trend),
    [histData, chartStats]
  )

  // Build full context for AI (with chart stats)
  const fullCtx = useMemo(() => {
    if (!ctx) return null
    return {
      ...ctx,
      chart_period: period,
      chart_trend: chartStats?.trend ?? null,
      chart_change_pct: chartStats?.changePct ?? null,
      chart_high: chartStats?.high ?? null,
      chart_low: chartStats?.low ?? null,
    }
  }, [ctx, period, chartStats])

  // ── File handler ──────────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) { setErr("File harus berupa gambar."); return }
    try {
      const dataUrl = await downscaleImage(file, 1024, 0.85)
      setImage(dataUrl); setErr("")
    } catch (e2) {
      setErr("Gagal memproses gambar: " + e2.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim()
    if ((!text && !image) || busy) return
    const userMsg = { role: "user", content: text, image: image || undefined, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next); setInput(""); setImage(null); setBusy(true); setErr("")
    if (textareaRef.current) textareaRef.current.style.height = "34px"
    try {
      const payloadMsgs = next.map(m => ({ role: m.role, content: m.content || "", image: m.image }))
      const res = await api.chat({ messages: payloadMsgs, stock_context: fullCtx || undefined, mode })
      setMessages(cur => [...cur, { role: "assistant", content: res.reply || "(kosong)", ts: Date.now() }])
    } catch (e) {
      setErr(e.message)
      setMessages(cur => [...cur, { role: "assistant", content: "⚠️ Gagal mendapatkan jawaban: " + e.message, error: true, ts: Date.now() }])
    } finally {
      setBusy(false)
    }
  }

  // ── Quick prompt ──────────────────────────────────────────────────────────
  const handleQuickPrompt = useCallback((text) => {
    const fullText = code ? `${text} ${code}` : text
    setInput(fullText)
    if (textareaRef.current) {
      textareaRef.current.value = fullText
      textareaRef.current.style.height = "34px"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px"
      textareaRef.current.focus()
    }
  }, [code])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  function onTextareaInput(e) {
    const el = e.target
    el.style.height = "34px"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
    setInput(el.value)
  }

  // ── Copy ─────────────────────────────────────────────────────────────────
  function copyMsg(content) {
    navigator.clipboard?.writeText(content).catch(() => {})
  }

  const clearChat = () => { setMessages([]); setErr("") }
  const prompts = QUICK_PROMPTS[mode] || QUICK_PROMPTS.general

  return (
    <>
      <TickerSearchBar label="Chat AI" />

      <div className="content" style={{ padding: 0, flex: 1, overflow: "hidden" }}>
        <div className="chat-page-wrap">

          {/* ── Chart Section ─────────────────────────────────────────── */}
          <div className="chat-chart-section">
            <div className="chat-chart-header">
              <div className="chat-chart-title">
                📈 Grafik Harga
                {code && (
                  <span style={{ color: "var(--blue)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {code}
                  </span>
                )}
                {chartStats && (
                  <span className={`chat-chart-trend ${chartStats.trend}`}>
                    {chartStats.trend === "bullish" ? "▲" : "▼"} {chartStats.changePct}
                  </span>
                )}
              </div>
              <div className="chat-tf-pills">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    className={`chat-tf-pill${period === tf.value ? " active" : ""}`}
                    onClick={() => setPeriod(tf.value)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {!currentTicker ? (
              <div className="chat-chart-empty">Pilih saham untuk melihat grafik harga</div>
            ) : histLoading ? (
              <div className="chat-chart-skeleton" />
            ) : chartData ? (
              <div className="chat-chart-wrap">
                <Line data={chartData} options={CHART_OPTIONS} />
              </div>
            ) : (
              <div className="chat-chart-empty">Data grafik tidak tersedia</div>
            )}
          </div>

          {/* ── Two-column layout ─────────────────────────────────────── */}
          <div className="chat-layout">

            {/* LEFT COL */}
            <div className="chat-left-col">

              {/* Header with mode tabs */}
              <div className="chat-header-bar">
                <div className="chat-ai-identity">
                  <div className="chat-ai-avatar">🤖</div>
                  <div>
                    <div className="chat-ai-name">StockSense AI Advisor</div>
                    <div className="chat-ai-badge">LLaMA-4 · IDX Specialist</div>
                  </div>
                </div>

                <div className="chat-mode-tabs">
                  {MODES.map(m => (
                    <button
                      key={m.key}
                      className={`chat-mode-tab${mode === m.key ? " active" : ""}`}
                      onClick={() => setMode(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="chat-header-actions">
                  <button
                    className="chat-clear-btn"
                    onClick={clearChat}
                    disabled={busy || !messages.length}
                  >
                    🗑 Hapus
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="chat-messages-area" ref={scrollRef}>
                {!messages.length && (
                  <div className="chat-empty-state">
                    <div className="chat-empty-icon">🤖</div>
                    <div className="chat-empty-title">AI Advisor Siap Membantu</div>
                    <div className="chat-empty-sub">
                      Tanya apa saja soal saham IDX — analisis teknikal, berita, prediksi, atau makro ekonomi.
                    </div>
                    <div className="chat-empty-features">
                      <div className="chat-empty-feat">
                        <span className="chat-empty-feat-icon">📊</span>
                        Analisis teknikal dengan RSI, MACD, &amp; MA
                      </div>
                      <div className="chat-empty-feat">
                        <span className="chat-empty-feat-icon">📈</span>
                        Lihat grafik lalu tanya langsung ke AI
                      </div>
                      <div className="chat-empty-feat">
                        <span className="chat-empty-feat-icon">📰</span>
                        Analisis sentimen berita &amp; katalis
                      </div>
                      <div className="chat-empty-feat">
                        <span className="chat-empty-feat-icon">🖼️</span>
                        Upload screenshot chart untuk dianalisis
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={`chat-msg-row ${m.role === "user" ? "user" : "ai"}`}>
                    <div className="chat-msg-meta">
                      <span className="chat-msg-sender">
                        {m.role === "user" ? "Kamu" : "AI Advisor"}
                      </span>
                      <span className="chat-msg-time">{fmtTime(m.ts)}</span>
                      {m.content && (
                        <button
                          className="chat-msg-copy"
                          onClick={() => copyMsg(m.content)}
                          title="Salin pesan"
                        >
                          📋
                        </button>
                      )}
                    </div>
                    <div className={`chat-bubble ${m.role === "user" ? "user" : m.error ? "error" : "ai"}`}>
                      {m.image && (
                        <img src={m.image} alt="lampiran" className="chat-bubble-img" />
                      )}
                      {m.content && m.role === "assistant" && !m.error ? (
                        <div
                          className="chat-md"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                        />
                      ) : m.content ? (
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="chat-msg-row ai">
                    <div className="chat-msg-meta">
                      <span className="chat-msg-sender">AI Advisor</span>
                    </div>
                    <div className="chat-typing-bubble">
                      <div className="chat-typing-dot" />
                      <div className="chat-typing-dot" />
                      <div className="chat-typing-dot" />
                    </div>
                  </div>
                )}
              </div>

              {err && (
                <div style={{ padding: "6px 16px", fontSize: 11, color: "var(--red)", flexShrink: 0 }}>
                  ⚠️ {err}
                </div>
              )}

              {/* Input bar */}
              <div className="chat-input-section">
                {image && (
                  <div className="chat-img-preview">
                    <img src={image} alt="preview" />
                    <div className="chat-img-preview-info">
                      <div className="chat-img-preview-label">Gambar terlampir</div>
                      <div className="chat-img-preview-sub">Akan dianalisis bersama pesan</div>
                    </div>
                    <button
                      className="chat-img-remove"
                      onClick={() => setImage(null)}
                      title="Hapus gambar"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="chat-input-row">
                  <button
                    className="chat-attach-btn"
                    onClick={() => fileRef.current?.click()}
                    title="Unggah gambar chart"
                    disabled={busy}
                  >
                    📎
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
                  <div className="chat-textarea-wrap">
                    <textarea
                      ref={textareaRef}
                      className="chat-textarea"
                      placeholder="Tulis pertanyaan... (Enter kirim, Shift+Enter baris baru)"
                      value={input}
                      onInput={onTextareaInput}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      rows={1}
                      disabled={busy}
                    />
                  </div>
                  <button
                    className="chat-send-btn"
                    onClick={send}
                    disabled={busy || (!input.trim() && !image)}
                    title="Kirim"
                  >
                    {busy ? "⋯" : "➤"}
                  </button>
                </div>
                <div className="chat-input-hint">
                  {ctx?.ticker
                    ? `Konteks: ${code} · Mode: ${MODES.find(m => m.key === mode)?.label} · Grafik: ${TIMEFRAMES.find(t => t.value === period)?.label}`
                    : "Pilih saham untuk analisis berbasis data real-time"
                  }
                </div>
              </div>
            </div>
            {/* END LEFT COL */}

            {/* RIGHT SIDEBAR */}
            <div className="chat-sidebar">

              {/* Stock Context */}
              <div className="chat-sidebar-section">
                <div className="chat-sidebar-label">📊 Konteks Saham</div>

                {ctx?.ticker ? (
                  <>
                    <div className="ctx-ticker-card">
                      <div className="ctx-ticker-code">{code}</div>
                      {ctx.price != null && (
                        <div className="ctx-ticker-price">
                          Rp {Number(ctx.price).toLocaleString("id-ID")}
                        </div>
                      )}
                      {ctx.change_pct != null && (
                        <div className={`ctx-ticker-chg ${parseFloat(ctx.change_pct) >= 0 ? "pos" : "neg"}`}>
                          {parseFloat(ctx.change_pct) >= 0 ? "▲" : "▼"} {Math.abs(ctx.change_pct).toFixed(2)}%
                        </div>
                      )}
                    </div>

                    {ctx.rsi != null && (
                      <div className="ctx-rsi-wrap">
                        <div className="ctx-rsi-header">
                          <span className="ctx-rsi-label">RSI (14)</span>
                          <span className="ctx-rsi-val" style={{ color: rsiColor(ctx.rsi) }}>
                            {Math.round(ctx.rsi)} · {rsiLabel(ctx.rsi)}
                          </span>
                        </div>
                        <div className="ctx-rsi-bar-bg">
                          <div
                            className="ctx-rsi-bar-fill"
                            style={{
                              width: `${Math.min(ctx.rsi, 100)}%`,
                              background: rsiColor(ctx.rsi),
                            }}
                          />
                        </div>
                        <div className="ctx-rsi-zones">
                          <span className="ctx-rsi-zone-label">0 Oversold</span>
                          <span className="ctx-rsi-zone-label">70 Overbought 100</span>
                        </div>
                      </div>
                    )}

                    {ctx.macd_signal && (
                      <div className="ctx-item">
                        <span className="ctx-item-label">MACD</span>
                        <span className={`ctx-badge ${macdBadgeClass(ctx.macd_signal)}`}>
                          {ctx.macd_signal}
                        </span>
                      </div>
                    )}

                    {ctx.golden_cross != null && (
                      <div className="ctx-item">
                        <span className="ctx-item-label">Golden Cross</span>
                        <span className={`ctx-badge ${ctx.golden_cross ? "bullish" : "neutral"}`}>
                          {ctx.golden_cross ? "✅ Ya" : "❌ Tidak"}
                        </span>
                      </div>
                    )}

                    {ctx.ml_recommendation && (
                      <div style={{ marginTop: 10 }}>
                        <div className="ctx-item" style={{ marginBottom: 4 }}>
                          <span className="ctx-item-label">ML Rekomendasi</span>
                          <span className={`ctx-badge ${mlBadgeClass(ctx.ml_recommendation)}`}>
                            {ctx.ml_recommendation}
                          </span>
                        </div>
                        {ctx.ml_confidence != null && (
                          <>
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              fontSize: 10, color: "var(--text-muted)", marginBottom: 3
                            }}>
                              <span>Confidence</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                                {Math.round(ctx.ml_confidence * 100)}%
                              </span>
                            </div>
                            <div className="ctx-conf-bar-bg">
                              <div
                                className="ctx-conf-bar-fill"
                                style={{ width: `${ctx.ml_confidence * 100}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="ctx-no-ticker">
                    <div className="ctx-no-ticker-icon">📊</div>
                    <div>Pilih saham di search bar untuk melihat data konteks real-time</div>
                  </div>
                )}
              </div>

              {/* Quick Prompts */}
              <div className="chat-sidebar-section">
                <div className="chat-sidebar-label">⚡ Quick Prompts</div>
                <div className="chat-quick-grid">
                  {prompts.map((p, i) => (
                    <button
                      key={i}
                      className="chat-quick-btn"
                      onClick={() => handleQuickPrompt(p.text)}
                      disabled={busy}
                    >
                      <span className="chat-quick-icon">{p.icon}</span>
                      {p.text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Info */}
              {chartStats && currentTicker && (
                <div className="chat-sidebar-section">
                  <div className="chat-sidebar-label">📈 Info Grafik</div>
                  <div className="ctx-item">
                    <span className="ctx-item-label">Periode</span>
                    <span className="ctx-item-val">{TIMEFRAMES.find(t => t.value === period)?.label}</span>
                  </div>
                  <div className="ctx-item">
                    <span className="ctx-item-label">Tren</span>
                    <span className={`ctx-badge ${chartStats.trend}`}>
                      {chartStats.trend === "bullish" ? "▲" : "▼"} {chartStats.trend.toUpperCase()}
                    </span>
                  </div>
                  <div className="ctx-item">
                    <span className="ctx-item-label">Perubahan</span>
                    <span
                      className="ctx-item-val"
                      style={{ color: chartStats.trend === "bullish" ? "var(--green)" : "var(--red)" }}
                    >
                      {chartStats.changePct}
                    </span>
                  </div>
                  <div className="ctx-item">
                    <span className="ctx-item-label">High</span>
                    <span className="ctx-item-val">{Number(chartStats.high).toLocaleString("id-ID")}</span>
                  </div>
                  <div className="ctx-item">
                    <span className="ctx-item-label">Low</span>
                    <span className="ctx-item-val">{Number(chartStats.low).toLocaleString("id-ID")}</span>
                  </div>
                </div>
              )}

            </div>
            {/* END RIGHT SIDEBAR */}

          </div>
          {/* END chat-layout */}

        </div>
      </div>
    </>
  )
}
