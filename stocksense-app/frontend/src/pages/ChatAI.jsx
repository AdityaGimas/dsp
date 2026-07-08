import { useEffect, useMemo, useRef, useState } from "react"
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
  { key: "general",   label: "🔍 Umum",     desc: "Analisis holistik: teknikal + prediksi ML + sentimen + makro" },
  { key: "technical", label: "⚡ Teknikal", desc: "RSI, MACD, support/resistance, setup trading dari data indikator" },
  { key: "news",      label: "📰 Berita",   desc: "Sentimen IndoBERT, katalis, headlines berita emiten" },
  { key: "macro",     label: "🌍 Makro",    desc: "BI Rate, inflasi, PDB, IHSG, USD/IDR dari data resmi" },
]

// Model default — LLaMA-4 Scout (tidak bisa diganti via UI)
const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

const QUICK_PROMPTS = {
  general: [
    { icon: "📋", text: "Analisis lengkap saham ini berdasarkan semua data" },
    { icon: "🎯", text: "Beli, hold, atau jual berdasarkan data prediksi dan sentimen?" },
    { icon: "💡", text: "Apakah layak diinvestasi sekarang?" },
    { icon: "⚠️", text: "Apa risiko terbesar berdasarkan kondisi saat ini?" },
  ],
  technical: [
    { icon: "🕯️", text: "Analisis candlestick dan tren dari grafik ini" },
    { icon: "🔍", text: "Level support dan resistance berdasarkan data chart" },
    { icon: "📡", text: "Jelaskan sinyal RSI dan MACD saat ini" },
    { icon: "🎯", text: "Setup trading: entry, stop loss, dan target dari prediksi" },
  ],
  news: [
    { icon: "📰", text: "Jelaskan sentimen pasar berdasarkan berita terbaru" },
    { icon: "🔥", text: "Apa katalis positif dari berita yang ada?" },
    { icon: "🚨", text: "Apa risiko dari berita negatif yang tersedia?" },
    { icon: "📊", text: "Bagaimana sentimen berita mempengaruhi harga saham ini?" },
  ],
  macro: [
    { icon: "🏦", text: "Bagaimana dampak BI Rate saat ini ke saham ini?" },
    { icon: "💱", text: "Analisis pengaruh USD/IDR dan inflasi ke emiten ini" },
    { icon: "🌍", text: "Bagaimana kondisi makro Indonesia mempengaruhi saham ini?" },
    { icon: "📉", text: "Skenario risiko makro yang perlu diwaspadai" },
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

  const codes = []
  let text = raw.replace(/```([\w]*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
    codes.push({ lang: lang || "", code: code.replace(/</g, "&lt;").replace(/>/g, "&gt;") })
    return `\x00C${codes.length - 1}\x00`
  })

  text = text.replace(/&(?!amp;|lt;|gt;|nbsp;)/g, "&amp;")
    .replace(/<(?![/\x00])/g, "&lt;")

  const lines = text.split(/\r?\n/)
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

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

    if (/^---+$/.test(trimmed)) { out.push("<hr/>"); i++; continue }

    if (/^### /.test(line)) { out.push(`<h3>${mdInline(line.slice(4))}</h3>`); i++; continue }
    if (/^## /.test(line))  { out.push(`<h2>${mdInline(line.slice(3))}</h2>`); i++; continue }
    if (/^# /.test(line))   { out.push(`<h1>${mdInline(line.slice(2))}</h1>`); i++; continue }

    if (/^> /.test(line)) {
      const qLines = []
      while (i < lines.length && /^> /.test(lines[i])) { qLines.push(mdInline(lines[i].slice(2))); i++ }
      out.push(`<blockquote><p>${qLines.join("<br/>")}</p></blockquote>`)
      continue
    }

    if (/^\|.+\|/.test(line)) {
      const tRows = []
      while (i < lines.length && /^\|/.test(lines[i].trim())) { tRows.push(lines[i]); i++ }
      out.push(mdTable(tRows))
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\d+\.\s/, ""))}</li>`)
        i++
      }
      out.push(`<ol>${items.join("")}</ol>`)
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^[-*]\s/, ""))}</li>`)
        i++
      }
      out.push(`<ul>${items.join("")}</ul>`)
      continue
    }

    if (!trimmed) { i++; continue }

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

  // ── Data states
  const [stockCtx, setStockCtx]       = useState(null)
  const [predCtx, setPredCtx]         = useState(null)      // Prediksi ML lengkap
  const [newsCtx, setNewsCtx]         = useState(null)      // Sentimen + headlines
  const [macroCtx, setMacroCtx]       = useState(null)      // Data makro

  // ── Loading states
  const [loadingTech, setLoadingTech]     = useState(false)
  const [loadingPred, setLoadingPred]     = useState(false)
  const [loadingNews, setLoadingNews]     = useState(false)
  const [loadingMacro, setLoadingMacro]   = useState(false)

  const [mode, setMode]           = useState("general")
  const [period, setPeriod]       = useState("3mo")
  const [histData, setHistData]   = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const [chartStats, setChartStats]   = useState(null)

  const scrollRef   = useRef(null)
  const fileRef     = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(messages)) } catch {}
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // ── 1. Fetch data teknikal (harga + indikator)
  useEffect(() => {
    if (!currentTicker) { setStockCtx(null); return }
    let alive = true
    setLoadingTech(true)
    Promise.allSettled([
      api.getStockInfo(currentTicker),
      api.getIndicators(currentTicker),
    ]).then(([inf, ind]) => {
      if (!alive) return
      const info = inf.status === "fulfilled" ? inf.value : null
      const indi = ind.status === "fulfilled" ? ind.value : null
      setStockCtx({
        ticker: currentTicker,
        price: info?.current_price ?? null,
        change_pct: info?.change_percent ?? info?.change_pct ?? null,
        rsi: indi?.rsi?.value ?? null,
        macd_signal: indi?.macd?.signal ?? null,
        golden_cross: indi?.moving_average?.golden_cross ?? null,
      })
    }).finally(() => { if (alive) setLoadingTech(false) })
    return () => { alive = false }
  }, [currentTicker])

  // ── 2. Fetch prediksi ML lengkap
  useEffect(() => {
    if (!currentTicker) { setPredCtx(null); return }
    let alive = true
    setLoadingPred(true)
    api.getPrediction(currentTicker)
      .then(pr => {
        if (!alive) return
        setPredCtx({
          ml_recommendation: pr?.recommendation ?? null,
          ml_confidence: pr?.confidence ?? null,
          ml_entry: pr?.entry ?? null,
          ml_target: pr?.target ?? null,
          ml_stop_loss: pr?.stop_loss ?? null,
          ml_accuracy: pr?.model_accuracy ?? null,
          ml_predictions: (pr?.predictions ?? []).slice(0, 3).map(p => ({
            date: p.date,
            price: p.price,
            change_pct: p.change_pct,
            confidence: p.confidence,
          })),
        })
      })
      .catch(() => { if (alive) setPredCtx(null) })
      .finally(() => { if (alive) setLoadingPred(false) })
    return () => { alive = false }
  }, [currentTicker])

  // ── 3. Fetch berita + sentimen
  useEffect(() => {
    if (!currentTicker) { setNewsCtx(null); return }
    let alive = true
    setLoadingNews(true)
    setNewsCtx(null)

    api.getNews(currentTicker, 15)
      .then(async res => {
        if (!alive) return
        const articles = (res?.articles || res || []).slice(0, 10)
        if (!articles.length) {
          setNewsCtx({ noData: true })
          return
        }

        // Predict sentimen untuk artikel yang tersedia
        try {
          const sentRes = await api.predictSentiment(
            currentTicker,
            articles.map(a => ({ title: a.title || "", content: a.content || a.summary || "", category: a.category || "market" }))
          )
          if (!alive) return

          const summary = sentRes?.summary ?? {}
          const results = sentRes?.results ?? []

          // Gabungkan headline dengan sentimen
          const headlines = articles.slice(0, 8).map((a, i) => ({
            title: a.title || "",
            sentiment: results[i]?.sentiment || "neutral",
          }))

          setNewsCtx({
            sentiment_overall: summary.overall || "neutral",
            sentiment_score: summary.aggregate_score ?? summary.score ?? null,
            sentiment_positive_pct: summary.positive_pct ?? null,
            sentiment_negative_pct: summary.negative_pct ?? null,
            sentiment_neutral_pct: summary.neutral_pct ?? null,
            news_headlines: headlines,
          })
        } catch {
          // Jika sentimen gagal, simpan headlines saja tanpa skor
          if (!alive) return
          setNewsCtx({
            sentiment_overall: null,
            news_headlines: articles.slice(0, 8).map(a => ({ title: a.title || "", sentiment: "neutral" })),
          })
        }
      })
      .catch(() => { if (alive) setNewsCtx(null) })
      .finally(() => { if (alive) setLoadingNews(false) })

    return () => { alive = false }
  }, [currentTicker])

  // ── 4. Fetch makro ekonomi (sekali saat mount, refresh setiap 10 menit)
  useEffect(() => {
    let alive = true
    setLoadingMacro(true)

    function fetchMacro() {
      api.getMacro()
        .then(res => {
          if (!alive) return
          // Struktur dari macro_data.py:
          // res.data.IHSG.value, res.data.USDIDR.value
          // res.data.BIRate.value, res.data.Inflation.value, res.data.GDP.value
          const data = res?.data ?? {}

          const ihsg   = data?.IHSG   ?? null
          const usdidr = data?.USDIDR ?? null
          const biRate = data?.BIRate  ?? null
          const infl   = data?.Inflation ?? null
          const gdp    = data?.GDP ?? null

          setMacroCtx({
            macro_bi_rate:       biRate?.value ?? null,
            macro_bi_rate_desc:  biRate?.desc  ?? null,
            macro_inflation:     infl?.value   ?? null,
            macro_gdp:           gdp?.value    ?? null,
            macro_ihsg:          ihsg?.value   ?? null,
            macro_ihsg_change:   ihsg?.change_pct ?? null,
            macro_usdidr:        usdidr?.value ?? null,
            macro_usdidr_change: usdidr?.change_pct ?? null,
          })
        })
        .catch(() => { if (alive) setMacroCtx(null) })
        .finally(() => { if (alive) setLoadingMacro(false) })
    }

    fetchMacro()
    const interval = setInterval(fetchMacro, 10 * 60 * 1000) // refresh 10 menit
    return () => { alive = false; clearInterval(interval) }
  }, [])

  // ── 5. Fetch history candlestick
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

  // ── Gabungkan semua data ke fullCtx yang dikirim ke AI
  const fullCtx = useMemo(() => {
    if (!stockCtx) return null
    return {
      // Teknikal dasar
      ...stockCtx,
      // Prediksi ML
      ...(predCtx || {}),
      // Berita & Sentimen
      ...(newsCtx && !newsCtx.noData ? newsCtx : {}),
      // Makro
      ...(macroCtx || {}),
      // Chart
      chart_period: period,
      chart_trend: chartStats?.trend ?? null,
      chart_change_pct: chartStats?.changePct ?? null,
      chart_high: chartStats?.high ?? null,
      chart_low: chartStats?.low ?? null,
    }
  }, [stockCtx, predCtx, newsCtx, macroCtx, period, chartStats])

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
        model: DEFAULT_MODEL,
      })
      setMessages(cur => [...cur, { role: "assistant", content: res.reply || "(kosong)", ts: Date.now() }])
    } catch (e) {
      setErr(e.message)
      setMessages(cur => [...cur, { role: "assistant", content: "Gagal mendapatkan jawaban: " + e.message, error: true, ts: Date.now() }])
    } finally { setBusy(false) }
  }

  function handleQuickPrompt(text) {
    const fullText = code ? text + " untuk saham " + code : text
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

  // Hitung data summary untuk status bar
  const dataLoading = loadingTech || loadingPred || loadingNews || loadingMacro
  const dataReady = {
    tech: !!stockCtx,
    pred: !!predCtx,
    news: !!(newsCtx && !newsCtx.noData),
    macro: !!macroCtx,
  }
  const readyCount = Object.values(dataReady).filter(Boolean).length

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
              <div className="chat-hdr-sub">
                Analisis berbasis data real-time dashboard
                {currentTicker && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    · {readyCount}/4 data dimuat
                    {dataLoading && " ⏳"}
                  </span>
                )}
              </div>
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
                    AI hanya menganalisis data yang sudah dimuat dari dashboard — tidak mengarang fakta.
                  </div>
                  <div className="chat-empty-hints">
                    <div className="chat-empty-hint"><span>📊</span>Teknikal: RSI, MACD, support/resistance dari data nyata</div>
                    <div className="chat-empty-hint"><span>📰</span>Berita: sentimen IndoBERT dari {newsCtx?.news_headlines?.length || 0} artikel terbaru</div>
                    <div className="chat-empty-hint"><span>🌍</span>Makro: BI Rate {macroCtx?.macro_bi_rate ? macroCtx.macro_bi_rate + "%" : "..."}, inflasi, IHSG</div>
                    <div className="chat-empty-hint"><span>🤖</span>Prediksi XGBoost: entry, target, stop-loss 3 hari ke depan</div>
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
                  placeholder={currentTicker
                    ? `Tanya tentang ${code}... (data ${readyCount}/4 sudah dimuat)`
                    : "Pilih saham dulu, lalu tanya AI..."}
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
              <div className="chat-input-hint">
                <span>
                  {stockCtx?.ticker
                    ? `${code} · ${MODES.find(m => m.key === mode)?.label || mode} · ${TIMEFRAMES.find(t => t.value === period)?.label || period} · Data: ${readyCount}/4`
                    : "Pilih saham untuk analisis berbasis data real-time"}
                </span>
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
