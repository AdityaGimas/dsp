import { useEffect, useMemo, useRef, useState } from "react"
import { Line, Bar } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"
import { OvSentTabs, OvCompare, ArticleBadges } from "./sentimentUi.jsx"
import {
  fmt,
  fmtBig,
  fmtVol,
  recColor,
  recLabel,
  indColor,
  DAY_ID,
  MON_ID,
  fmtAge,
  saveCache,
  loadCache,
} from "../utils/format.js"

// ── static inline styles (named to avoid double-brace JSX) ────────
const S = {
  flex1: { flex: 1 },
  green: { color: "var(--green)" },
  red: { color: "var(--red)" },
  blueTxt: { color: "var(--blue)" },
  purpleTxt: { color: "var(--purple)" },
  tealTxt: { color: "var(--teal)" },
  greenTxt: { color: "var(--green)" },
  amberTxt: { color: "var(--amber)" },
  blueV: { color: "var(--blue)" },
  redV: { color: "var(--red)" },
  greenV: { color: "var(--green)" },
  mutedV: { color: "var(--text-muted)" },
  kpiGrid: { gridTemplateColumns: "repeat(4,1fr)" },
  kpiClickable: { cursor: 'pointer' },
  kpiDetailPanel: { gridColumn: '1/-1', marginTop: 12, padding: 16, borderRadius: 12, background: 'rgba(127,127,127,0.06)', border: '1px solid var(--border)' },
  kpiDetailHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontWeight: 600, fontSize: 13 },
  kpiDetailClose: { cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 },
  kpiDetailBody: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.6 },
  kpiDetailRow: { fontSize: 12 },
  kpiDetailNote: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 },
  kpiDetailList: { margin: '2px 0 2px 16px', padding: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 },
  gridFull: { gridColumn: "1/-1" },
  pad10: { padding: "10px 0" },
  mt4: { marginTop: 4 },
  spinPurple: { borderTopColor: "var(--purple)" },
  groqBtn: {
    borderRadius: "var(--r-sm)",
    background: "rgba(167,139,250,0.1)",
    borderColor: "rgba(167,139,250,0.2)",
    color: "var(--purple)",
  },
  legSolidBlue: { background: "#4f9cf9" },
  legDashBlue: { background: "#4f9cf9", borderTop: "2px dashed #4f9cf9", height: 0 },
  legDashPurple: { background: "#a78bfa", borderTop: "2px dashed #a78bfa", height: 0 },
  legSolidPurple: { background: "#a78bfa" },
  newsCount: { fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" },
  newsBodyPad: { padding: "6px 16px 14px" },
  rowGap8: { display: "flex", alignItems: "center", gap: 8 },
  rowGap6: { display: "flex", alignItems: "center", gap: 6 },
  reasons: { marginTop: 6, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 },
  grokRangePill: { background: "rgba(167,139,250,0.12)", color: "var(--purple)" },
  predEmpty: { gridColumn: "1/-1", color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "12px 0" },
  gap12: { height: 12 },
  predGap: { padding: "10px 0", fontSize: 11, color: "var(--text-muted)", textAlign: "center" },
  agreeText: { fontSize: 11 },
  summaryEm: { color: "var(--purple)" },
  sentDefault: { textAlign: "center", padding: "16px 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 },
  newsDefault: { color: "var(--text-muted)", fontSize: 12, padding: "12px 0", textAlign: "center" },
}

const SENT_META = {
  positive: { cls: "esb-pos", label: "Positif", short: "POS" },
  neutral: { cls: "esb-neu", label: "Netral", short: "NTR" },
  negative: { cls: "esb-neg", label: "Negatif", short: "NEG" },
}

const CAT_LABELS = {
  market: "📈 Pasar",
  macro: "🏦 Makro Ekonomi",
  geopolitics: "🌍 Geopolitik",
}

// ── MA helpers (module-level, stable ref) ─────────────────────────────
function calcMA(data, n) {
  // Pass 1: hitung MA normal (null untuk n-1 titik pertama)
  const result = data.map((_, i) => {
    if (i < n - 1) return null
    const slice = data.slice(i - n + 1, i + 1)
    const sum = slice.reduce((a, b) => a + (b ?? 0), 0)
    return parseFloat((sum / n).toFixed(2))
  })
  // Pass 2: back-fill — isi null di kiri dengan nilai MA pertama
  const firstValid = result.find((v) => v !== null)
  if (firstValid != null) {
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) result[i] = firstValid
      else break
    }
  }
  return result
}

const MA_COLORS = {
  5: { color: "#facc15", label: "MA 5" },
  20: { color: "#f97316", label: "MA 20" },
  50: { color: "#22d3ee", label: "MA 50" },
}


