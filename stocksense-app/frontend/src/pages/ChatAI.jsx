import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const LS_KEY = "chat_stocksense"

const TIMEFRAMES = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
]

const MODES = [
  { key: "general",   label: "🔍 Umum",     desc: "Analisis holistik: teknikal + fundamental + makro" },
  { key: "technical", label: "⚡ Teknikal", desc: "RSI, MACD, support/resistance, setup trading" },
  { key: "news",      label: "📰 Berita",   desc: "Sentimen, katalis, berita emiten" },
  { key: "macro",     label: "🌍 Makro",    desc: "Suku bunga, inflasi, Rupiah, komoditas" },
]

const CHAT_MODELS = [
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "LLaMA-4 Scout",  color: "var(--purple)" },
  { id: "llama-3.3-70b-versatile",                   name: "LLaMA 3.3 70B",  color: "var(--teal)"   },
  { id: "llama-3.1-8b-instant",                      name: "LLaMA 3.1 8B",   color: "var(--blue)"   },
  { id: "qwen-2.5-32b",                              name: "Qwen 2.5 32B",   color: "var(--amber)"  },
  { id: "gemma2-9b-it",                              name: "Gemma2 9B",      color: "var(--green)"  },
]

function ModelPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = CHAT_MODELS.find(m => m.id === value) || CHAT_MODELS[0]

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onOutside)
    return () => document.removeEventListener("mousedown", onOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "transparent", border: "none",
          padding: 0, cursor: "pointer", transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{current.name}</span>
        <span style={{ fontSize: 8, color: "var(--text-muted)", marginLeft: 2, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 12px)", right: 0,
          background: "var(--bg-card)", border: "1px solid var(--border-light)",
          borderRadius: 8, padding: "6px", minWidth: 200,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          zIndex: 999, display: "flex", flexDirection: "column", gap: 2,
        }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, padding: "4px 8px 6px" }}>Pilih Model AI</div>
          {CHAT_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false) }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: value === m.id ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                borderRadius: 6, padding: "8px 10px",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = value === m.id ? "rgba(255,255,255,0.06)" : "transparent"}
            >
              <div style={{
                background: m.color,
                borderRadius: "50%", width: 8, height: 8,
                flexShrink: 0, boxShadow: `0 0 8px ${m.color}88`
              }} />
              <div style={{ fontSize: 13, fontWeight: value === m.id ? 600 : 400, color: value === m.id ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {m.name}
              </div>
              {value === m.id && <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 13 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const QUICK_PROMPTS = {
  general: [
    { icon: "📋", text: "Analisis lengkap saham ini" },
    { icon: "🎯", text: "Beli, hold, atau jual?" },
    { icon: "💡", text: "Apakah layak diinvestasi sekarang?" },
    { icon: "⚠️", text: "Apa risiko terbesar saham ini?" },
  ],
  technical: [
    { icon: "🕯️", text: "Analisis candlestick chart ini" },
    { icon: "🔍", text: "Level support dan resistance" },
    { icon: "📡", text: "Sinyal RSI dan MACD saat ini" },
    { icon: "↔️", text: "Bandingkan MA20 dan MA50" },
  ],
  news: [
    { icon: "📰", text: "Dampak sentimen berita ke harga" },
    { icon: "🔥", text: "Katalis positif terbaru" },
    { icon: "🚨", text: "Risiko dari berita negatif" },
    { icon: "📊", text: "Sentimen pasar minggu ini" },
  ],
  macro: [
    { icon: "🏦", text: "Dampak suku bunga BI" },
    { icon: "💱", text: "Pengaruh nilai tukar rupiah" },
    { icon: "🌍", text: "Faktor global yang mempengaruhi" },
    { icon: "📉", text: "Risiko makro yang perlu diwaspadai" },
  ],
}

// ── Image downscaler ─────────────────────────────────────────────────────────
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

// ── Markdown renderer (line-by-line parser) ──────────────────────────────────
function mdInline(text) {
  // Protect already-escaped HTML, then apply inline formatting
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

function mdTable(rows) {
  if (!rows.length) return ""
  const parse = row => row.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
  const isSep = r => /^[\s|:\-]+$/.test(r)
  const hasHead = rows.length >= 2 && isSep(rows[1])
  let html = '<div class="chat-md-table-wrap"><table>'
  if (hasHead) {
    html += "<thead><tr>" + parse(rows[0]).map(c => `<th>${mdInline(c)}</th>`).join("") + "</tr></thead><tbody>"
    for (let j = 2; j < rows.length; j++) {
      html += "<tr>" + parse(rows[j]).map(c => `<td>${mdInline(c)}</td>`).join("") + "</tr>"
    }
    html += "</tbody>"
  } else {
    html += "<tbody>"
    rows.forEach(r => { html += "<tr>" + parse(r).map(c => `<td>${mdInline(c)}</td>`).join("") + "</tr>" })
    html += "</tbody>"
  }
  return html + "</table></div>"
}

function renderMarkdown(raw) {
  if (!raw) return ""

  // 1. Protect code blocks
  const codes = []
  let text = raw.replace(/```([\w]*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
    codes.push({ lang: lang || "", code: code.replace(/</g, "&lt;").replace(/>/g, "&gt;") })
    return `\x00C${codes.length - 1}\x00`
  })

  // 2. Escape remaining HTML
  text = text.replace(/&(?!amp;|lt;|gt;|nbsp;)/g, "&amp;")
    .replace(/<(?![/\x00])/g, "&lt;")

  const lines = text.split(/\r?\n/)
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Code block placeholder
    const codeMatch = trimmed.match(/^\x00C(\d+)\x00$/)
    if (codeMatch) {
      const { lang, code } = codes[parseInt(codeMatch[1])]
      out.push(
        `<div class="chat-code-block">` +
        (lang ? `<div class="chat-code-lang">${lang}</div>` : "") +
        `<pre><code>${code.trimEnd()}</code></pre></div>`
      )
      i++; continue
    }

    // HR
    if (/^---+$/.test(trimmed)) { out.push("<hr/>"); i++; continue }

    // Headings
    if (/^### /.test(line)) { out.push(`<h3>${mdInline(line.slice(4))}</h3>`); i++; continue }
    if (/^## /.test(line))  { out.push(`<h2>${mdInline(line.slice(3))}</h2>`); i++; continue }
    if (/^# /.test(line))   { out.push(`<h1>${mdInline(line.slice(2))}</h1>`); i++; continue }

    // Blockquote
    if (/^> /.test(line)) {
      const qLines = []
      while (i < lines.length && /^> /.test(lines[i])) { qLines.push(mdInline(lines[i].slice(2))); i++ }
      out.push(`<blockquote><p>${qLines.join("<br/>")}</p></blockquote>`)
      continue
    }

    // Table
    if (/^\|.+\|/.test(line)) {
      const tRows = []
      while (i < lines.length && /^\|/.test(lines[i].trim())) { tRows.push(lines[i]); i++ }
      out.push(mdTable(tRows))
      continue
    }

    // Ordered list (collect all consecutive)
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\d+\.\s/, ""))}</li>`)
        i++
      }
      out.push(`<ol>${items.join("")}</ol>`)
      continue
    }

    // Unordered list (collect all consecutive)
    if (/^[-*]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^[-*]\s/, ""))}</li>`)
        i++
      }
      out.push(`<ul>${items.join("")}</ul>`)
      continue
    }

    // Empty line (skip — used as block separator)
    if (!trimmed) { i++; continue }

    // Paragraph: accumulate consecutive regular lines
    const pLines = []
    while (i < lines.length) {
      const l = lines[i], lt = l.trim()
      if (!lt || /^(#{1,3}\s|---+$|>\s|\||\d+\.\s|[-*]\s|\x00C)/.test(l)) break
      pLines.push(mdInline(l))
      i++
    }
    if (pLines.length) out.push(`<p>${pLines.join("<br/>")}</p>`)
  }

  return out.join("\n")
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}
function rsiColor(v) {
  return v >= 70 ? "var(--red)" : v <= 30 ? "var(--green)" : "var(--blue)"
}
function rsiLabel(v) {
  return v >= 70 ? "Overbought" : v <= 30 ? "Oversold" : "Netral"
}
function macdClass(s) {
  if (!s) return "neutral"
  const l = String(s).toLowerCase()
  return l.includes("bull") || l.includes("beli") || l.includes("buy") ? "bullish"
    : l.includes("bear") || l.includes("jual") || l.includes("sell") ? "bearish"
    : "neutral"
}
function mlClass(r) {
  if (!r) return "neutral"
  const u = String(r).toUpperCase()
  if (u === "BUY" || u === "BELI" || u === "STRONG BUY") return "buy"
  if (u === "SELL" || u === "JUAL" || u === "STRONG SELL") return "sell"
  return "hold"
}

// ── Candlestick Canvas draw function ─────────────────────────────────────────
function drawCandlestick(canvas, data) {
  if (!canvas || !data || !data.length) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const W = rect.width, H = rect.height
  if (!W || !H) return
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext("2d")
  ctx.scale(dpr, dpr)

  const PAD = { top: 14, right: 58, bottom: 26, left: 6 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom
  const n = data.length

  const minL = Math.min(...data.map(d => d.low))
  const maxH = Math.max(...data.map(d => d.high))
  const pr = (maxH - minL) || 1
  const pad = pr * 0.06
  const pMin = minL - pad, pMax = maxH + pad, pRange = pMax - pMin

  const toY = p => PAD.top + cH - ((p - pMin) / pRange) * cH
  const slotW = cW / n
  const bodyW = Math.max(1, Math.min(10, Math.floor(slotW * 0.7)))
  const toX = i => PAD.left + i * slotW + slotW / 2

  ctx.clearRect(0, 0, W, H)

  // Grid + price axis
  for (let i = 0; i <= 5; i++) {
    const frac = i / 5
    const y = PAD.top + cH * frac
    const price = pMax - pRange * frac
    ctx.strokeStyle = "rgba(255,255,255,0.04)"
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
    ctx.fillStyle = "#7e8494"
    ctx.font = '9px "Space Mono", monospace'
    ctx.textAlign = "right"
    ctx.fillText(price >= 1000 ? (price / 1000).toFixed(1) + "K" : price.toFixed(0), W - 4, y + 3)
  }

  // Candles
  data.forEach((d, i) => {
    const x = toX(i), isBull = d.close >= d.open
    const col = isBull ? "#2dd4a0" : "#f55e5e"
    ctx.strokeStyle = col; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, toY(d.high)); ctx.lineTo(x, toY(d.low)); ctx.stroke()
    const yTop = Math.min(toY(d.open), toY(d.close))
    const bH = Math.max(1, Math.abs(toY(d.close) - toY(d.open)))
    ctx.fillStyle = isBull ? "rgba(45,212,160,0.85)" : "rgba(245,94,94,0.85)"
    ctx.fillRect(x - bodyW / 2, yTop, bodyW, bH)
  })

  // X axis date labels
  const maxLabels = Math.floor(W / 64)
  const step = Math.max(1, Math.floor(n / maxLabels))
  ctx.fillStyle = "#7e8494"; ctx.font = '9px "Space Mono", monospace'; ctx.textAlign = "center"
  data.forEach((d, i) => {
    if (i % step === 0 || i === n - 1) {
      const dt = new Date(d.date)
      ctx.fillText(dt.toLocaleDateString("id-ID", { month: "short", day: "numeric" }), toX(i), H - 6)
    }
  })
}

// ── CandlestickChart Component ────────────────────────────────────────────────
function CandlestickChart({ data, loading }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const dataRef = useRef(data)
  const [tooltip, setTooltip] = useState(null)
  dataRef.current = data

  useEffect(() => {
    drawCandlestick(canvasRef.current, data)
  }, [data])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      drawCandlestick(canvasRef.current, dataRef.current)
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  function onMouseMove(e) {
    const canvas = canvasRef.current
    if (!canvas || !data || !data.length) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const PAD_L = 6, PAD_R = 58
    const cW = rect.width - PAD_L - PAD_R
    const n = data.length
    const slotW = cW / n
    const idx = Math.max(0, Math.min(n - 1, Math.floor((mx - PAD_L) / slotW)))
    const d = data[idx]
    if (!d) return
    const tooltipW = 148, tooltipH = 100
    const tipX = mx + 12 + tooltipW > rect.width ? mx - tooltipW - 8 : mx + 12
    const tipY = Math.max(4, Math.min(e.clientY - rect.top - 40, rect.height - tooltipH - 4))
    setTooltip({
      x: tipX, y: tipY,
      date: new Date(d.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
      open: Number(d.open).toLocaleString("id-ID"),
      high: Number(d.high).toLocaleString("id-ID"),
      low: Number(d.low).toLocaleString("id-ID"),
      close: Number(d.close).toLocaleString("id-ID"),
      vol: Number(d.volume).toLocaleString("id-ID"),
      bull: d.close >= d.open,
    })
  }

  if (loading) return <div className="csc-skeleton" />
  if (!data || !data.length) return <div className="csc-empty">Data tidak tersedia</div>

  return (
    <div ref={wrapRef} className="csc-wrap" onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}>
      <canvas ref={canvasRef} className="csc-canvas" />
      {tooltip && (
        <div className="csc-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="csc-tt-date">{tooltip.date}</div>
          <div className="csc-tt-row"><span>O</span><span style={{ color: tooltip.bull ? "var(--green)" : "var(--red)" }}>{tooltip.open}</span></div>
          <div className="csc-tt-row"><span>H</span><span style={{ color: "var(--green)" }}>{tooltip.high}</span></div>
          <div className="csc-tt-row"><span>L</span><span style={{ color: "var(--red)" }}>{tooltip.low}</span></div>
          <div className="csc-tt-row csc-tt-close"><span>C</span><span style={{ color: tooltip.bull ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{tooltip.close}</span></div>
          <div className="csc-tt-row csc-tt-vol"><span>Vol</span><span>{tooltip.vol}</span></div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ChatAI() {
  const { currentTicker } = useApp()
  const code = currentTicker ? currentTicker.replace(".JK", "") : ""

  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] }
  })
  const [input, setInput] = useState("")
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [stockCtx, setStockCtx] = useState(null)
  const [mode, setMode] = useState("general")
  const [chatModel, setChatModel] = useState("meta-llama/llama-4-scout-17b-16e-instruct")
  const [period, setPeriod] = useState("3mo")
  const [histData, setHistData] = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const [chartStats, setChartStats] = useState(null)

  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(messages)) } catch {}
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Fetch stock context
  useEffect(() => {
    if (!currentTicker) { setStockCtx(null); return }
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
      setStockCtx({
        ticker: currentTicker,
        price: info?.current_price ?? null,
        change_pct: info?.change_percent ?? info?.change_pct ?? null,
        rsi: indi?.rsi?.value ?? null,
        macd_signal: indi?.macd?.signal ?? null,
        golden_cross: indi?.moving_average?.golden_cross ?? null,
        ml_recommendation: pr?.recommendation ?? null,
        ml_confidence: pr?.confidence ?? null,
      })
    })
    return () => { alive = false }
  }, [currentTicker])

  // Fetch history
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
          const changePct = ((last - first) / first * 100).toFixed(2)
          setChartStats({
            trend: last >= first ? "bullish" : "bearish",
            changePct: (changePct > 0 ? "+" : "") + changePct + "%",
            high: Math.max(...data.map(d => d.high)),
            low: Math.min(...data.map(d => d.low)),
          })
        } else setChartStats(null)
      })
      .catch(() => { if (alive) { setHistData([]); setChartStats(null) } })
      .finally(() => { if (alive) setHistLoading(false) })
    return () => { alive = false }
  }, [currentTicker, period])

  const fullCtx = useMemo(() => {
    if (!stockCtx) return null
    return {
      ...stockCtx,
      chart_period: period,
      chart_trend: chartStats?.trend ?? null,
      chart_change_pct: chartStats?.changePct ?? null,
      chart_high: chartStats?.high ?? null,
      chart_low: chartStats?.low ?? null,
    }
  }, [stockCtx, period, chartStats])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) { setErr("File harus berupa gambar."); return }
    try {
      setImage(await downscaleImage(file, 1024, 0.85)); setErr("")
    } catch (e2) {
      setErr("Gagal memproses gambar: " + e2.message)
    } finally { if (fileRef.current) fileRef.current.value = "" }
  }

  async function send(overrideText) {
    const text = (overrideText ?? input).trim()
    if ((!text && !image) || busy) return
    const userMsg = { role: "user", content: text, image: image || undefined, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next); setInput(""); setImage(null); setBusy(true); setErr("")
    if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "36px" }
    try {
      const res = await api.chat({
        messages: next.map(m => ({ role: m.role, content: m.content || "", image: m.image })),
        stock_context: fullCtx || undefined,
        mode,
        model: chatModel,
      })
      setMessages(cur => [...cur, { role: "assistant", content: res.reply || "(kosong)", ts: Date.now() }])
    } catch (e) {
      setErr(e.message)
      setMessages(cur => [...cur, { role: "assistant", content: "Gagal mendapatkan jawaban: " + e.message, error: true, ts: Date.now() }])
    } finally { setBusy(false) }
  }

  function handleQuickPrompt(text) {
    const fullText = code ? text + " " + code : text
    send(fullText)
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  function onTAInput(e) {
    const el = e.target
    el.style.height = "36px"
    el.style.height = Math.min(el.scrollHeight, 140) + "px"
    setInput(el.value)
  }

  const clearChat = () => { setMessages([]); setErr("") }
  const prompts = QUICK_PROMPTS[mode] || QUICK_PROMPTS.general
  const chgNum = stockCtx?.change_pct != null ? parseFloat(stockCtx.change_pct) : null

  return (
    <>
      <TickerSearchBar label="Chat AI" />

      <div className="chat-root">

        {/* HEADER */}
        <div className="chat-hdr">
          <div className="chat-hdr-brand">
            <div className="chat-hdr-avatar">🤖</div>
            <div>
              <div className="chat-hdr-name">StockSense AI Advisor</div>
              <div className="chat-hdr-sub">AI Advisor · IDX Specialist</div>
            </div>
          </div>

          <nav className="chat-mode-nav">
            {MODES.map(m => (
              <button
                key={m.key}
                className={"chat-mode-btn" + (mode === m.key ? " active" : "")}
                onClick={() => setMode(m.key)}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </nav>

          <button className="chat-clear-btn" onClick={clearChat} disabled={busy || !messages.length}>
            🗑 Hapus
          </button>
        </div>

        {/* BODY */}
        <div className="chat-body">

          {/* ── LEFT PANEL ──────────────────────────────────────────── */}
          <div className="chat-lpanel">

            {/* Price header */}
            <div className="chat-price-hdr">
              {stockCtx?.ticker ? (
                <>
                  <div>
                    <div className="chat-price-code">{code}</div>
                    {stockCtx.price != null && (
                      <div className="chat-price-val">
                        Rp {Number(stockCtx.price).toLocaleString("id-ID")}
                      </div>
                    )}
                  </div>
                  {chgNum != null && (
                    <div className={"chat-price-chg " + (chgNum >= 0 ? "pos" : "neg")}>
                      {chgNum >= 0 ? "▲" : "▼"} {Math.abs(chgNum).toFixed(2)}%
                    </div>
                  )}
                </>
              ) : (
                <div className="chat-price-none">Pilih saham dari search bar ↑</div>
              )}
            </div>

            {/* Timeframe + trend */}
            <div className="chat-tf-row">
              <div className="chat-tf-pills">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    className={"chat-tf-pill" + (period === tf.value ? " active" : "")}
                    onClick={() => setPeriod(tf.value)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
              {chartStats && (
                <span className={"chat-tf-trend " + chartStats.trend}>
                  {chartStats.trend === "bullish" ? "▲" : "▼"} {chartStats.changePct}
                </span>
              )}
            </div>

            {/* Candlestick chart */}
            <div className="chat-chart-area">
              {!currentTicker ? (
                <div className="csc-empty">Pilih saham untuk melihat grafik</div>
              ) : (
                <CandlestickChart data={histData} loading={histLoading} />
              )}
            </div>

            <div className="chat-lpanel-sep" />

            {/* Indicators */}
            <div className="chat-ctx-wrap">
              {stockCtx?.ticker ? (
                <>
                  {stockCtx.rsi != null && (
                    <div className="chat-ctx-block">
                      <div className="chat-ctx-row">
                        <span className="chat-ctx-lbl">RSI (14)</span>
                        <span className="chat-ctx-val" style={{ color: rsiColor(stockCtx.rsi) }}>
                          {Math.round(stockCtx.rsi)} — {rsiLabel(stockCtx.rsi)}
                        </span>
                      </div>
                      <div className="chat-rsi-track">
                        <div className="chat-rsi-fill" style={{ width: Math.min(stockCtx.rsi, 100) + "%", background: rsiColor(stockCtx.rsi) }} />
                        <div className="chat-rsi-line" style={{ left: "70%" }} />
                        <div className="chat-rsi-line" style={{ left: "30%" }} />
                      </div>
                    </div>
                  )}

                  <div className="chat-badge-grid">
                    {stockCtx.macd_signal && (
                      <div className="chat-badge-item">
                        <span className="chat-ctx-lbl">MACD</span>
                        <span className={"chat-badge " + macdClass(stockCtx.macd_signal)}>{stockCtx.macd_signal}</span>
                      </div>
                    )}
                    {stockCtx.golden_cross != null && (
                      <div className="chat-badge-item">
                        <span className="chat-ctx-lbl">Golden Cross</span>
                        <span className={"chat-badge " + (stockCtx.golden_cross ? "bullish" : "neutral")}>
                          {stockCtx.golden_cross ? "✅ Ya" : "❌ Tidak"}
                        </span>
                      </div>
                    )}
                    {stockCtx.ml_recommendation && (
                      <div className="chat-badge-item">
                        <span className="chat-ctx-lbl">ML Signal</span>
                        <span className={"chat-badge " + mlClass(stockCtx.ml_recommendation)}>{stockCtx.ml_recommendation}</span>
                      </div>
                    )}
                  </div>

                  {stockCtx.ml_confidence != null && (
                    <div className="chat-conf-block">
                      <div className="chat-ctx-row">
                        <span className="chat-ctx-lbl">Confidence</span>
                        <span className="chat-ctx-val">{Math.round(stockCtx.ml_confidence * 100)}%</span>
                      </div>
                      <div className="chat-conf-track">
                        <div className="chat-conf-fill" style={{ width: (stockCtx.ml_confidence * 100) + "%" }} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="chat-ctx-empty">
                  Pilih saham untuk melihat indikator teknikal real-time
                </div>
              )}
            </div>

            <div className="chat-lpanel-sep" />

            {/* Quick prompts */}
            <div className="chat-quick-wrap">
              <div className="chat-quick-head">⚡ Quick Ask</div>
              <div className="chat-quick-list">
                {prompts.map((p, i) => (
                  <button
                    key={i}
                    className="chat-quick-btn"
                    onClick={() => handleQuickPrompt(p.text)}
                    disabled={busy}
                  >
                    <span className="chat-quick-icon">{p.icon}</span>
                    <span className="chat-quick-text">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
          {/* END LEFT PANEL */}

          {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
          <div className="chat-rpanel">

            {/* Messages */}
            <div className="chat-msgs" ref={scrollRef}>
              {!messages.length && (
                <div className="chat-empty">
                  <div className="chat-empty-icon">🤖</div>
                  <div className="chat-empty-title">AI Advisor Siap Membantu</div>
                  <div className="chat-empty-sub">
                    Pilih mode analisis, gunakan Quick Ask, atau ketik pertanyaanmu di bawah.
                  </div>
                  <div className="chat-empty-hints">
                    <div className="chat-empty-hint"><span>🕯️</span>Lihat candlestick, tanya analisis teknikal</div>
                    <div className="chat-empty-hint"><span>⚡</span>Klik Quick Ask di panel kiri</div>
                    <div className="chat-empty-hint"><span>🖼️</span>Upload screenshot chart untuk dianalisis</div>
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={"chat-msg " + (m.role === "user" ? "user" : "ai")}>
                  <div className="chat-msg-meta">
                    <span className="chat-msg-who">{m.role === "user" ? "Kamu" : "AI Advisor"}</span>
                    <span className="chat-msg-ts">{fmtTime(m.ts)}</span>
                    {m.content && (
                      <button
                        className="chat-msg-copy"
                        onClick={() => navigator.clipboard?.writeText(m.content).catch(() => {})}
                        title="Salin"
                      >📋</button>
                    )}
                  </div>
                  <div className={"chat-bubble " + (m.role === "user" ? "user" : m.error ? "error" : "ai")}>
                    {m.image && <img src={m.image} alt="lampiran" className="chat-bubble-img" />}
                    {m.content && m.role === "assistant" && !m.error ? (
                      <div className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                    ) : m.content ? (
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                    ) : null}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="chat-msg ai">
                  <div className="chat-msg-meta"><span className="chat-msg-who">AI Advisor</span></div>
                  <div className="chat-typing">
                    <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
                  </div>
                </div>
              )}
            </div>

            {err && <div className="chat-err">⚠️ {err}</div>}

            {/* Input bar */}
            <div className="chat-input-area">
              {image && (
                <div className="chat-img-prev">
                  <img src={image} alt="preview" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Gambar terlampir</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Akan dianalisis bersama pesan</div>
                  </div>
                  <button className="chat-img-rm" onClick={() => setImage(null)}>×</button>
                </div>
              )}
              <div className="chat-input-row">
                <button className="chat-attach" onClick={() => fileRef.current?.click()} disabled={busy} title="Upload gambar">
                  📎
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  placeholder="Tulis pertanyaan... (Enter kirim, Shift+Enter baris baru)"
                  value={input}
                  onInput={onTAInput}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  disabled={busy}
                />
                <button
                  className="chat-send"
                  onClick={() => send()}
                  disabled={busy || (!input.trim() && !image)}
                >
                  {busy ? "⋯" : "➤"}
                </button>
              </div>
              <div className="chat-input-hint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  {stockCtx?.ticker
                    ? code + " · " + (MODES.find(m => m.key === mode)?.label || mode) + " · " + (TIMEFRAMES.find(t => t.value === period)?.label || period)
                    : "Pilih saham untuk analisis berbasis data real-time"}
                </span>
                <ModelPicker value={chatModel} onChange={setChatModel} />
              </div>
            </div>

          </div>
          {/* END RIGHT PANEL */}

        </div>
        {/* END BODY */}

      </div>
    </>
  )
}