// ── Custom Dropdown for LLM Provider ────────────────────────
function LlmDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const opts = [
    { id: "groq", label: "Groq", color: "var(--purple)" },
    { id: "openai", label: "OpenAI", color: "var(--green)" }
  ]
  const active = opts.find(o => o.id === value) || opts[0]

  return (
    <div ref={ref} style={{ position: "relative", marginLeft: 8 }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{
          height: 28, 
          padding: "0 28px 0 14px", 
          borderRadius: 14, 
          fontSize: 11, 
          fontWeight: 600,
          background: "rgba(255,255,255,0.06)", 
          color: "var(--text-primary)", 
          border: open ? `1px solid ${active.color}` : "1px solid rgba(255,255,255,0.1)", 
          cursor: "pointer", 
          display: "flex",
          alignItems: "center",
          transition: "all 0.2s"
        }}
        onMouseOver={(e) => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.1)" }}
        onMouseOut={(e) => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.06)" }}
      >
        {active.label}
        <div style={{ position: "absolute", right: 10, color: "var(--text-muted)", fontSize: 9, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▼
        </div>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6,
          background: "#1c2028", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, overflow: "hidden", minWidth: 100,
          zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.6)"
        }}>
          {opts.map(o => (
            <div
              key={o.id}
              onClick={() => { onChange(o.id); setOpen(false) }}
              style={{
                padding: "8px 14px", fontSize: 11, fontWeight: 600,
                color: value === o.id ? o.color : "var(--text-primary)",
                background: value === o.id ? "rgba(255,255,255,0.05)" : "transparent",
                cursor: "pointer", transition: "background 0.2s"
              }}
              onMouseOver={(e) => { if (value !== o.id) e.target.style.background = "rgba(255,255,255,0.03)" }}
              onMouseOut={(e) => { if (value !== o.id) e.target.style.background = "transparent" }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Overview() {
  const { currentTicker, refreshTrigger, isRefreshing, setIsRefreshing, newsCache, fetchNewsForTicker, llmProvider, setLlmProvider, triggerRefresh } = useApp()

  const [info, setInfo] = useState(null)
  const [hist, setHist] = useState([])
  const [period, setPeriod] = useState("3mo")
  const [maPeriods, setMaPeriods] = useState([])
  const [volumeMaPeriod, setVolumeMaPeriod] = useState(20)
  const [indicators, setIndicators] = useState(null)
  const [mlPredRaw, setMlPredRaw] = useState(null)
  const [predHist, setPredHist] = useState(null)
  const [groqTechRaw, setGroqTechRaw] = useState(null)
  const [sentModel, setSentModel] = useState("compare")
  const [macroData, setMacroData] = useState(null)
  const [finalReco, setFinalReco] = useState(null)
  const [finalRecoBusy, setFinalRecoBusy] = useState(false)
  const [activeKpi, setActiveKpi] = useState(null)
  const [stockFF, setStockFF] = useState(null)

  const [groqTechBusy, setGroqTechBusy] = useState(false)
  const [groqTechErr, setGroqTechErr] = useState("")
  const [groqTechTs, setGroqTechTs] = useState(null)

  // Prediksi DB-first: untuk tiap tanggal target yang sudah ada di database, pakai
  // nilai dari DB (stabil & konsisten dgn yang tersimpan); hanya tanggal yang belum
  // ada di DB yang memakai hasil generate baru. Berlaku utk XGBoost & LLM.
  const mlPred = useMemo(() => {
    if (!mlPredRaw || !mlPredRaw.predictions) return mlPredRaw
    const dbMap = {}
    ;(predHist || []).forEach((h) => {
      if (h && h.xgb && h.xgb.predicted_price != null) dbMap[h.target_date] = h.xgb
    })
    return {
      ...mlPredRaw,
      predictions: mlPredRaw.predictions.map((p) => {
        const db = dbMap[p.date]
        if (!db) return p
        return {
          ...p,
          price: db.predicted_price,
          price_low: db.predicted_low != null ? db.predicted_low : p.price_low,
          price_high: db.predicted_high != null ? db.predicted_high : p.price_high,
        }
      }),
    }
  }, [mlPredRaw, predHist])

  const groqTech = useMemo(() => {
    if (!groqTechRaw) return groqTechRaw
    const dts = (mlPredRaw?.predictions || []).slice(0, 3).map((p) => p.date)
    const dbMap = {}
    ;(predHist || []).forEach((h) => {
      if (h && h.llm && h.llm.predicted_price != null) dbMap[h.target_date] = h.llm
    })
    const a = dbMap[dts[0]]
    const b = dbMap[dts[1]]
    const c = dbMap[dts[2]]
    if (!a && !b && !c) return groqTechRaw
    const pick = (dbVal, cur) => (dbVal != null ? dbVal : cur)
    return {
      ...groqTechRaw,
      price_tomorrow: pick(a?.predicted_price, groqTechRaw.price_tomorrow),
      price_tomorrow_low: pick(a?.predicted_low, groqTechRaw.price_tomorrow_low),
      price_tomorrow_high: pick(a?.predicted_high, groqTechRaw.price_tomorrow_high),
      day2_price: pick(b?.predicted_price, groqTechRaw.day2_price),
      day2_low: pick(b?.predicted_low, groqTechRaw.day2_low),
      day2_high: pick(b?.predicted_high, groqTechRaw.day2_high),
      day3_price: pick(c?.predicted_price, groqTechRaw.day3_price),
      day3_low: pick(c?.predicted_low, groqTechRaw.day3_low),
      day3_high: pick(c?.predicted_high, groqTechRaw.day3_high),
    }
  }, [groqTechRaw, mlPredRaw, predHist])

  // ─── News/sentimen dari shared AppContext cache ────────────────────────────
  const nc = newsCache[currentTicker] || {}
  const news = nc.data || null
  const newsBusy = nc.busy || false
  const newsErr = nc.err || ""
  const aiSummary = nc.aiSummary || ""
  const newsTs = nc.ts || null

  useEffect(() => {
    if (refreshTrigger > 0) {
      refreshAll()
    }
  }, [refreshTrigger])

  const code = currentTicker.replace(".JK", "")

  useEffect(() => {
    let alive = true
    const t = currentTicker
    setGroqTechRaw(null)
    setGroqTechErr("")
    setGroqTechTs(null)
    setFinalReco(null)

    const cache = loadCache(t)
    if (cache?.groqTech) {
      setGroqTechRaw(cache.groqTech.d)
      setGroqTechTs(cache.groqTech.ts)
    }

    setInfo(null)
    api.getStockInfo(t).then((d) => alive && setInfo(d)).catch(() => alive && setInfo(null))

    setStockFF(null)
    api.getStockForeignFlow(t).then((d) => alive && setStockFF(d.foreign_flow)).catch(() => alive && setStockFF(null))

    setIndicators(null)
    api
      .getIndicators(t)
      .then((d) => alive && setIndicators(d && d.rsi ? d : null))
      .catch(() => alive && setIndicators(null))

    setMlPredRaw(null)
    api
      .getPrediction(t)
      .then((d) => {
        if (!alive) return
        setMlPredRaw(d)
        saveCache(t, "ml", d)
      })
      .catch((e) => {
        console.error("Gagal mendapatkan prediksi ML:", e)
        if (alive) setMlPredRaw(null)
      })

    return () => {
      alive = false
    }
  }, [currentTicker])

  useEffect(() => {
    api.getMacro().then(d => setMacroData(d.data)).catch(console.error)
  }, [])

  useEffect(() => {
    let alive = true
    api
      .getHistory(currentTicker, period)
      .then((d) => alive && setHist(d.data && d.data.length ? d.data : []))
      .catch(() => alive && setHist([]))
    return () => {
      alive = false
    }
  }, [currentTicker, period])

  // Riwayat prediksi (XGBoost & LLM) dari database — dipakai untuk menggambar
  // garis prediksi MASA LALU pada chart, disambung ke prediksi masa depan.
  useEffect(() => {
    if (!currentTicker) {
      setPredHist(null)
      return
    }
    let alive = true
    api
      .getPredictionHistory(currentTicker, 400)
      .then((d) => alive && setPredHist(d && d.history ? d.history : []))
      .catch(() => alive && setPredHist([]))
    return () => {
      alive = false
    }
  }, [currentTicker])

  // Auto-simpan prediksi hari ini ke riwayat (agar DB sinkron dgn yang tampil).
  // Backend akan overwrite kalau dibuat hari ini, dan keep-first utk hari lalu.
  const predSavedRef = useRef("")
  useEffect(() => {
    if (!mlPredRaw || !mlPredRaw.predictions?.length) return
    const xpts = mlPredRaw.predictions.slice(0, 3)
    const baseClose = hist.length ? hist[hist.length - 1].close : info?.current_price || 0
    if (!baseClose) return

    const payload = {
      ticker: currentTicker,
      base_price: baseClose,
      xgb: {
        recommendation: mlPredRaw.recommendation,
        confidence: mlPredRaw.confidence,
        model_accuracy: mlPredRaw.model_accuracy,
        points: xpts.map((p, i) => ({
          horizon: i + 1, date: p.date, price: p.price, low: p.price_low, high: p.price_high,
        })),
      },
    }
    if (groqTechRaw) {
      const lp = [groqTechRaw.price_tomorrow, groqTechRaw.day2_price, groqTechRaw.day3_price]
      const ll = [groqTechRaw.price_tomorrow_low, groqTechRaw.day2_low, groqTechRaw.day3_low]
      const lh = [groqTechRaw.price_tomorrow_high, groqTechRaw.day2_high, groqTechRaw.day3_high]
      payload.llm = {
        recommendation: groqTechRaw.recommendation,
        confidence: groqTechRaw.confidence,
        points: xpts
          .map((p, i) => ({ horizon: i + 1, date: p.date, price: lp[i], low: ll[i], high: lh[i] }))
          .filter((pt) => pt.price != null),
      }
    }
    const sig = JSON.stringify(payload)
    if (predSavedRef.current === sig) return
    predSavedRef.current = sig
    api.savePredictionHistory(payload).then(() => api.getPredictionHistory(currentTicker, 400)).then((d) => setPredHist(d && d.history ? d.history : [])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mlPredRaw, groqTechRaw, hist, info, currentTicker])

  // Refresh manual: ambil ulang data pasar inti (info, indikator, prediksi,
  // chart, makro) dengan menembus cache server (refresh=true).
  function refreshAll() {
    const t = currentTicker
    setIsRefreshing(true)
    Promise.allSettled([
      api.getStockInfo(t, true),
      api.getIndicators(t, true),
      api.getPrediction(t),
      api.getHistory(t, period, true),
      api.getMacro(true),
      api.getPredictionHistory(t, 400),
    ]).then(([f, i, p, h, mac, ph]) => {
      setInfo(f.status === "fulfilled" ? f.value : null)
      setIndicators(i.status === "fulfilled" && i.value && i.value.rsi ? i.value : null)
      if (p.status === "fulfilled") {
        setMlPredRaw(p.value)
        saveCache(t, "ml", p.value)
      }
      setHist(h.status === "fulfilled" && h.value.data && h.value.data.length ? h.value.data : [])
      if (mac.status === "fulfilled") setMacroData(mac.value.data)
      if (ph.status === "fulfilled") setPredHist(ph.value && ph.value.history ? ph.value.history : [])
      setIsRefreshing(false)
    })
    // Force refresh berita+sentimen melewati cache
    fetchNewsForTicker(t, true)
    runGroqTechnical()
  }

  async function runGroqTechnical() {
    if (!indicators) {
      console.warn("Indikator teknikal belum dimuat. Tunggu sebentar.")
      return
    }
    setGroqTechBusy(true)
    setGroqTechErr("")
    try {
      const payload = {
        ticker: currentTicker,
        current_price: info?.current_price || 0,
        indicators,
        ml_prediction: mlPred || undefined,
        llm_provider: llmProvider,
      }
      const res = await api.groqTechnical(payload)
      setGroqTechRaw(res)
      setGroqTechTs(Date.now())
      saveCache(currentTicker, "groqTech", res)
    } catch (e) {
      setGroqTechErr(e.message)
    } finally {
      setGroqTechBusy(false)
    }
  }


  async function fetchFinalReco() {
    if (!mlPred) {
      alert("Tunggu ML prediksi selesai dulu.")
      return
    }
    setFinalRecoBusy(true)
    try {
      const payload = {
        ticker: currentTicker,
        current_price: info?.current_price || 0,
        ml_prediction: mlPred,
        groq_technical: groqTech || undefined,
        sentiment_summary: news?.sentiment_summary || undefined,
        bert_summary: news ? bertSummary : undefined,
        llm_sentiment_summary: news ? llmSummary : undefined,
        llm2_sentiment_summary: news ? llm2Summary : undefined,
        groq_news: news || undefined,
        macro_data: macroData || undefined,
        indicators: indicators || undefined,
        llm_provider: llmProvider,
      }
      const res = await api.groqFinalReco(payload)
      setFinalReco(res)
    } catch (e) {
      console.error(e)
      alert("Gagal memanggil rekomendasi akhir AI: " + e.message)
    } finally {
      setFinalRecoBusy(false)
    }
  }

  // Guard ref: React StrictMode (dev) menjalankan effect 2x sebelum state
  // sempat berubah, sehingga Groq bisa terpanggil ganda. Ref dibaca/ditulis
  // sinkron, jadi hanya 1 auto-call per ticker. Tombol manual tetap jalan.
  const autoTechRef = useRef(null)
  useEffect(() => {
    if (indicators && mlPred && !groqTech && !groqTechBusy && !groqTechErr && !groqTechTs && autoTechRef.current !== currentTicker) {
      autoTechRef.current = currentTicker
      runGroqTechnical()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators, mlPred, groqTech, groqTechBusy, groqTechErr, groqTechTs, currentTicker])

  // Auto-fetch berita menggunakan shared context (tidak double-fetch antar halaman)
  useEffect(() => {
    if (currentTicker) fetchNewsForTicker(currentTicker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker])

  // Range-band chart plugin — draws shaded area between high/low
  const ovRangeBandPlugin = useMemo(() => ({
    id: "ovRangeBand",
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart
      if (!chartArea) return
      [
        { key: "_isXgbBand", color: "rgba(45,212,160,0.10)" },
        { key: "_isLlmBand", color: "rgba(167,139,250,0.10)" },
      ].forEach(({ key, color }) => {
        const ds = chart.data.datasets.find((d) => d[key])
        if (!ds) return
        const bandData = ds._bandData || []
        if (!bandData.length) return
        ctx.save()
        ctx.beginPath()
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top)
        ctx.clip()
        ctx.fillStyle = color
        ctx.beginPath()
        bandData.forEach(({ x, high }, i) => {
          const px = scales.x.getPixelForValue(x)
          const py = scales.y.getPixelForValue(high)
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
        })
        for (let i = bandData.length - 1; i >= 0; i--) {
          const { x, low } = bandData[i]
          ctx.lineTo(scales.x.getPixelForValue(x), scales.y.getPixelForValue(low))
        }
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      })
    },
  }), [])

  const chartData = useMemo(() => {
    const histLabels = hist.map((r) => r.date)
    const closes = hist.map((r) => r.close)
    const predDates = (mlPred?.predictions || []).slice(0, 3).map((p) => p.date)
    const histLen = histLabels.length
    const lastClose = closes[histLen - 1]
    const labels = [...histLabels, ...predDates]
    const padPred = Array(predDates.length).fill(null)

    const datasets = [
      {
        label: "Historis",
        data: [...closes, ...padPred],
        borderColor: "#4f9cf9",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
        backgroundColor: (c) => {
          const g = c.chart.ctx.createLinearGradient(0, 0, 0, 200)
          g.addColorStop(0, "rgba(79,156,249,0.15)")
          g.addColorStop(1, "rgba(79,156,249,0)")
          return g
        },
      }
    ]

    // ── MA datasets: hanya historis, tidak diperpanjang ke area prediksi
    maPeriods.forEach((p) => {
      const maData = calcMA(closes, p)
      const meta = MA_COLORS[p] || { color: "#888", label: `MA ${p}` }
      datasets.push({
        label: meta.label,
        data: [...maData, ...padPred],
        borderColor: meta.color,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0,
        fill: false,
        borderDash: [],
        _isMA: true,
      })
    })

    // ── Peta prediksi MASA LALU dari database (per tanggal target) ──
    const xgbPastMap = {}
    const llmPastMap = {}
    ;(predHist || []).forEach((h) => {
      if (h && h.xgb && h.xgb.predicted_price != null) xgbPastMap[h.target_date] = h.xgb.predicted_price
      if (h && h.llm && h.llm.predicted_price != null) llmPastMap[h.target_date] = h.llm.predicted_price
    })

    // Bangun satu garis menyambung: prediksi masa lalu (dari DB) -> titik "kini"
    // (harga aktual terakhir) -> prediksi masa depan.
    const buildPredLine = (pastMap, futurePrices) => {
      const arr = Array(labels.length).fill(null)
      histLabels.forEach((d, i) => {
        if (pastMap[d] != null) arr[i] = pastMap[d]
      })
      if (arr[histLen - 1] == null && Number.isFinite(lastClose)) arr[histLen - 1] = lastClose
      futurePrices.forEach((p, i) => {
        if (p != null) arr[histLen + i] = p
      })
      return arr
    }
    const buildPredRadius = (lineData, futureCount, hasTodayPast) =>
      lineData.map((v, idx) =>
        idx >= histLen ? 4 : idx === histLen - 1 ? (hasTodayPast ? 4 : futureCount ? 3 : 0) : v != null ? 4 : 0
      )

    // ── XGBoost: garis prediksi masa lalu + masa depan ──
    const xgbFuture =
      predDates.length && mlPred?.predictions ? mlPred.predictions.slice(0, 3).map((p) => p.price) : []
    const hasXgbPast = Object.keys(xgbPastMap).length > 0
    if (xgbFuture.length || hasXgbPast) {
      const mlPreds3 = mlPred?.predictions ? mlPred.predictions.slice(0, 3) : []
      const xgbData = buildPredLine(xgbPastMap, xgbFuture)
      const ds = {
        label: "XGBoost",
        data: xgbData,
        borderColor: "#2dd4a0",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: buildPredRadius(xgbData, xgbFuture.length, xgbPastMap[histLabels[histLen - 1]] != null),
        pointBackgroundColor: "#2dd4a0",
        tension: 0.3,
        fill: false,
        spanGaps: true,
      }
      if (xgbFuture.length) {
        ds._isXgbBand = true
        ds._bandData = mlPreds3.map((p, i) => ({
          x: predDates[i],
          low: p.price_low ?? p.price * 0.98,
          high: p.price_high ?? p.price * 1.02,
        }))
      }
      datasets.push(ds)
    }

    // ── LLM: garis prediksi masa lalu + masa depan ──
    const llmFuture = groqTech?.price_tomorrow
      ? [groqTech.price_tomorrow, groqTech.day2_price, groqTech.day3_price]
      : []
    const hasLlmPast = Object.keys(llmPastMap).length > 0
    if (llmFuture.length || hasLlmPast) {
      const llmLow = [groqTech?.price_tomorrow_low, groqTech?.day2_low, groqTech?.day3_low]
      const llmHigh = [groqTech?.price_tomorrow_high, groqTech?.day2_high, groqTech?.day3_high]
      const llmData = buildPredLine(llmPastMap, llmFuture)
      const ds = {
        label: "LLM",
        data: llmData,
        borderColor: "#a78bfa",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: buildPredRadius(llmData, llmFuture.length, llmPastMap[histLabels[histLen - 1]] != null),
        pointBackgroundColor: "#a78bfa",
        tension: 0.3,
        fill: false,
        spanGaps: true,
      }
      if (llmFuture.length) {
        ds._isLlmBand = true
        ds._bandData = llmFuture.map((_, i) => ({
          x: predDates[i],
          low: llmLow[i] ?? lastClose * 0.97,
          high: llmHigh[i] ?? lastClose * 1.03,
        }))
      }
      datasets.push(ds)
    }
    return { labels, datasets }
  }, [hist, mlPred, groqTech, maPeriods, predHist])

  // ── Volume chart data ───────────────────────────────────────────────
  const volumeChartData = useMemo(() => {
    if (!hist.length) return { labels: [], datasets: [] }
    const labels = hist.map((r) => r.date)
    const volumes = hist.map((r) => r.volume ?? 0)
    const volMA = calcMA(volumes, volumeMaPeriod)
    const closes = hist.map((r) => r.close)

    // Warna bar: hijau jika close naik, merah jika turun
    const barColors = hist.map((r, i) => {
      const prev = i > 0 ? closes[i - 1] : r.close
      return r.close >= prev ? "rgba(45,212,160,0.6)" : "rgba(248,113,113,0.6)"
    })
    const barBorders = hist.map((r, i) => {
      const prev = i > 0 ? closes[i - 1] : r.close
      return r.close >= prev ? "rgba(45,212,160,0.9)" : "rgba(248,113,113,0.9)"
    })

    return {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Volume",
          data: volumes,
          backgroundColor: barColors,
          borderColor: barBorders,
          borderWidth: 1,
          borderRadius: 2,
          order: 2,
        },
        {
          type: "line",
          label: `MA Vol ${volumeMaPeriod}`,
          data: volMA,
          borderColor: "#facc15",
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.3,
          fill: false,
          order: 1,
        },
      ],
    }
  }, [hist, volumeMaPeriod])

  const volumeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1c2028",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        titleColor: "#8a8f9e",
        bodyColor: "#e8eaf0",
        padding: 10,
        callbacks: {
          label: (c) => {
            const v = c.parsed.y
            if (v === null || v === undefined) return null
            return ` ${c.dataset.label}: ${Number(v).toLocaleString("id-ID")}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#505568", font: { size: 10 }, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: {
          color: "#505568",
          font: { size: 10 },
          callback: (v) => {
            if (v >= 1e9) return (v / 1e9).toFixed(1) + "M"
            if (v >= 1e6) return (v / 1e6).toFixed(1) + "Jt"
            if (v >= 1e3) return (v / 1e3).toFixed(0) + "Rb"
            return v
          },
        },
        border: { display: false },
      },
    },
    interaction: { mode: "index", intersect: false },
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1c2028",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        titleColor: "#8a8f9e",
        bodyColor: "#e8eaf0",
        padding: 10,
        callbacks: { label: (c) => " Rp " + Number(c.parsed.y).toLocaleString("id-ID") },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#505568", font: { size: 10 }, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#505568", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("id-ID") },
        border: { display: false },
      },
    },
    interaction: { mode: "index", intersect: false },
  }

  // ── derived values + dynamic styles (named, single-brace refs) ───
  // BERT stats — dihitung client-side dari articles (konsisten dengan BeritaSentimen)
  const bertSummary = useMemo(() => {
    if (!news || !news.articles || !news.articles.length) return {
      positive_pct: 0, neutral_pct: 0, negative_pct: 0,
      score: 0, overall: "neutral", overall_label: "Netral"
    }
    const articles = news.articles
    const total = articles.length || 1
    const bertPos = articles.filter(a => a.sentiment === "positive").length
    const bertNeu = articles.filter(a => a.sentiment === "neutral").length
    const bertNeg = articles.filter(a => a.sentiment === "negative").length
    const pos_pct = Math.round(bertPos / total * 100)
    const neu_pct = Math.round(bertNeu / total * 100)
    const neg_pct = Math.round(bertNeg / total * 100)
    const score = Math.round(articles.reduce((s, a) => s + (a.score || 0), 0) / total * 100)
    const overall = bertPos >= bertNeg && bertPos >= bertNeu ? "positive" : bertNeg >= bertPos && bertNeg >= bertNeu ? "negative" : "neutral"
    const overall_label = overall === "positive" ? "Positif" : overall === "negative" ? "Negatif" : "Netral"
    return { positive_pct: pos_pct, neutral_pct: neu_pct, negative_pct: neg_pct, score, overall, overall_label }
  }, [news])

  // LLM stats — dihitung client-side dari articles (konsisten dengan BeritaSentimen)
  const llmSummary = useMemo(() => {
    if (!news || !news.articles || !news.articles.length) return {
      positive_pct: 0, neutral_pct: 0, negative_pct: 0,
      score: 0, overall: "neutral", overall_label: "Netral"
    }
    const articles = news.articles
    const total = articles.length || 1
    const llmPos = articles.filter(a => a.llm_sentiment === "positive").length
    const llmNeu = articles.filter(a => a.llm_sentiment === "neutral").length
    const llmNeg = articles.filter(a => a.llm_sentiment === "negative").length
    const pos_pct = Math.round(llmPos / total * 100)
    const neu_pct = Math.round(llmNeu / total * 100)
    const neg_pct = Math.round(llmNeg / total * 100)
    const score = Math.round(articles.reduce((s, a) => s + (a.llm_score || 0), 0) / total * 100)
    const overall = llmPos >= llmNeg && llmPos >= llmNeu ? "positive" : llmNeg >= llmPos && llmNeg >= llmNeu ? "negative" : "neutral"
    const overall_label = overall === "positive" ? "Positif" : overall === "negative" ? "Negatif" : "Netral"
    return { positive_pct: pos_pct, neutral_pct: neu_pct, negative_pct: neg_pct, score, overall, overall_label }
  }, [news])

  // Qwen stats — dihitung client-side dari articles
  const llm2Summary = useMemo(() => {
    if (!news || !news.articles || !news.articles.length)
      return { positive_pct: 0, neutral_pct: 0, negative_pct: 0, score: 0, overall: "neutral", overall_label: "Netral" }
    const articles = news.articles
    const total = articles.length || 1
    const p = articles.filter((a) => a.llm2_sentiment === "positive").length
    const nu = articles.filter((a) => a.llm2_sentiment === "neutral").length
    const ng = articles.filter((a) => a.llm2_sentiment === "negative").length
    const pos_pct = Math.round((p / total) * 100)
    const neu_pct = Math.round((nu / total) * 100)
    const neg_pct = Math.round((ng / total) * 100)
    const score = Math.round((articles.reduce((s, a) => s + (a.llm2_score || 0), 0) / total) * 100)
    const overall = p >= ng && p >= nu ? "positive" : ng >= p && ng >= nu ? "negative" : "neutral"
    const overall_label = overall === "positive" ? "Positif" : overall === "negative" ? "Negatif" : "Netral"
    return { positive_pct: pos_pct, neutral_pct: neu_pct, negative_pct: neg_pct, score, overall, overall_label }
  }, [news])

  const ov = indicators?.overall || {}
  const chartKey = currentTicker + ":" + (mlPred?.predictions?.length || 0) + ":" + (groqTech?.price_tomorrow ? "l" : "n") + ":" + ((predHist || []).length)
  // Akurasi historis per model (dihitung dari riwayat yg sudah ada harga aktualnya).
  const histAccFor = (key) => {
    let n = 0, mapeSum = 0, dirHits = 0, dirTot = 0
    ;(predHist || []).forEach((h) => {
      const pt = h && h[key]
      if (!pt || pt.actual_price == null || pt.error_pct == null) return
      n += 1
      mapeSum += Math.abs(pt.error_pct)
      if (pt.direction_hit != null) { dirTot += 1; if (pt.direction_hit) dirHits += 1 }
    })
    return { count: n, accuracy: n ? Math.max(0, 100 - mapeSum / n) : null, dirRate: dirTot ? (dirHits / dirTot) * 100 : null }
  }
  const accXgbHist = histAccFor("xgb")
  const accLlmHist = histAccFor("llm")
  // Kalau XGBoost & LLM beda rekomendasi, pilih model dgn akurasi historis lebih tinggi.
  const recDiffer = !!(mlPred && groqTech && mlPred.recommendation !== groqTech.recommendation)
  const bestModel = (() => {
    if (!recDiffer) return null
    const ax = accXgbHist.accuracy, al = accLlmHist.accuracy
    const hx = Number.isFinite(ax), hl = Number.isFinite(al)
    if (!hx && !hl) return null
    if (hx && !hl) return "xgb"
    if (hl && !hx) return "llm"
    if (ax === al) return null
    return ax > al ? "xgb" : "llm"
  })()
  const showSingleRec = !!(mlPred && groqTech && (!recDiffer || bestModel))
  const singleRec = bestModel === "llm" ? groqTech?.recommendation : mlPred?.recommendation
  const mlFirst = mlPred?.predictions?.[0]
  const pos = info ? info.change_pct >= 0 : true
  const predSubColor = mlFirst && mlFirst.change_pct >= 0 ? S.green : S.red
  const sentColor1 = bertSummary.overall === "positive" ? S.green : bertSummary.overall === "negative" ? S.red : S.amberTxt
  const sentColor2 = llmSummary.overall === "positive" ? S.green : llmSummary.overall === "negative" ? S.red : S.amberTxt
  const sentColor3 = llm2Summary.overall === "positive" ? S.green : llm2Summary.overall === "negative" ? S.red : S.amberTxt
  const sentActiveSummary = sentModel === "llm" ? llmSummary : sentModel === "llm2" ? llm2Summary : bertSummary
  const sentKpiValStyle = news ? { color: indColor(sentActiveSummary.overall_label) } : { color: "var(--text-muted)" }
  const sentKpiStyle = news ? (sentModel === "llm" ? sentColor2 : sentModel === "llm2" ? sentColor3 : sentColor1) : S.tealTxt
  const grokKpiStyle = groqTech ? { color: recColor(groqTech.recommendation) } : S.purpleTxt
  const signalStyle = ov.signal ? { color: indColor(ov.signal) } : S.greenTxt
  function renderKpiDetail() {
    if (!activeKpi) return null
    const meta = {
      blue: { cls: "kpi-detail-b", ic: "📈", title: "Prediksi XGBoost vs LLM" },
      purple: { cls: "kpi-detail-p", ic: "📊", title: "Indikator Teknikal" },
      teal: { cls: "kpi-detail-t", ic: "📰", title: "Berita dan Sentimen" },
      amber: { cls: "kpi-detail-a", ic: "🌍", title: "Makro Ekonomi" },
    }[activeKpi]
    const sigBadge = (rec) => <span className={"kpi-badge kpi-badge-" + (rec === "BUY" ? "buy" : rec === "SELL" ? "sell" : "hold")}>{recLabel(rec)}</span>
    const ffBadge = (st) => <span className={"kpi-badge " + (st === "Net Buy" ? "kpi-badge-buy" : st === "Net Sell" ? "kpi-badge-sell" : "kpi-badge-hold")}>{st}</span>
    const pct = (v) => ((v || 0) >= 0 ? "+" : "") + (v || 0).toFixed(2) + "%"
    const pcls = (v) => ((v || 0) > 0 ? "pos" : (v || 0) < 0 ? "neg" : "neu")
    let body = null
    if (activeKpi === "blue") {
      body = (
        <>
          <div className="kpi-detail-grp">
            <div className="kpi-detail-grp-h">XGBoost (Machine Learning)</div>
            {mlPred ? <div className="kpi-stat"><span className="kpi-stat-k">Rekomendasi</span><span className="kpi-stat-v">{sigBadge(mlPred.recommendation)}</span></div> : <div className="kpi-detail-note">Menunggu data model...</div>}
            {mlPred ? <div className="kpi-stat"><span className="kpi-stat-k">Confidence</span><span className="kpi-stat-v">{Math.round((mlPred.confidence || 0) * 100)}%</span></div> : null}
            {mlPred ? <div className="kpi-stat"><span className="kpi-stat-k">Akurasi model</span><span className="kpi-stat-v">{(mlPred.model_accuracy || 0).toFixed(1)}%</span></div> : null}
            {mlPred && mlFirst ? <div className="kpi-stat"><span className="kpi-stat-k">Harga besok</span><span className="kpi-stat-v">{fmt(mlFirst.price)} ({fmt(mlFirst.price_low)}-{fmt(mlFirst.price_high)})</span></div> : null}
            {mlPred && mlFirst ? <div className="kpi-stat"><span className="kpi-stat-k">Perubahan</span><span className={"kpi-stat-v " + pcls(mlFirst.change_pct)}>{pct(mlFirst.change_pct)}</span></div> : null}
          </div>
          <div className="kpi-detail-grp">
            <div className="kpi-detail-grp-h">LLM (AI Teknikal)</div>
            {groqTech ? <div className="kpi-stat"><span className="kpi-stat-k">Rekomendasi</span><span className="kpi-stat-v">{sigBadge(groqTech.recommendation)}</span></div> : <div className="kpi-detail-note">Menunggu data LLM...</div>}
            {groqTech ? <div className="kpi-stat"><span className="kpi-stat-k">Confidence</span><span className="kpi-stat-v">{Math.round((groqTech.confidence || 0) * 100)}%</span></div> : null}
            {groqTech ? <div className="kpi-stat"><span className="kpi-stat-k">Harga besok</span><span className="kpi-stat-v">{fmt(groqTech.price_tomorrow)} ({fmt(groqTech.price_tomorrow_low)}-{fmt(groqTech.price_tomorrow_high)})</span></div> : null}
            {groqTech && groqTech.reasons && groqTech.reasons.length ? <ul className="kpi-detail-reasons">{groqTech.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
          </div>
          {mlPred && groqTech ? <div className="kpi-detail-note">{mlPred.recommendation === groqTech.recommendation ? "✓ Kedua model sepakat pada arah yang sama." : "⚠ Kedua model berbeda arah, pertimbangkan confidence dan akurasi masing-masing."}</div> : null}
        </>
      )
    } else if (activeKpi === "purple") {
      body = (
        <>
          <div className="kpi-stat"><span className="kpi-stat-k">Sinyal gabungan</span><span className="kpi-stat-v" style={signalStyle}>{ov.signal ? ov.signal.toUpperCase() : "menunggu data"}</span></div>
          <div className="kpi-detail-note">Sinyal ini adalah kesimpulan gabungan dari RSI, MACD, Moving Average, Bollinger Bands, Stochastic, dan Volume. Buka halaman Indikator Teknikal untuk rincian tiap indikator.</div>
        </>
      )
    } else if (activeKpi === "teal") {
      const bp = { width: (bertSummary.positive_pct || 0) + "%" }
      const bnt = { width: (bertSummary.neutral_pct || 0) + "%" }
      const bng = { width: (bertSummary.negative_pct || 0) + "%" }
      const lp = { width: (llmSummary.positive_pct || 0) + "%" }
      const lnt = { width: (llmSummary.neutral_pct || 0) + "%" }
      const lng = { width: (llmSummary.negative_pct || 0) + "%" }
      const l2p = { width: (llm2Summary.positive_pct || 0) + "%" }
      const l2nt = { width: (llm2Summary.neutral_pct || 0) + "%" }
      const l2ng = { width: (llm2Summary.negative_pct || 0) + "%" }
      body = news ? (
        <>
          <div className="kpi-detail-grp">
            <div className="kpi-detail-grp-h">IndoBERT</div>
            <div className="kpi-sentbar"><i className="kpi-sent-pos" style={bp} /><i className="kpi-sent-net" style={bnt} /><i className="kpi-sent-neg" style={bng} /></div>
            <div className="kpi-sent-legend"><span className="kpi-dist-lbl">Distribusi:</span><span className="pos">Positif <b>{bertSummary.positive_pct}%</b></span><span className="neu">Netral <b>{bertSummary.neutral_pct}%</b></span><span className="neg">Negatif <b>{bertSummary.negative_pct}%</b></span></div>
          </div>
          <div className="kpi-detail-grp">
            <div className="kpi-detail-grp-h">Llama (Groq)</div>
            <div className="kpi-sentbar"><i className="kpi-sent-pos" style={lp} /><i className="kpi-sent-net" style={lnt} /><i className="kpi-sent-neg" style={lng} /></div>
            <div className="kpi-sent-legend"><span className="kpi-dist-lbl">Distribusi:</span><span className="pos">Positif <b>{llmSummary.positive_pct}%</b></span><span className="neu">Netral <b>{llmSummary.neutral_pct}%</b></span><span className="neg">Negatif <b>{llmSummary.negative_pct}%</b></span></div>
          </div>
          <div className="kpi-detail-grp">
            <div className="kpi-detail-grp-h">Qwen (Groq)</div>
            <div className="kpi-sentbar"><i className="kpi-sent-pos" style={l2p} /><i className="kpi-sent-net" style={l2nt} /><i className="kpi-sent-neg" style={l2ng} /></div>
            <div className="kpi-sent-legend"><span className="kpi-dist-lbl">Distribusi:</span><span className="pos">Positif <b>{llm2Summary.positive_pct}%</b></span><span className="neu">Netral <b>{llm2Summary.neutral_pct}%</b></span><span className="neg">Negatif <b>{llm2Summary.negative_pct}%</b></span></div>
          </div>
          <div className="kpi-detail-note">Angka besar pada kartu adalah label agregat; skor keyakinan dihitung dari rata-rata confidence artikel berita terbaru.</div>
        </>
      ) : <div className="kpi-detail-note">Menunggu data berita...</div>
    } else if (activeKpi === "amber") {
      const tr = macroData && macroData.IHSG ? macroData.IHSG.trend : null
      const arrow = tr ? (tr.direction === "naik" ? "▲" : tr.direction === "turun" ? "▼" : "▬") : ""
      const acls = tr ? (tr.direction === "naik" ? "pos" : tr.direction === "turun" ? "neg" : "neu") : "neu"
      const today = macroData && macroData.IHSG ? pct(macroData.IHSG.change_pct) : "-"
      body = (
        <>
          {tr ? (
            <div className="kpi-trend">
              <div className={"kpi-trend-arrow " + acls}>{arrow}</div>
              <div className="kpi-trend-main">
                <div className={"kpi-trend-dir " + acls}>Tren {tr.direction} · {tr.signal > 0 ? "Bullish" : tr.signal < 0 ? "Bearish" : "Netral"}</div>
                <div className="kpi-trend-sub">Dari 10 hari perdagangan terakhir: {tr.up_days} hari naik, {tr.down_days} hari turun</div>
              </div>
              <div className="kpi-trend-chips">
                <div className="kpi-chip"><span className="kpi-chip-k">1 Minggu</span><span className={"kpi-chip-v " + pcls(tr.week_pct)}>{pct(tr.week_pct)}</span></div>
                <div className="kpi-chip"><span className="kpi-chip-k">1 Bulan</span><span className={"kpi-chip-v " + pcls(tr.month_pct)}>{pct(tr.month_pct)}</span></div>
              </div>
            </div>
          ) : (macroData && macroData.IHSG ? <div className="kpi-stat"><span className="kpi-stat-k">IHSG hari ini</span><span className={"kpi-stat-v " + pcls(macroData.IHSG.change_pct)}>{today}</span></div> : null)}
          <div className="kpi-detail-grp">
            {macroData && macroData.USDIDR ? <div className="kpi-stat"><span className="kpi-stat-k">USD/IDR</span><span className={"kpi-stat-v " + pcls(macroData.USDIDR.change_pct)}>{pct(macroData.USDIDR.change_pct)}</span></div> : null}
            {macroData && macroData.BIRate ? <div className="kpi-stat"><span className="kpi-stat-k">BI Rate</span><span className="kpi-stat-v">{Number(macroData.BIRate.value).toFixed(2)}%</span></div> : null}
            {macroData && macroData.Inflation ? <div className="kpi-stat"><span className="kpi-stat-k">Inflasi</span><span className="kpi-stat-v">{Number(macroData.Inflation.value).toFixed(2)}%</span></div> : null}
            {macroData && macroData.GDP ? <div className="kpi-stat"><span className="kpi-stat-k">PDB</span><span className="kpi-stat-v">{Number(macroData.GDP.value).toFixed(2)}%</span></div> : null}
          </div>
          {macroData && macroData.ForeignFlow ? (
            <div className="kpi-detail-grp">
              <div className="kpi-detail-grp-h">Aliran Dana Asing</div>
              <div className="kpi-stat"><span className="kpi-stat-k">Pasar (IHSG)</span><span className="kpi-stat-v">{ffBadge(macroData.ForeignFlow.status)} {fmtBig(Math.abs(macroData.ForeignFlow.net || 0))}</span></div>
              {stockFF ? <div className="kpi-stat"><span className="kpi-stat-k">Saham ini</span><span className="kpi-stat-v">{ffBadge(stockFF.status)} {fmtBig(Math.abs(stockFF.net || 0))}</span></div> : <div className="kpi-detail-note">Aliran dana asing per-saham belum tersedia.</div>}
            </div>
          ) : null}
          {!macroData ? <div className="kpi-detail-note">Menunggu data makro...</div> : null}
          {macroData ? (() => {
            const mv = macroWeighted(macroData);
            if (!mv) return null;
            return (
              <div className="kpi-detail-grp">
                <div className="kpi-detail-grp-h">Kesimpulan Berbobot (%)</div>
                <div className="kpi-stat"><span className="kpi-stat-k">Kondusif</span><span className="kpi-stat-v pos">{Math.round(mv.posPct)}%</span></div>
                <div className="kpi-stat"><span className="kpi-stat-k">Berisiko</span><span className="kpi-stat-v neg">{Math.round(100 - mv.posPct)}%</span></div>
                {mv.weighted.map((r) => (
                  <div className="kpi-stat" key={r.key}>
                    <span className="kpi-stat-k">{r.label}{r.sig > 0 ? " (mendukung)" : r.sig < 0 ? " (menekan)" : " (netral)"}</span>
                    <span className={"kpi-stat-v " + (r.sig > 0 ? "pos" : r.sig < 0 ? "neg" : "neu")}>{Math.round(r.pct)}%</span>
                  </div>
                ))}
              </div>
            );
          })() : null}
          <div className="kpi-detail-note">Angka % di atas adalah bobot efektif tiap indikator: bobot dasar (IHSG 25, Dana Asing 20, USD/IDR 20, BI Rate 15, Inflasi 10, PDB 10) dikali seberapa ekstrem gerakannya, lalu dinormalisasi jadi 100%. Status Kondusif/Berisiko dihitung dari selisih total bobot indikator yang mendukung vs menekan pasar.</div>
        </>
      )
    }
    return (
      <div key={activeKpi} className={"kpi-detail-panel " + meta.cls}>
        <div className="kpi-detail-head">
          <div className="kpi-detail-title"><span className="kpi-detail-ic">{meta.ic}</span>{meta.title}</div>
          <button className="kpi-detail-close" onClick={() => setActiveKpi(null)}>✕ Tutup</button>
        </div>
        <div className="kpi-detail-body">{body}</div>
      </div>
    )
  }

  const periods = [
    { id: "1mo", lbl: "1B" },
    { id: "3mo", lbl: "3B" },
    { id: "6mo", lbl: "6B" },
    { id: "1y", lbl: "1T" },
  ]

  return (
    <>
      <TickerSearchBar label="Pilih Saham">
        <button
          className={"fetch-news-btn " + (isRefreshing ? "loading" : "")}
          onClick={refreshAll}
          disabled={isRefreshing}
          style={{ height: 28, padding: "0 12px", borderRadius: 14, fontSize: 11, background: "rgba(45,212,160,0.1)", color: "var(--green)", borderColor: "rgba(45,212,160,0.2)" }}
        >
          {isRefreshing ? <span className="spin-sm" style={{ borderTopColor: "var(--green)", width: 12, height: 12, marginRight: 6 }} /> : <span style={{ marginRight: 4 }}>↻</span>}
          <span className="btn-txt" style={{ color: "var(--green)" }}>{isRefreshing ? "Memuat..." : "Refresh"}</span>
        </button>
        <LlmDropdown
          value={llmProvider}
          onChange={(newVal) => {
            if (llmProvider === newVal) return;
            setLlmProvider(newVal)
            localStorage.removeItem(`wl_stocksense_${currentTicker}_ml`)
            localStorage.removeItem(`wl_stocksense_${currentTicker}_groqTech`)
            localStorage.removeItem(`wl_stocksense_${currentTicker}_news`)
            localStorage.removeItem(`wl_stocksense_${currentTicker}_groqNewsSummary`)
            triggerRefresh()
          }}
        />
      </TickerSearchBar>

      <div className="content">
        <div className="stock-header">
          <div className="stock-title">
            <h1>{code}</h1>
            <p>{info ? `${info.name} · IDX · ${info.industry || info.sector || ""}` : "Memuat data..."}</p>
          </div>
          <div style={S.flex1} />
          <div className="stock-meta">
            <div className="meta-item">
              <div className="meta-label">Market Cap</div>
              <div className="meta-val">{info ? fmtBig(info.market_cap) : "—"}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Vol Hari ini</div>
              <div className="meta-val">{info ? fmtVol(info.volume) : "—"}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">52W High</div>
              <div className="meta-val" style={S.green}>{info ? fmt(info.fifty_two_week_high) : "—"}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">52W Low</div>
              <div className="meta-val" style={S.red}>{info ? fmt(info.fifty_two_week_low) : "—"}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">P/E Ratio</div>
              <div className="meta-val">{info?.pe_ratio ? info.pe_ratio.toFixed(1) + "x" : "—"}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Dana Asing</div>
              <div className="meta-val" style={stockFF ? (stockFF.net > 0 ? S.green : stockFF.net < 0 ? S.red : undefined) : undefined}>{stockFF ? (stockFF.net > 0 ? "▲ " : stockFF.net < 0 ? "▼ " : "") + "Rp " + (Math.abs(stockFF.net) >= 1e12 ? (Math.abs(stockFF.net) / 1e12).toFixed(2) + " T" : (Math.abs(stockFF.net) / 1e9).toFixed(2) + " M") : "—"}</div>
            </div>
          </div>
          <div className="stock-price-block">
            <div className="stock-price">{info ? fmt(info.current_price) : "—"}</div>
            <div className="stock-change">
              <span className={"chg-val " + (pos ? "chg-pos" : "chg-neg")}>
                {info ? (pos ? "+" : "") + fmt(info.change) : "—"}
              </span>
              <span className={"chg-pct " + (pos ? "chg-pos-bg" : "chg-neg-bg")}>
                {info ? (pos ? "+" : "") + info.change_pct.toFixed(2) + "%" : "—"}
              </span>
            </div>
          </div>
        </div>


        <div className="kpi-grid" style={S.kpiGrid}>
          {/* Card 1: Perbandingan Prediksi XGBoost & LLM Besok */}
          <div className={"kpi-card kpi-c-blue" + (activeKpi === "blue" ? " kpi-active" : "")} style={S.kpiClickable} onClick={() => setActiveKpi(activeKpi === "blue" ? null : "blue")}>
            <div className="kpi-label">Prediksi XGB vs LLM (Besok)</div>
            <div className="kpi-val">
              {mlPred && groqTech ? (
                showSingleRec ? (
                  <span style={{ color: indColor(recLabel(mlPred.recommendation)) }}>
                    {(bestModel ? (bestModel === "xgb" ? "XGB: " : "LLM: ") : "") + recLabel(singleRec)}
                  </span>
                ) : (
                  <span style={{ fontSize: "0.8em" }}>
                    <span style={{ color: "var(--text-muted)" }}>XGB: </span>
                    <span style={{ color: indColor(recLabel(mlPred.recommendation)) }}>
                      {recLabel(mlPred.recommendation)}
                    </span>
                    <span style={{ color: "var(--border)", margin: "0 4px" }}>|</span>
                    <span style={{ color: "var(--text-muted)" }}>LLM: </span>
                    <span style={{ color: indColor(recLabel(groqTech.recommendation)) }}>
                      {recLabel(groqTech.recommendation)}
                    </span>
                  </span>
                )
              ) : (
                <span style={{ color: "var(--text-muted)" }}>Menunggu...</span>
              )}
            </div>
            <div className="kpi-sub">
              {mlPred && groqTech ? (!recDiffer ? "Kedua model AI sepakat memberikan rekomendasi arah yang sama." : bestModel ? ("Kedua model berbeda arah — ditampilkan " + (bestModel === "xgb" ? "XGBoost" : "LLM") + " karena akurasi historisnya lebih baik.") : "Kedua model berbeda arah; belum ada cukup data akurasi historis untuk memilih, jadi keduanya ditampilkan.") : "—"}
            </div>
          </div>

          {/* Card 2: Ringkasan Indikator Teknikal */}
          <div className={"kpi-card kpi-c-purple" + (activeKpi === "purple" ? " kpi-active" : "")} style={S.kpiClickable} onClick={() => setActiveKpi(activeKpi === "purple" ? null : "purple")}>
            <div className="kpi-label">Indikator Teknikal</div>
            <div className="kpi-val" style={{ color: ov.signal ? indColor(ov.signal) : "var(--text-muted)" }}>
              {ov.signal ? ov.signal.toUpperCase() : "Menunggu..."}
            </div>
            <div className="kpi-sub">
              {indicators ? `Analisis gabungan RSI, MACD, dan Moving Average mengkonfirmasi arah ini.` : "—"}
            </div>
          </div>

          {/* Card 3: Ringkasan Sentimen */}
          <div className={"kpi-card kpi-c-teal" + (activeKpi === "teal" ? " kpi-active" : "")} style={S.kpiClickable} onClick={() => setActiveKpi(activeKpi === "teal" ? null : "teal")}>
            <div className="kpi-label">Berita dan Sentimen</div>
            <div className="kpi-val" style={sentKpiValStyle}>
              {news ? sentActiveSummary.overall_label.toUpperCase() : "Menunggu..."}
            </div>
            <div className="kpi-sub">
              {news ? "Berdasarkan berita terbaru, sentimen pasar saat ini didominasi nilai " + sentActiveSummary.overall_label.toLowerCase() + "." : 'Klik "↻ Refresh"'}
            </div>
          </div>

          {/* Card 4: Ringkasan Makro Ekonomi */}
          {(() => {
            const mv = macroWeighted(macroData);
            const macroStatus = mv ? mv.status : "Menunggu...";
            const macroColor = mv ? mv.color : "var(--text-muted)";
            const macroDesc = mv
              ? `Kondusif ${Math.round(mv.posPct)}% · Berisiko ${Math.round(100 - mv.posPct)}%` + (mv.topDriver ? ` · dipimpin ${mv.topDriver.label}` : "")
              : "—";

            return (
              <div className={"kpi-card kpi-c-amber" + (activeKpi === "amber" ? " kpi-active" : "")} style={S.kpiClickable} onClick={() => setActiveKpi(activeKpi === "amber" ? null : "amber")}>
                <div className="kpi-label">Makro Ekonomi</div>
                <div className="kpi-val" style={{ color: macroColor }}>{macroStatus}</div>
                <div className="kpi-sub">{macroDesc}</div>
              </div>
            )
          })()}
          {renderKpiDetail()}
        </div>

        <div className="main-grid">
          <div className="left-col">
            <div className="card">
              <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
                <div className="card-title">📈 Harga Historis & Prediksi — {code}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                  {/* Period selector */}
                  <div className="tab-group">
                    {periods.map((p) => (
                      <span
                        key={p.id}
                        className={"tab " + (period === p.id ? "active-tab" : "")}
                        onClick={() => setPeriod(p.id)}
                      >
                        {p.lbl}
                      </span>
                    ))}
                  </div>
                  {/* MA toggles inline */}
                  <span style={{ color: "var(--border)", fontSize: 12 }}>|</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>MA:</span>
                  {[5, 20, 50].map((p) => {
                    const active = maPeriods.includes(p)
                    const meta = MA_COLORS[p]
                    return (
                      <span
                        key={p}
                        onClick={() => setMaPeriods(prev =>
                          prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                        )}
                        style={{
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: `1px solid ${active ? meta.color : "rgba(255,255,255,0.08)"}`,
                          color: active ? meta.color : "var(--text-muted)",
                          background: active ? `${meta.color}18` : "transparent",
                          userSelect: "none",
                          transition: "all 0.18s",
                          whiteSpace: "nowrap",
                        }}
                        title={`${active ? "Sembunyikan" : "Tampilkan"} MA ${p}`}
                      >
                        {p}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="chart-legend">
                <span className="leg-item"><span className="leg-line" style={S.legSolidBlue} />Historis</span>
                <span className="leg-item"><span className="leg-line" style={{ background: "#2dd4a0", borderTop: "2px dashed #2dd4a0", height: 0 }} />XGBoost</span>
                <span className="leg-item"><span className="leg-line" style={S.legDashPurple} />LLM</span>
                {maPeriods.length > 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 2 }}>|</span>
                )}
                {maPeriods.map((p) => {
                  const meta = MA_COLORS[p] || { color: "#888", label: `MA ${p}` }
                  return (
                    <span key={p} className="leg-item">
                      <span className="leg-line" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                  )
                })}
              </div>
              <div className="card-body">
                <div className="chart-wrap">
                  <Line key={chartKey} data={chartData} options={chartOptions} plugins={[ovRangeBandPlugin]} />
                </div>
              </div>
            </div>

            {/* ── Volume Chart ── */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">📊 Volume & Rata-Rata Volume</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>MA Vol:</span>
                  <div className="tab-group">
                    {[5, 20, 50].map((p) => (
                      <span
                        key={p}
                        className={"tab " + (volumeMaPeriod === p ? "active-tab" : "")}
                        onClick={() => setVolumeMaPeriod(p)}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-legend">
                <span className="leg-item"><span className="leg-line" style={{ background: "rgba(45,212,160,0.9)" }} />Vol Naik</span>
                <span className="leg-item"><span className="leg-line" style={{ background: "rgba(248,113,113,0.9)" }} />Vol Turun</span>
                <span className="leg-item"><span className="leg-line" style={{ background: "#facc15" }} />MA Vol {volumeMaPeriod}</span>
              </div>
              <div className="card-body">
                <div className="chart-wrap" style={{ height: 140 }}>
                  <Bar data={volumeChartData} options={volumeChartOptions} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">⚡ Indikator Teknikal</div>
              </div>
              <div className="card-body">
                <div className="ind-grid">{renderIndicators(indicators)}</div>
              </div>
            </div>

            {macroData && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">🌍 Makro Ekonomi</div>
                </div>
                <div className="card-body">
                  <div className="macro-grid">{renderMacroCards(macroData)}</div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <div className="card-title">🔮 Prediksi Teknikal</div>
              </div>
              <div className="card-body">
                <div className="dual-pred-grid">{renderDualPred(mlPred, groqTech, groqTechBusy, info)}</div>
                <div className="pred-grid">{renderPredGrid(mlPred, groqTech, info)}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">🎯 Rekomendasi Akhir AI</div>
                <button
                  className={"fetch-news-btn " + (finalRecoBusy ? "loading" : "")}
                  style={S.groqBtn}
                  onClick={fetchFinalReco}
                  disabled={finalRecoBusy || !mlPred}
                >
                  <span className="spin-sm" style={S.spinPurple} />
                  <span className="btn-txt">{finalRecoBusy ? "Menganalisis..." : "▶ Minta AI Putuskan"}</span>
                </button>
              </div>
              <div className="card-body">{renderFinalReco(mlPred, groqTech, news, finalReco, finalRecoBusy, fetchFinalReco, currentTicker, indicators, info)}</div>
            </div>
          </div>

          <div className="right-col">
            <div className="card">
              <div className="card-header">
                <div className="card-title">🌐 Sentimen Berita</div>
              </div>
              <div className="card-body">{renderSentiment(news, newsErr, newsBusy, aiSummary, sentModel, setSentModel, bertSummary, llmSummary, llm2Summary)}</div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">📰 Berita Terkini</div>
                <span style={S.newsCount}>{news?.articles?.length ? news.articles.length + " artikel" : ""}</span>
              </div>
              <div className="card-body" style={S.newsBodyPad}>{renderNews(news, newsErr, newsBusy)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ═══ render helpers ═════════════════════════════════════
const gridFull = { gridColumn: "1/-1" }
const pad10 = { padding: "10px 0" }

function renderIndicators(d) {
  if (!d) {
    return (
      <div className="loading-overlay" style={gridFull}>
        <span className="spinner" /> Menghitung indikator...
      </div>
    )
  }
  const rsi = d.rsi || {}
  const macd = d.macd || {}
  const ma = d.moving_average || {}
  const items = [
    { label: "RSI (14)", val: fmt(rsi.value, 1), sig: rsi.signal, desc: "Mengukur momentum pergerakan harga" },
    { label: "MACD", val: (macd.value >= 0 ? "+" : "") + fmt(macd.value, 1), sig: macd.signal, small: false, desc: "Menunjukkan arah dan kekuatan tren" },
    { label: "MA 20 / MA 50", val: ma.golden_cross ? "Golden X" : "Death X", sig: ma.signal, small: true, desc: "Persilangan rata-rata 20 & 50 hari" },
  ]
  return items.map((item, i) => {
    const c = indColor(item.sig)
    const valStyle = item.small ? { color: c, fontSize: 13 } : { color: c }
    const sigStyle = { color: c }
    return (
      <div className="ind-item" key={i}>
        <div className="ind-label">{item.label}</div>
        <div className="ind-val" style={valStyle}>{item.val}</div>
        <div className="ind-sig" style={sigStyle}>{item.sig || "—"}</div>
        {item.desc && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.3 }}>{item.desc}</div>}
      </div>
    )
  })
}

function macroWeighted(d) {
  if (!d) return null
  const BASE_W = { IHSG: 25, ForeignFlow: 20, USDIDR: 20, BIRate: 15, Inflation: 10, GDP: 10 }
  const LABEL = { IHSG: "IHSG", USDIDR: "USD/IDR", BIRate: "BI Rate", Inflation: "Inflasi", GDP: "PDB", ForeignFlow: "Dana Asing" }
  const magMult = (x, ref) => Math.max(Math.min(Math.abs(Number(x) || 0) / ref, 2), 0.5)
  const MAG = {
    IHSG: magMult(d.IHSG && d.IHSG.trend ? d.IHSG.trend.month_pct : 0, 3),
    USDIDR: magMult(d.USDIDR && d.USDIDR.trend ? d.USDIDR.trend.month_pct : 0, 2),
    BIRate: magMult(d.BIRate ? d.BIRate.change : 0, 0.5),
    Inflation: magMult(d.Inflation ? d.Inflation.change : 0, 0.5),
    GDP: magMult(d.GDP ? d.GDP.change : 0, 0.3),
    ForeignFlow: magMult(d.ForeignFlow ? (d.ForeignFlow.net || 0) / 1e12 : 0, 2),
  }
  const sigOf = (f) => {
    if (!d[f]) return 0
    if (f === "IHSG" || f === "USDIDR") return d[f].trend ? d[f].trend.signal || 0 : 0
    return d[f].signal != null ? d[f].signal : 0
  }
  const KEYS = ["IHSG", "USDIDR", "BIRate", "Inflation", "GDP", "ForeignFlow"]
  const rawW = KEYS.map((k) => ({ key: k, label: LABEL[k], sig: sigOf(k), w: BASE_W[k] * MAG[k] }))
  const totW = rawW.reduce((acc, r) => acc + r.w, 0) || 1
  const weighted = rawW.map((r) => ({ ...r, pct: (r.w / totW) * 100 })).sort((a, b) => b.pct - a.pct)
  const bullW = weighted.filter((r) => r.sig === 1).reduce((acc, r) => acc + r.pct, 0)
  const bearW = weighted.filter((r) => r.sig === -1).reduce((acc, r) => acc + r.pct, 0)
  const decided = bullW + bearW
  const posPct = decided ? (bullW / decided) * 100 : 50
  const topDriver = weighted[0] || null
  const netW = bullW - bearW
  let status = "NETRAL"
  if (netW > 8) status = "KONDUSIF"
  if (netW < -8) status = "BERISIKO"
  const color = status === "KONDUSIF" ? "var(--green)" : status === "BERISIKO" ? "var(--red)" : "var(--amber)"
  return { status, color, posPct, negPct: 100 - posPct, bullW, bearW, netW, topDriver, weighted }
}

function renderMacroCards(d) {
  if (!d) return null
  const cards = [
    { name: "PDB (YoY)", val: (d.GDP?.value || 0) + "%", signum: d.GDP?.signal ?? 0, sig: (d.GDP?.signal ?? 0) > 0 ? "Bullish" : (d.GDP?.signal ?? 0) < 0 ? "Bearish" : "Netral", desc: "Kuartal Terakhir", small: false },
    { name: "Inflasi (YoY)", val: (d.Inflation?.value || 0) + "%", signum: d.Inflation?.signal ?? 0, sig: (d.Inflation?.signal ?? 0) > 0 ? "Bullish" : (d.Inflation?.signal ?? 0) < 0 ? "Bearish" : "Netral", desc: "Bulan Terakhir", small: false },
    { name: "BI Rate", val: (d.BIRate?.value || 0) + "%", signum: d.BIRate?.signal ?? 0, sig: (d.BIRate?.signal ?? 0) > 0 ? "Bullish" : (d.BIRate?.signal ?? 0) < 0 ? "Bearish" : "Netral", desc: "Suku Bunga Acuan", small: false },
    { name: "USD/IDR", val: "Rp " + (d.USDIDR?.value?.toLocaleString("id-ID") || 0), signum: d.USDIDR?.trend ? (d.USDIDR.trend.signal || 0) : 0, sig: (d.USDIDR?.trend?.signal || 0) > 0 ? "Menguat" : (d.USDIDR?.trend?.signal || 0) < 0 ? "Melemah" : "Stabil", desc: "Nilai Tukar Rupiah", small: true },
    { name: "IHSG", val: d.IHSG?.value?.toLocaleString("id-ID") || 0, signum: d.IHSG?.trend ? (d.IHSG.trend.signal || 0) : 0, sig: (d.IHSG?.trend?.signal || 0) > 0 ? "Bullish" : (d.IHSG?.trend?.signal || 0) < 0 ? "Bearish" : "Netral", desc: "Indeks Harga Saham", small: true },
    { name: "Dana Asing", val: d.ForeignFlow ? ((d.ForeignFlow.net || 0) >= 0 ? "+" : "-") + fmtBig(Math.abs(d.ForeignFlow.net || 0)) : "—", signum: d.ForeignFlow?.signal ?? 0, sig: (d.ForeignFlow?.signal ?? 0) > 0 ? "Masuk" : (d.ForeignFlow?.signal ?? 0) < 0 ? "Keluar" : "Netral", desc: "Aliran Dana Asing (tren 5 hari)", small: true },
  ]

  return cards.map((c, i) => {
    let sigVal = c.signum > 0 ? "Beli" : c.signum < 0 ? "Jual" : "Netral"

    const col = indColor(sigVal)
    const valStyle = c.small ? { color: col, fontSize: 13 } : { color: col }
    const sigStyle = { color: col }

    return (
      <div className="ind-item" key={i}>
        <div className="ind-label">{c.name}</div>
        <div className="ind-val" style={valStyle}>{c.val}</div>
        <div className="ind-sig" style={sigStyle}>{c.sig || "—"}</div>
        {c.desc && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.3 }}>{c.desc}</div>}
      </div>
    )
  })
}

function renderDualPred(ml, grok, busy, info) {
  const mlRecStyle = ml ? { color: recColor(ml.recommendation) } : null
  const grokRecStyle = grok ? { color: recColor(grok.recommendation) } : null
  const reasonsStyle = { marginTop: 6, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }
  const rangeStyle = { background: "rgba(167,139,250,0.12)", color: "var(--purple)" }
  const emptyStyle = { padding: "10px 0", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }

  const mlBody = ml ? (() => {
    const mlPreds = ml.predictions?.slice(0, 3) || []
    const pMin = mlPreds.length ? Math.min(...mlPreds.map(p => p.price_low || p.price)) : 0
    const pMax = mlPreds.length ? Math.max(...mlPreds.map(p => p.price_high || p.price)) : 0
    const fChg = mlPreds[0]?.change_pct || 0
    
    return (
    <>
      <div className="pred-src-badge badge-ml">⚡ Model XGBoost — 3 Hari</div>
      <div className="pred-src-price" style={{ fontSize: 20 }}>{fmt(pMin)} – {fmt(pMax)}</div>
      <span className={"pred-src-chg " + (fChg >= 0 ? "chg-pos-bg" : "chg-neg-bg")} style={{ padding: "2px 8px", borderRadius: 4, display: "inline-block", marginBottom: 8 }}>
        {(fChg >= 0 ? "+" : "") + fChg.toFixed(2) + "% H+1"}
      </span>
      <div className="pred-src-meta">
        <div className="pred-src-row"><span className="pred-src-k">Akurasi Model</span><span className="pred-src-v">{(ml.model_accuracy?.toFixed(1) || "—") + "%"}</span></div>
        <div className="pred-src-row"><span className="pred-src-k">Confidence</span><span className="pred-src-v">{Math.round((ml.confidence || 0) * 100) + "%"}</span></div>
        <div className="pred-src-row"><span className="pred-src-k">Rekomendasi</span><span className="pred-src-v" style={mlRecStyle}>{recLabel(ml.recommendation || "HOLD")}</span></div>
        {ml.predictions?.slice(0, 3).map((p, i) => (
          <div className="pred-src-row" key={i}>
            <span className="pred-src-k">H+{i + 1}</span>
            <span className="pred-src-v" style={{ color: p.change_pct >= 0 ? "var(--green)" : "var(--red)" }}>
              {fmt(p.price)}&nbsp;
              {p.price_low && p.price_high ? <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 9 }}>({fmt(p.price_low)}–{fmt(p.price_high)})</span> : null}
            </span>
          </div>
        ))}
      </div>
    </>
    )
  })() : (
    <>
      <div className="pred-src-badge badge-ml">⚡ Model XGBoost</div>
      <div className="loading-overlay" style={pad10}><span className="spinner" /></div>
    </>
  )

  const grokBody = busy ? (
    <>
      <div className="pred-src-badge badge-grok">✦ Prediksi LLM Langsung</div>
      <div className="loading-overlay" style={{ padding: "30px 0", flexDirection: "column" }}>
        <span className="spinner" style={{ width: 20, height: 20, borderTopColor: "var(--purple)" }} />
        <div style={{ marginTop: 12, fontSize: 11 }}>Menganalisis...</div>
      </div>
    </>
  ) : grok ? (
    <>
      <div className="pred-src-badge badge-grok">✦ Prediksi LLM — 3 Hari</div>
      <div className="pred-src-price" style={{ fontSize: 20 }}>
        {fmt(grok.price_range_3d?.min || grok.price_tomorrow_low)} – {fmt(grok.price_range_3d?.max || grok.price_tomorrow_high)}
      </div>
      <span className="pred-src-chg" style={{ ...rangeStyle, padding: "2px 8px", borderRadius: 4, display: "inline-block", marginBottom: 8 }}>
        {"H+1: " + fmt(grok.price_tomorrow)}
      </span>
      <div className="pred-src-meta">
        <div className="pred-src-row"><span className="pred-src-k">Rekomendasi</span><span className="pred-src-v" style={grokRecStyle}>{recLabel(grok.recommendation || "HOLD")}</span></div>
        {[
          { lbl: "H+1", price: grok.price_tomorrow, lo: grok.price_tomorrow_low, hi: grok.price_tomorrow_high },
          { lbl: "H+2", price: grok.day2_price, lo: grok.day2_low, hi: grok.day2_high },
          { lbl: "H+3", price: grok.day3_price, lo: grok.day3_low, hi: grok.day3_high },
        ].filter(r => r.price).map((r, i) => {
          let cColor = "var(--text-primary)";
          const dConf = predDayConf(grok, { "H+1": 0, "H+2": 1, "H+3": 2 }[r.lbl], info)
          if (info && info.current_price) {
            cColor = r.price >= info.current_price ? "var(--green)" : "var(--red)";
          }
          return (
            <div className="pred-src-row" key={i}>
              <span className="pred-src-k">{r.lbl}</span>
              <span className="pred-src-v" style={{ color: cColor }}>
                {fmt(r.price)}&nbsp;
                {r.lo && r.hi ? <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 9 }}>({fmt(r.lo)}–{fmt(r.hi)})</span> : null}
                {dConf != null ? <span style={predConfSpanStyle}> · Conf {dConf}%</span> : null}
              </span>
            </div>
          )
        })}
        <div style={reasonsStyle}>{(grok.reasons || []).map((r, i) => <div key={i}>{"• " + r}</div>)}</div>
      </div>
    </>
  ) : (
    <>
      <div className="pred-src-badge badge-grok">✦ Prediksi LLM Langsung</div>
      <div style={emptyStyle}>Menunggu analisis...</div>
    </>
  )

  return (
    <>
      <div className="pred-source-card psc-ml">{mlBody}</div>
      <div className="pred-source-card psc-grok">{grokBody}</div>
    </>
  )
}

function predDayConf(grok, idx, info) {
  if (!grok || idx == null) return null
  const llmArr = [grok.day1_confidence, grok.day2_confidence, grok.day3_confidence]
  if (llmArr[idx] != null) return Math.round(llmArr[idx] * 100)
  const base = grok.confidence != null ? grok.confidence : 0.6
  const decayArr = [1, 0.88, 0.76]
  const decay = decayArr[idx] != null ? decayArr[idx] : 0.7
  let conf = base * decay
  const bands = [
    { price: grok.price_tomorrow, lo: grok.price_tomorrow_low, hi: grok.price_tomorrow_high },
    { price: grok.day2_price, lo: grok.day2_low, hi: grok.day2_high },
    { price: grok.day3_price, lo: grok.day3_low, hi: grok.day3_high },
  ]
  const b = bands[idx]
  if (b && b.price && b.lo && b.hi) {
    const rel = Math.abs(b.hi - b.lo) / b.price
    const adj = Math.max(0.6, 1 - rel * 4)
    conf = conf * adj
  }
  conf = Math.max(0.3, Math.min(0.95, conf))
  return Math.round(conf * 100)
}

const predConfSpanStyle = { color: "var(--purple)", fontWeight: 600, fontSize: 9 }

function renderPredGrid(ml, grok, info) {
  if (!ml || !ml.predictions || !ml.predictions.length) {
    const e = { gridColumn: "1/-1", color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "12px 0" }
    return <div style={e}>Tidak ada data prediksi.</div>
  }
  const today = new Date()
  const curPriceTxt = info ? fmt(info.current_price) : "—"
  const gap = { height: 12 }
  const mt4 = { marginTop: 4 }
  const mutedChg = { color: "var(--text-muted)" }
  const confStyle = { fontSize: 9, color: "var(--purple)", marginTop: 2, fontWeight: 600 }
  const cells = [
    <div className="pred-day today-day" key="today">
      <div className="pred-date-lbl">{`${DAY_ID[today.getDay()]} ${today.getDate()} ${MON_ID[today.getMonth()]}`}</div>
      <div className="today-tag">Hari ini</div>
      <div className="pred-price" style={mt4}>{curPriceTxt}</div>
      <div className="pred-chg" style={mutedChg}>—</div>
    </div>,
  ]
  const grokPrices = grok ? [
    { price: grok.price_tomorrow, lo: grok.price_tomorrow_low, hi: grok.price_tomorrow_high },
    { price: grok.day2_price, lo: grok.day2_low, hi: grok.day2_high },
    { price: grok.day3_price, lo: grok.day3_low, hi: grok.day3_high }
  ] : []

  ml.predictions.slice(0, 6).forEach((p, i) => {
    const dt = new Date(p.date)
    const up = p.change_pct >= 0
    const chgStyle = { color: up ? "var(--green)" : "var(--red)" }

    const gObj = grokPrices[i] || {}
    const gPrice = gObj.price
    let gChangePct = null
    let gUp = false
    let gChgStyle = {}
    if (gPrice && info && info.current_price) {
      gChangePct = ((gPrice - info.current_price) / info.current_price) * 100
      gUp = gChangePct >= 0
      gChgStyle = { color: gUp ? "var(--green)" : "var(--red)" }
    }

    cells.push(
      <div className="pred-day" key={i}>
        <div className="pred-date-lbl" style={{ marginBottom: 8 }}>{`${DAY_ID[dt.getDay()]} ${dt.getDate()} ${MON_ID[dt.getMonth()]}`}</div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#fff", marginBottom: 2 }}>XGB</div>
            <div className="pred-price" style={{ color: "#fff" }}>{fmt(p.price)}</div>
            {p.price_low && p.price_high && (
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>
                ({fmt(p.price_low)}–{fmt(p.price_high)})
              </div>
            )}
            <div className="pred-chg" style={chgStyle}>{(up ? "+" : "") + p.change_pct.toFixed(2) + "%"}</div>
            {p.confidence != null && (
              <div style={confStyle}>Conf {Math.round(p.confidence * 100)}%</div>
            )}
          </div>

          {gPrice ? (
            <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid var(--border)" }}>
              <div style={{ fontSize: 9, color: "var(--purple)", marginBottom: 2 }}>LLM</div>
              <div className="pred-price" style={{ color: "#fff" }}>{fmt(gPrice)}</div>
              {gObj.lo && gObj.hi && (
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>
                  ({fmt(gObj.lo)}–{fmt(gObj.hi)})
                </div>
              )}
              <div className="pred-chg" style={gChgStyle}>{(gUp ? "+" : "") + gChangePct.toFixed(2) + "%"}</div>
              {predDayConf(grok, i, info) != null && (
                <div style={confStyle}>Conf {predDayConf(grok, i, info)}%</div>
              )}
            </div>
          ) : null}
        </div>
      </div>,
    )
  })
  return cells
}

function renderFinalReco(ml, grok, news, apiRes, busy, onGenerate, ticker, indicators, info) {
  if (busy) {
    return (
      <div className="loading-overlay" style={{ flexDirection: "column", gap: 10, padding: "24px 0" }}>
        <span className="spinner" />
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          AI sedang menganalisis semua faktor...<br />
          <span style={{ fontSize: 10 }}>Ini mungkin memerlukan 10–20 detik</span>
        </div>
      </div>
    )
  }
  if (!ml) {
    return (
      <div className="loading-overlay">
        <span className="spinner" /> Menunggu prediksi ML...
      </div>
    )
  }

  // ── Empty state: tampilkan placeholder CTA sebelum user klik tombol ──
  if (!apiRes) {
    return (
      <div className="reco-empty-state">
        <div className="reco-empty-icon">🎯</div>
        <div className="reco-empty-title">Analisis AI Belum Dijalankan</div>
        <div className="reco-empty-desc">
          Dapatkan rekomendasi akhir komprehensif yang menganalisis secara mendalam seluruh indikator pasar:
        </div>
        <div className="reco-empty-factors">
          {[
            { icon: "⚡", label: "Prediksi XGBoost" },
            { icon: "🔮", label: "Analisis LLM" },
            { icon: "📈", label: "RSI & MACD" },
            { icon: "📊", label: "Moving Average" },
            { icon: "🎰", label: "Bollinger & Stochastic" },
            { icon: "📰", label: "Sentimen Berita" },
            { icon: "���", label: "Makro Ekonomi" },
            { icon: "💹", label: "Volume & Momentum" },
          ].map((f, i) => (
            <div className="reco-empty-factor-chip" key={i}>
              <span>{f.icon}</span> {f.label}
            </div>
          ))}
        </div>

        <button className="reco-empty-gen-btn" onClick={onGenerate}>
          ✨ Minta AI Putuskan
        </button>

        <div className="reco-empty-note">
          ✦ Output berupa rekomendasi akhir lengkap dengan penjelasan per faktor, entry, stop loss, dan target harga
        </div>
      </div>
    )
  }

  const scores = { BUY: 1, HOLD: 0, SELL: -1 }
  let finalRec = "HOLD"
  let finalConf = 50
  let stopLoss = 0
  let entry = 0
  let target = 0
  let target2 = 0
  let rrRatio = 0
  let signalAgreement = "—"
  let summaryText = ""
  let factors = []
  const mlConf = ml.confidence || 0.5

  if (apiRes && apiRes.final_recommendation) {
    finalRec = apiRes.final_recommendation
    finalConf = Math.round((apiRes.overall_confidence || 0.5) * 100)
    stopLoss = apiRes.stop_loss || 0
    entry = apiRes.entry_price || 0
    target = apiRes.take_profit_1 || 0
    target2 = apiRes.take_profit_2 || 0
    rrRatio = apiRes.risk_reward_ratio || 0
    signalAgreement = apiRes.signal_agreement || "—"
    summaryText = apiRes.summary || ""
    factors = apiRes.factor_analysis || []
  } else {
    let totalWeight = 0
    let weighted = 0
    const mlScore = scores[ml.recommendation] || 0
    weighted += mlScore * mlConf * 0.4
    totalWeight += 0.4
    if (grok) {
      weighted += (scores[grok.recommendation] || 0) * (grok.confidence || 0.5) * 0.35
      totalWeight += 0.35
    }
    if (news) {
      const sentMap = { positive: 1, neutral: 0, negative: -1 }
      const sentScore = sentMap[news.sentiment_summary?.overall] || 0
      const sentConf = (news.sentiment_summary?.score || 50) / 100
      weighted += sentScore * sentConf * 0.25
      totalWeight += 0.25
    }
    const norm = totalWeight > 0 ? weighted / totalWeight : 0
    finalRec = norm > 0.15 ? "BUY" : norm < -0.15 ? "SELL" : "HOLD"
    finalConf = Math.round(Math.min(Math.abs(norm) * 100 + 50, 95))
    const curRaw = ml.entry || ml.predictions?.[0]?.price || 0
    stopLoss = ml.stop_loss || Math.round(curRaw * (finalRec === "BUY" ? 0.95 : 1.05))
    entry = ml.entry || curRaw
    target = ml.target || grok?.price_max_5d || grok?.price_range_5d?.max || Math.round(curRaw * (finalRec === "BUY" ? 1.06 : 0.94))
  }

  const dotClass = finalRec === "BUY" ? "buy" : finalRec === "SELL" ? "sell" : "hold"
  const color = recColor(finalRec)
  const colorStyle = { color }
  const redV = { color: "var(--red)" }
  const blueV = { color: "var(--blue)" }
  const greenV = { color: "var(--green)" }
  const summaryStyle = { color: "var(--purple)" }
  const sources = [`XGBoost (${Math.round(mlConf * 100)}%)`]
  if (grok) sources.push(`LLM Langsung (${Math.round((grok.confidence || 0) * 100)}%)`)
  if (news) sources.push(`Sentimen Berita (${news.sentiment_summary?.score || "—"}/100)`)
  if (apiRes) sources.push(`Analisis Sentimen & Makro LLM`)

  const agreeBadgeStyle = {
    background: signalAgreement === "Sepakat" ? "rgba(45,212,160,0.15)" : signalAgreement === "Mayoritas" ? "rgba(245,183,49,0.15)" : "rgba(245,94,94,0.15)",
    color: signalAgreement === "Sepakat" ? "var(--green)" : signalAgreement === "Mayoritas" ? "var(--amber)" : "var(--red)",
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, display: "inline-block", letterSpacing: "0.04em",
  }

  const hasFactors = factors && factors.length > 0

  return (
    <>
      {/* ── Final verdict ── */}
      <div className="reco-action">
        <div className={"action-dot " + dotClass} />
        <div className="action-label" style={colorStyle}>{recLabel(finalRec)}</div>
        {signalAgreement !== "—" && <span style={agreeBadgeStyle}>{signalAgreement}</span>}
        <div className="conf-block">
          <div className="conf-lbl">Tingkat Keyakinan</div>
          <div className="conf-val" style={colorStyle}>{finalConf + "%"}</div>
        </div>
      </div>

      {/* ── Summary / Kesimpulan Keputusan Akhir AI ── */}
      {(summaryText || grok?.summary) ? (
        <div className="reco-summary-box" style={{ marginTop: 12, padding: "12px 14px", background: "rgba(167, 139, 250, 0.05)", border: "1px solid rgba(167, 139, 250, 0.15)", borderRadius: "var(--r-sm)", lineHeight: 1.6, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--purple)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span>🔮</span> Kesimpulan & Ringkasan Analisis AI
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", fontStyle: "normal" }}>
            {summaryText || grok?.summary}
          </div>
        </div>
      ) : (
        <div className="reco-desc">
          {"Rekomendasi dihitung dari: "}
          <strong>{sources.join(" · ")}</strong>.
        </div>
      )}



      {/* ── Per-factor analysis breakdown (only when AI analysis is available) ── */}
      {hasFactors && (
        <div className="factor-analysis-section">
          <div className="factor-section-title">
            <span>📊 Analisis Faktor Lengkap</span>
            <span className="factor-section-count">{factors.length} faktor</span>
          </div>
          <div className="factor-list">
            {factors.map((f, idx) => {
              const fColor = f.signal === "BUY" ? "var(--green)" : f.signal === "SELL" ? "var(--red)" : "var(--amber)"
              const fBg = f.signal === "BUY" ? "rgba(45,212,160,0.12)" : f.signal === "SELL" ? "rgba(245,94,94,0.12)" : "rgba(245,183,49,0.12)"
              const fBorder = f.signal === "BUY" ? "rgba(45,212,160,0.25)" : f.signal === "SELL" ? "rgba(245,94,94,0.25)" : "rgba(245,183,49,0.25)"
              const scoreW = Math.min(Math.max(f.score || 0, 0), 100)
              const weightW = Math.min(Math.max(f.weight || 0, 0), 100)
              const sigLabel = f.signal === "BUY" ? "BELI" : f.signal === "SELL" ? "JUAL" : "TAHAN"
              return (
                <div className="factor-item" key={idx} style={{ borderLeft: `3px solid ${fBorder}` }}>
                  <div className="factor-header">
                    <div className="factor-name">{f.factor}</div>
                    <div className="factor-badges">
                      <span className="factor-weight-lbl">Bobot {weightW}%</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Skor {scoreW}</span>
                      <span className="factor-signal-badge" style={{ background: fBg, color: fColor, borderColor: fBorder }}>
                        {sigLabel}
                      </span>
                    </div>
                  </div>
                  {f.explanation && (
                    <div className="factor-explanation">{f.explanation}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Price levels ── */}
      <div className="reco-levels" style={{ marginTop: hasFactors ? 16 : 0 }}>
        <div className="lvl-item">
          <div className="lvl-label">Stop Loss</div>
          <div className="lvl-val" style={redV}>{fmt(stopLoss)}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>Batas rugi maks</div>
        </div>
        <div className="lvl-item">
          <div className="lvl-label">Entry</div>
          <div className="lvl-val" style={blueV}>{fmt(entry)}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>Harga beli ideal</div>
        </div>
        <div className="lvl-item">
          <div className="lvl-label">Target 1</div>
          <div className="lvl-val" style={greenV}>{fmt(target)}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>Target ambil untung</div>
          {target2 > 0 && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>T2: <span style={greenV}>{fmt(target2)}</span></div>}
        </div>
      </div>
      {rrRatio > 0 && (
        <div style={{ textAlign: "right", fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
          Risk/Reward: <span style={{ color: rrRatio >= 2 ? "var(--green)" : "var(--amber)", fontWeight: 700 }}>{rrRatio.toFixed(2)}x</span>
        </div>
      )}

      {/* ── Support & Resistance ── */}
      {(indicators?.bollinger_bands || (info && info.day_high && info.day_low)) && (() => {
        const bbLower = indicators?.bollinger_bands?.lower || 0
        const bbUpper = indicators?.bollinger_bands?.upper || 0
        const bbMid   = indicators?.bollinger_bands?.middle || indicators?.bollinger_bands?.sma || 0
        const curPrice = entry || ml?.predictions?.[0]?.price || info?.current_price || 0
        const distToSup  = curPrice > 0 && bbLower > 0 ? (((curPrice - bbLower) / curPrice) * 100).toFixed(1) : null
        const distToRes  = curPrice > 0 && bbUpper > 0 ? (((bbUpper - curPrice) / curPrice) * 100).toFixed(1) : null

        // Pivot Points calculation
        let calculatedSR = []
        if (info && info.day_high && info.day_low && info.current_price) {
          const H = info.day_high
          const L = info.day_low
          const C = info.current_price
          const PP = (H + L + C) / 3
          const R1 = (2 * PP) - L
          const R2 = PP + (H - L)
          const S1 = (2 * PP) - H
          const S2 = PP - (H - L)
          
          calculatedSR = [
            { label: "Resistance 2 (R2)", price: R2, color: "var(--red)", type: "res" },
            { label: "Resistance 1 (R1)", price: R1, color: "var(--red)", type: "res" },
            { label: "Pivot Point (PP)", price: PP, color: "var(--blue)", type: "pivot" },
            { label: "Support 1 (S1)", price: S1, color: "var(--green)", type: "sup" },
            { label: "Support 2 (S2)", price: S2, color: "var(--green)", type: "sup" },
          ]
        }

        return (
          <div className="sr-section">
            <div className="sr-header">
              <span className="sr-header-icon">📐</span>
              <span>Peta Level Kunci (Support &amp; Resistance)</span>
              <span className="sr-header-badge">Harian</span>
            </div>

            <div className="sr-columns">
              {/* Bollinger Bands Column */}
              {indicators?.bollinger_bands ? (
                <div className="sr-column">
                  <div className="sr-col-title">🛡️ Dinamis (Bollinger Bands)</div>
                  <div className="sr-grid">
                    {/* Support */}
                    <div className="sr-card sr-support">
                      <div className="sr-card-top">
                        <span className="sr-card-label">Support</span>
                        {distToSup !== null && (
                          <span className="sr-card-dist sr-dist-sup">-{distToSup}%</span>
                        )}
                      </div>
                      <div className="sr-card-val" style={{ color: "var(--green)" }}>{fmt(bbLower)}</div>
                      <div className="sr-card-sub">BB Band Bawah</div>
                      {bbLower > 0 && curPrice > 0 && (
                        <div className="sr-bar-wrap">
                          <div className="sr-bar sr-bar-sup" style={{ width: Math.min(100, Math.max(5, 100 - parseFloat(distToSup || 100))) + "%" }} />
                        </div>
                      )}
                    </div>

                    {/* Mid / SMA */}
                    {bbMid > 0 && (
                      <div className="sr-card sr-mid">
                        <div className="sr-card-top">
                          <span className="sr-card-label">SMA-20</span>
                        </div>
                        <div className="sr-card-val" style={{ color: "var(--amber)" }}>{fmt(bbMid)}</div>
                        <div className="sr-card-sub">Moving Average</div>
                      </div>
                    )}

                    {/* Resistance */}
                    <div className="sr-card sr-resist">
                      <div className="sr-card-top">
                        <span className="sr-card-label">Resistance</span>
                        {distToRes !== null && (
                          <span className="sr-card-dist sr-dist-res">+{distToRes}%</span>
                        )}
                      </div>
                      <div className="sr-card-val" style={{ color: "var(--red)" }}>{fmt(bbUpper)}</div>
                      <div className="sr-card-sub">BB Band Atas</div>
                      {bbUpper > 0 && curPrice > 0 && (
                        <div className="sr-bar-wrap">
                          <div className="sr-bar sr-bar-res" style={{ width: Math.min(100, Math.max(5, 100 - parseFloat(distToRes || 100))) + "%" }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price position indicator */}
                  {curPrice > 0 && bbLower > 0 && bbUpper > 0 && (() => {
                    const range = bbUpper - bbLower
                    const pos = range > 0 ? Math.min(100, Math.max(0, ((curPrice - bbLower) / range) * 100)) : 50
                    const zoneLabel = pos < 30 ? "⚡ Mendekati Support BB" : pos > 70 ? "⚠️ Mendekati Resistance BB" : "✅ Harga di tengah range BB"
                    const zoneColor = pos < 30 ? "var(--green)" : pos > 70 ? "var(--red)" : "var(--amber)"
                    return (
                      <div className="sr-position-wrap">
                        <div className="sr-position-label">Harga vs Range Bollinger Bands</div>
                        <div className="sr-position-bar-track">
                          <div className="sr-position-zone-sup" />
                          <div className="sr-position-zone-mid" />
                          <div className="sr-position-zone-res" />
                          <div className="sr-position-marker" style={{ left: pos + "%" }}>
                            <div className="sr-position-dot" style={{ background: zoneColor }} />
                          </div>
                        </div>
                        <div className="sr-zone-note" style={{ color: zoneColor, marginTop: 4 }}>{zoneLabel}</div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="sr-column" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140, color: "var(--text-muted)", fontSize: 11 }}>
                  Menghitung Bollinger Bands...
                </div>
              )}

              {/* Pivot Points Column */}
              {calculatedSR.length > 0 ? (
                <div className="sr-column">
                  <div className="sr-col-title">🎯 Klasik (Pivot Points)</div>
                  <div className="sr-pivot-list">
                    {calculatedSR.map((lvl, idx) => {
                      const dist = curPrice > 0 ? (((lvl.price - curPrice) / curPrice) * 100).toFixed(1) : null
                      const distVal = parseFloat(dist || "0")
                      const isAbove = distVal > 0
                      const isZero = distVal === 0
                      const badgeStyle = {
                        color: isZero ? "var(--blue)" : isAbove ? "var(--red)" : "var(--green)",
                        background: isZero ? "rgba(79,156,249,0.12)" : isAbove ? "rgba(245,94,94,0.12)" : "rgba(45,212,160,0.12)"
                      }

                      return (
                        <div className="sr-pivot-item" key={idx} style={{
                          borderLeft: `3px solid ${lvl.color}`,
                          background: lvl.type === "pivot" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)"
                        }}>
                          <span className="sr-pivot-lbl" style={{ color: lvl.type === "pivot" ? "var(--text-primary)" : "var(--text-secondary)" }}>
                            {lvl.label}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="sr-pivot-val" style={{ color: lvl.type === "pivot" ? "var(--blue)" : "var(--text-primary)" }}>
                              {fmt(lvl.price)}
                            </span>
                            {dist !== null && (
                              <span className="sr-pivot-dist" style={badgeStyle}>
                                {isZero ? "Pivot" : (isAbove ? "+" : "") + dist + "%"}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="sr-column" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140, color: "var(--text-muted)", fontSize: 11 }}>
                  Data OHLC harian tidak cukup untuk menghitung Pivot Points.
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--r-sm)", border: "1px solid var(--border-light)", lineHeight: 1.5 }}>
        ℹ️ <strong>Panduan Transaksi:</strong>
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          <li>Mulai membeli saham di kisaran harga <strong>Entry (Beli)</strong>.</li>
          <li>Batasi potensi kerugian dengan menjual jika harga turun menembus <strong>Stop Loss (Batas Rugi)</strong>.</li>
          <li>Ambil keuntungan secara bertahap saat harga naik mencapai <strong>Target 1 (Jual)</strong>.</li>
          <li>Pantau area <strong>Support</strong> sebagai zona beli ulang dan <strong>Resistance</strong> sebagai potensi tekanan jual.</li>
        </ul>
      </div>
    </>
  )
}

function renderSentiment(news, err, busy, aiSummary, sentModel, setSentModel, bertSummary, llmSummary, llm2Summary) {
  if (busy) {
    return (
      <div className="loading-overlay" style={{ padding: "40px 0", flexDirection: "column" }}>
        <span className="spinner" style={{ width: 24, height: 24, borderTopColor: "var(--teal)" }} />
        <div style={{ marginTop: 12, fontSize: 12 }}>Scraping berita & analisis sentimen...</div>
      </div>
    )
  }
  if (err && !news) return <div className="error-msg">{"Gagal: " + err}</div>
  if (!news) {
    const def = { textAlign: "center", padding: "16px 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }
    const green = { color: "var(--green)" }
    return (
      <div style={def}>
        Klik <strong style={green}>↻ Ambil Berita</strong> untuk scrape<br />berita terkini & analisis sentimen.
      </div>
    )
  }

  // Gunakan bertSummary (client-side) yang konsisten dengan BeritaSentimen
  const s = bertSummary || {}

  // ─── Render model selector ───
  const renderSelector = () => <OvSentTabs value={sentModel} onChange={setSentModel} />

  // ─── Render single model gauges & progress bars ───
  const renderSingleModel = (data, title) => {
    const overallColor = data.overall === "positive" ? "var(--green)" : data.overall === "negative" ? "var(--red)" : "var(--amber)"
    const overallLabel = data.overall === "positive" ? "Positif" : data.overall === "negative" ? "Negatif" : "Netral"
    const circleBg = data.overall === "positive" ? "rgba(45,212,160,0.1)" : data.overall === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)"
    const circleStyle = { background: circleBg, border: "1.5px solid " + overallColor + "55", color: overallColor, padding: "10px 22px", borderRadius: 12, fontSize: 20, fontWeight: 800, alignSelf: "center", display: "inline-flex", alignItems: "center", lineHeight: 1 }
    const numStyle = { color: overallColor }
    const headStyle = { color: "var(--text-primary)", fontSize: 15 }
    const posFill = { width: (data.positive_pct || 0) + "%", background: "var(--green)" }
    const neuFill = { width: (data.neutral_pct || 0) + "%", background: "var(--amber)" }
    const negFill = { width: (data.negative_pct || 0) + "%", background: "var(--red)" }

    return (
      <>
        <div className="sent-top">
          <div className="sent-pill-lg" style={circleStyle}>{overallLabel}</div>
          <div className="sent-info">
            <h4 style={headStyle}>{(news.total_articles || 0) + " artikel dianalisis"}</h4>
            <p>{title + ` · Skor confidence ${data.score}`}</p>
          </div>
        </div>
        <div className="sbar-row">
          <span className="sbar-lbl">Positif</span>
          <div className="sbar-track"><div className="sbar-fill" style={posFill} /></div>
          <span className="sbar-pct">{(data.positive_pct || 0) + "%"}</span>
        </div>
        <div className="sbar-row">
          <span className="sbar-lbl">Netral</span>
          <div className="sbar-track"><div className="sbar-fill" style={neuFill} /></div>
          <span className="sbar-pct">{(data.neutral_pct || 0) + "%"}</span>
        </div>
        <div className="sbar-row">
          <span className="sbar-lbl">Negatif</span>
          <div className="sbar-track"><div className="sbar-fill" style={negFill} /></div>
          <span className="sbar-pct">{(data.negative_pct || 0) + "%"}</span>
        </div>
      </>
    )
  }

  // ─── Render dual model comparison ───
  const renderComparison = () => <OvCompare bert={bertSummary} llm={llmSummary} llm2={llm2Summary} />

  return (
    <>
      {renderSelector()}

      {sentModel === "compare" && renderComparison()}
      {sentModel === "bert" && renderSingleModel(bertSummary, "Model sentimen IndoBERT")}
      {sentModel === "llm" && renderSingleModel(llmSummary, "Model sentimen Llama")}
      {sentModel === "llm2" && renderSingleModel(llm2Summary, "Model sentimen Qwen")}

      <div className="ai-box" style={{ marginTop: 16 }}>
        <div className="ai-lbl"><span>✦</span> Ringkasan Groq AI</div>
        <span>{aiSummary || "Membuat ringkasan AI..."}</span>
      </div>
    </>
  )
}

function renderNews(news, err, busy) {
  if (busy) {
    return (
      <div className="loading-overlay" style={{ padding: "20px 0", flexDirection: "column" }}>
        <span className="spinner" style={{ borderTopColor: "var(--teal)" }} />
        <div style={{ marginTop: 8, fontSize: 12 }}>Memuat berita terkini...</div>
      </div>
    )
  }
  if (err && !news) return <div className="error-msg">{"Gagal memuat berita: " + err}</div>
  const articles = news?.articles || []
  if (!articles.length) {
    const def = { color: "var(--text-muted)", fontSize: 12, padding: "12px 0", textAlign: "center" }
    return <div style={def}>Belum ada berita. Klik “↻ Ambil Berita”.</div>
  }
  // Tampilkan 5 berita teratas dengan visual dual-score persis halaman sentimen
  return articles.slice(0, 5).map((a, i) => {
    const hfMeta = SENT_META[a.sentiment] || SENT_META.neutral
    const llmMeta = SENT_META[a.llm_sentiment] || SENT_META.neutral
    return (
      <div className="eNews-item" key={i}>
        <ArticleBadges a={a} meta={SENT_META} />

        <div className="eNews-body">
          <div className="eNews-title">
            {a.url
              ? <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a>
              : a.title}
          </div>
          <div className="eNews-meta">
            <span className="eNews-src">{CAT_LABELS[a.category] || a.category}</span>
            <span className="eNews-time">{a.time || a.source}</span>
            <span className="eNews-impact impact-med">
              BERT: {hfMeta.label} &nbsp;|&nbsp; LLM: {llmMeta.label}
            </span>
          </div>
        </div>
      </div>
    )
  })
}
