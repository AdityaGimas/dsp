import { useEffect, useMemo, useRef, useState } from "react"
import { Line, Bar } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"
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


export default function Overview() {
  const { currentTicker, refreshTrigger, isRefreshing, setIsRefreshing } = useApp()

  const [info, setInfo] = useState(null)
  const [hist, setHist] = useState([])
  const [period, setPeriod] = useState("3mo")
  const [maPeriods, setMaPeriods] = useState([])
  const [volumeMaPeriod, setVolumeMaPeriod] = useState(20)
  const [indicators, setIndicators] = useState(null)
  const [mlPred, setMlPred] = useState(null)
  const [groqTech, setGroqTech] = useState(null)
  const [news, setNews] = useState(null)
  const [aiSummary, setAiSummary] = useState("")
  const [sentModel, setSentModel] = useState("compare")
  const [macroData, setMacroData] = useState(null)
  const [finalReco, setFinalReco] = useState(null)
  const [finalRecoBusy, setFinalRecoBusy] = useState(false)

  const [groqTechBusy, setGroqTechBusy] = useState(false)
  const [groqTechErr, setGroqTechErr] = useState("")
  const [newsBusy, setNewsBusy] = useState(false)
  const [newsErr, setNewsErr] = useState("")
  const [groqTechTs, setGroqTechTs] = useState(null)
  const [newsTs, setNewsTs] = useState(null)

  useEffect(() => {
    if (refreshTrigger > 0) {
      refreshAll()
    }
  }, [refreshTrigger])

  const code = currentTicker.replace(".JK", "")

  useEffect(() => {
    let alive = true
    const t = currentTicker
    setGroqTech(null)
    setGroqTechErr("")
    setNews(null)
    setNewsErr("")
    setAiSummary("")
    setGroqTechTs(null)
    setNewsTs(null)
    setFinalReco(null)

    const cache = loadCache(t)
    if (cache) {
      if (cache.groqTech) {
        setGroqTech(cache.groqTech.d)
        setGroqTechTs(cache.groqTech.ts)
      }
      if (cache.news) {
        setNews(cache.news.d)
        setNewsTs(cache.news.ts)
      }
      if (cache.groqNewsSummary) setAiSummary(cache.groqNewsSummary.d)
    }

    setInfo(null)
    api.getStockInfo(t).then((d) => alive && setInfo(d)).catch(() => alive && setInfo(null))

    setIndicators(null)
    api
      .getIndicators(t)
      .then((d) => alive && setIndicators(d && d.rsi ? d : null))
      .catch(() => alive && setIndicators(null))

    setMlPred(null)
    api
      .getPrediction(t)
      .then((d) => {
        if (!alive) return
        setMlPred(d)
        saveCache(t, "ml", d)
      })
      .catch((e) => {
        console.error("Gagal mendapatkan prediksi ML:", e)
        if (alive) setMlPred(null)
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
    ]).then(([f, i, p, h, mac]) => {
      setInfo(f.status === "fulfilled" ? f.value : null)
      setIndicators(i.status === "fulfilled" && i.value && i.value.rsi ? i.value : null)
      if (p.status === "fulfilled") {
        setMlPred(p.value)
        saveCache(t, "ml", p.value)
      }
      setHist(h.status === "fulfilled" && h.value.data && h.value.data.length ? h.value.data : [])
      if (mac.status === "fulfilled") setMacroData(mac.value.data)
      setIsRefreshing(false)
    })
    fetchNews()
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
      }
      const res = await api.groqTechnical(payload)
      setGroqTech(res)
      setGroqTechTs(Date.now())
      saveCache(currentTicker, "groqTech", res)
    } catch (e) {
      setGroqTechErr(e.message)
    } finally {
      setGroqTechBusy(false)
    }
  }

  async function fetchNews() {
    setNewsBusy(true)
    setNewsErr("")
    try {
      // 1. Ambil berita + konten dari backend (50 artikel agar konsisten dengan halaman sentimen)
      const newsData = await api.getNews(currentTicker, 50)
      if (!newsData.articles || !newsData.articles.length)
        throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.")

      // 2. Kirim ke sentiment dengan category dari news pipeline
      const sentData = await api.predictSentiment(
        currentTicker,
        newsData.articles.map((a) => ({
          title: a.title,
          content: a.content || "",
          category: a.category || "market",
        })),
      )

      // 3. Merge hasil sentimen ke artikel
      const merged = newsData.articles.map((a, i) => ({
        ...a,
        category: sentData.results[i]?.category || a.category || "market",
        sentiment: sentData.results[i]?.sentiment || "neutral",
        sentiment_label: sentData.results[i]?.label || "Netral",
        score: sentData.results[i]?.score ?? 0,
        llm_sentiment: sentData.results[i]?.llm_sentiment || "neutral",
        llm_label: sentData.results[i]?.llm_label || "Netral",
        llm_score: sentData.results[i]?.llm_score ?? 0,
      }))

      const ln = {
        total_articles: sentData.total_articles,
        articles: merged,
        sentiment_summary: sentData.summary,
      }
      setNews(ln)
      setNewsTs(Date.now())
      saveCache(currentTicker, "news", ln)

      setAiSummary("Membuat ringkasan AI...")
      api
        .groqNewsSummary({
          ticker: currentTicker,
          articles: merged.map((a) => ({ source: a.source, title: a.title })),
          sentiment_summary: sentData.summary,
        })
        .then((r) => {
          const txt = r.summary || r.main_theme || "Groq tidak memberikan ringkasan."
          setAiSummary(txt)
          saveCache(currentTicker, "groqNewsSummary", txt)
        })
        .catch((e) => setAiSummary("Gagal ringkasan Groq: " + e.message))
    } catch (e) {
      setNewsErr(e.message)
    } finally {
      setNewsBusy(false)
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
        groq_news: news || undefined,
        macro_data: macroData || undefined,
        indicators: indicators || undefined,
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

  const autoNewsRef = useRef(null)
  useEffect(() => {
    if (!news && !newsBusy && !newsErr && !newsTs && autoNewsRef.current !== currentTicker) {
      autoNewsRef.current = currentTicker
      fetchNews()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news, newsBusy, newsErr, newsTs, currentTicker])

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

    if (predDates.length && Number.isFinite(lastClose)) {
      const mlPreds3 = mlPred.predictions.slice(0, 3)
      const mlConnector = Array(histLen).fill(null)
      mlConnector[histLen - 1] = lastClose
      datasets.push({
        label: "XGBoost",
        data: [...mlConnector, ...mlPreds3.map((p) => p.price)],
        borderColor: "#2dd4a0",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: [...Array(histLen - 1).fill(0), 3, ...mlPreds3.map(() => 4)],
        pointBackgroundColor: "#2dd4a0",
        tension: 0.3,
        fill: false,
        _isXgbBand: true,
        _bandData: mlPreds3.map((p, i) => ({
          x: predDates[i],
          low: p.price_low ?? p.price * 0.98,
          high: p.price_high ?? p.price * 1.02,
        })),
      })

      if (groqTech?.price_tomorrow) {
        const llmPrices = [
          groqTech.price_tomorrow,
          groqTech.day2_price,
          groqTech.day3_price,
        ].filter(Boolean)
        const llmLow = [groqTech.price_tomorrow_low, groqTech.day2_low, groqTech.day3_low]
        const llmHigh = [groqTech.price_tomorrow_high, groqTech.day2_high, groqTech.day3_high]

        const gd = Array(labels.length).fill(null)
        gd[histLen - 1] = lastClose
        llmPrices.forEach((p, i) => { if (p) gd[histLen + i] = p })
        datasets.push({
          label: "LLM",
          data: gd,
          borderColor: "#a78bfa",
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: [...Array(histLen - 1).fill(0), 3, ...llmPrices.map(() => 4)],
          pointBackgroundColor: "#a78bfa",
          tension: 0.3,
          fill: false,
          _isLlmBand: true,
          _bandData: llmPrices.map((_, i) => ({
            x: predDates[i],
            low: llmLow[i] ?? lastClose * 0.97,
            high: llmHigh[i] ?? lastClose * 1.03,
          })),
        })
      }
    }
    return { labels, datasets }
  }, [hist, mlPred, groqTech, maPeriods])

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
  const sm = news?.sentiment_summary || {}

  const llmSummary = useMemo(() => {
    if (!news || !news.articles || !news.articles.length) return {
      positive: 0, neutral: 0, negative: 0,
      positive_pct: 0, neutral_pct: 0, negative_pct: 0,
      score: 0, overall: "neutral", overall_label: "Netral"
    }
    const articles = news.articles
    let pos = 0, neu = 0, neg = 0
    articles.forEach((a) => {
      if (a.llm_sentiment === "positive") pos++
      else if (a.llm_sentiment === "negative") neg++
      else neu++
    })
    const total = articles.length
    const pos_pct = Math.round(pos / total * 100)
    const neu_pct = Math.round(neu / total * 100)
    const neg_pct = Math.round(neg / total * 100)
    const score = Math.round((pos * 100 + neu * 50) / total)
    const overall = pos_pct > 50 ? "positive" : (neg_pct > 50 ? "negative" : "neutral")
    const overall_label = overall === "positive" ? "Positif" : (overall === "negative" ? "Negatif" : "Netral")
    return {
      positive: pos,
      neutral: neu,
      negative: neg,
      positive_pct: pos_pct,
      neutral_pct: neu_pct,
      negative_pct: neg_pct,
      score,
      overall,
      overall_label,
    }
  }, [news])

  const ov = indicators?.overall || {}
  const mlFirst = mlPred?.predictions?.[0]
  const pos = info ? info.change_pct >= 0 : true
  const predSubColor = mlFirst && mlFirst.change_pct >= 0 ? S.green : S.red
  const sentColor1 = sm.overall === "positive" ? S.green : sm.overall === "negative" ? S.red : S.amberTxt
  const sentColor2 = llmSummary.overall === "positive" ? S.green : llmSummary.overall === "negative" ? S.red : S.amberTxt
  const sentKpiStyle = news ? (sentModel === "llm" ? sentColor2 : sentColor1) : S.tealTxt
  const grokKpiStyle = groqTech ? { color: recColor(groqTech.recommendation) } : S.purpleTxt
  const signalStyle = ov.signal ? { color: indColor(ov.signal) } : S.greenTxt
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
          <div className="kpi-card kpi-c-blue">
            <div className="kpi-label">Prediksi XGB vs LLM (Besok)</div>
            <div className="kpi-val">
              {mlPred && groqTech ? (
                mlPred.recommendation === groqTech.recommendation ? (
                  <span style={{ color: indColor(recLabel(mlPred.recommendation)) }}>
                    {recLabel(mlPred.recommendation)}
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
              {mlPred && groqTech ? (mlPred.recommendation === groqTech.recommendation ? "Kedua model AI sepakat memberikan rekomendasi arah yang sama." : "Terdapat perbedaan prediksi antara model XGBoost dan LLM.") : "—"}
            </div>
          </div>

          {/* Card 2: Ringkasan Indikator Teknikal */}
          <div className="kpi-card kpi-c-purple">
            <div className="kpi-label">Indikator Teknikal</div>
            <div className="kpi-val" style={{ color: ov.signal ? indColor(ov.signal) : "var(--text-muted)" }}>
              {ov.signal ? ov.signal.toUpperCase() : "Menunggu..."}
            </div>
            <div className="kpi-sub">
              {indicators ? `Analisis gabungan RSI, MACD, dan Moving Average mengkonfirmasi arah ini.` : "—"}
            </div>
          </div>

          {/* Card 3: Ringkasan Sentimen */}
          <div className="kpi-card kpi-c-teal">
            <div className="kpi-label">Berita dan Sentimen</div>
            <div className="kpi-val" style={{ color: news ? indColor(sentModel === "llm" ? llmSummary.overall_label : sm.overall_label) : "var(--text-muted)" }}>
              {news ? (sentModel === "llm" ? llmSummary.overall_label : sm.overall_label).toUpperCase() : "Menunggu..."}
            </div>
            <div className="kpi-sub">
              {news ? `Berdasarkan berita terbaru, sentimen pasar saat ini didominasi nilai ${(sentModel === "llm" ? llmSummary.overall_label : sm.overall_label).toLowerCase()}.` : 'Klik "↻ Refresh"'}
            </div>
          </div>

          {/* Card 4: Ringkasan Makro Ekonomi */}
          {(() => {
            let mPos = 0, mNeg = 0;
            if (macroData) {
              if (macroData.IHSG && macroData.IHSG.change_pct > 0) mPos++; else if (macroData.IHSG) mNeg++;
              if (macroData.USDIDR && macroData.USDIDR.change_pct <= 0) mPos++; else if (macroData.USDIDR) mNeg++;
              if (macroData.BIRate && macroData.BIRate.change <= 0) mPos++; else if (macroData.BIRate) mNeg++;
              if (macroData.Inflation && macroData.Inflation.change <= 0) mPos++; else if (macroData.Inflation) mNeg++;
              if (macroData.GDP && macroData.GDP.change > 0) mPos++; else if (macroData.GDP) mNeg++;
            }
            const macroStatus = macroData ? (mPos > mNeg ? "KONDUSIF" : "BERISIKO") : "Menunggu...";
            const macroColor = macroData ? (mPos > mNeg ? "var(--green)" : "var(--red)") : "var(--text-muted)";
            const macroDesc = macroData ? `Terdapat ${mPos} dari ${mPos + mNeg} indikator makro ekonomi yang memberikan pengaruh positif.` : "—";

            return (
              <div className="kpi-card kpi-c-amber">
                <div className="kpi-label">Makro Ekonomi</div>
                <div className="kpi-val" style={{ color: macroColor }}>{macroStatus}</div>
                <div className="kpi-sub">{macroDesc}</div>
              </div>
            )
          })()}
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
                  <Line data={chartData} options={chartOptions} plugins={[ovRangeBandPlugin]} />
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
              <div className="card-body">{renderFinalReco(mlPred, groqTech, news, finalReco, finalRecoBusy, fetchFinalReco)}</div>
            </div>
          </div>

          <div className="right-col">
            <div className="card">
              <div className="card-header">
                <div className="card-title">🌐 Sentimen Berita</div>
              </div>
              <div className="card-body">{renderSentiment(news, newsErr, newsBusy, aiSummary, sentModel, setSentModel, llmSummary)}</div>
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

function renderMacroCards(d) {
  if (!d) return null
  const cards = [
    { name: "PDB (YoY)", val: (d.GDP?.value || 0) + "%", sig: d.GDP?.change_pct > 0 ? "Naik" : "Turun", desc: "Kuartal Terakhir", small: false },
    { name: "Inflasi (YoY)", val: (d.Inflation?.value || 0) + "%", sig: d.Inflation?.change_pct > 0 ? "Naik" : "Turun", desc: "Bulan Terakhir", small: false },
    { name: "BI Rate", val: (d.BIRate?.value || 0) + "%", sig: d.BIRate?.desc || "Tetap", desc: "Suku Bunga Acuan", small: false },
    { name: "USD/IDR", val: "Rp " + (d.USDIDR?.value?.toLocaleString("id-ID") || 0), sig: d.USDIDR?.change_pct > 0 ? "Melemah" : "Menguat", desc: "Nilai Tukar Rupiah", small: true },
    { name: "IHSG", val: d.IHSG?.value?.toLocaleString("id-ID") || 0, sig: d.IHSG?.change_pct > 0 ? "Bullish" : "Bearish", desc: "Indeks Harga Saham", small: true },
  ]

  return cards.map((c, i) => {
    let sigVal = "Netral"
    if (c.name === "USD/IDR") sigVal = c.sig === "Menguat" ? "Beli" : "Jual"
    else if (c.name === "Inflasi (YoY)") sigVal = c.sig === "Turun" ? "Beli" : "Jual"
    else sigVal = (c.sig === "Naik" || c.sig === "Bullish") ? "Beli" : (c.sig === "Tetap" ? "Netral" : "Jual")

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
        <div className="pred-src-row"><span className="pred-src-k">Confidence</span><span className="pred-src-v">{Math.round((grok.confidence || 0) * 100) + "%"}</span></div>
        <div className="pred-src-row"><span className="pred-src-k">Rekomendasi</span><span className="pred-src-v" style={grokRecStyle}>{recLabel(grok.recommendation || "HOLD")}</span></div>
        {[
          { lbl: "H+1", price: grok.price_tomorrow, lo: grok.price_tomorrow_low, hi: grok.price_tomorrow_high },
          { lbl: "H+2", price: grok.day2_price, lo: grok.day2_low, hi: grok.day2_high },
          { lbl: "H+3", price: grok.day3_price, lo: grok.day3_low, hi: grok.day3_high },
        ].filter(r => r.price).map((r, i) => {
          let cColor = "var(--text-primary)";
          if (info && info.current_price) {
            cColor = r.price >= info.current_price ? "var(--green)" : "var(--red)";
          }
          return (
            <div className="pred-src-row" key={i}>
              <span className="pred-src-k">{r.lbl}</span>
              <span className="pred-src-v" style={{ color: cColor }}>
                {fmt(r.price)}&nbsp;
                {r.lo && r.hi ? <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 9 }}>({fmt(r.lo)}–{fmt(r.hi)})</span> : null}
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
            </div>
          ) : null}
        </div>
      </div>,
    )
  })
  return cells
}

function renderFinalReco(ml, grok, news, apiRes, busy, onGenerate) {
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
            { icon: "🌍", label: "Makro Ekonomi" },
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
                      <span className="factor-signal-badge" style={{ background: fBg, color: fColor, borderColor: fBorder }}>
                        {sigLabel}
                      </span>
                    </div>
                  </div>
                  <div className="factor-bars">
                    <div className="factor-bar-row">
                      <span className="factor-bar-lbl">Kekuatan</span>
                      <div className="factor-bar-track">
                        <div className="factor-bar-fill" style={{ width: scoreW + "%", background: fColor }} />
                      </div>
                      <span className="factor-bar-pct" style={{ color: fColor }}>{scoreW}</span>
                    </div>
                    <div className="factor-bar-row">
                      <span className="factor-bar-lbl">Bobot</span>
                      <div className="factor-bar-track">
                        <div className="factor-bar-fill" style={{ width: weightW + "%", background: "rgba(167,139,250,0.5)" }} />
                      </div>
                      <span className="factor-bar-pct" style={{ color: "var(--purple)" }}>{weightW}</span>
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

      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--r-sm)", border: "1px solid var(--border-light)", lineHeight: 1.5 }}>
        ℹ️ <strong>Panduan Transaksi:</strong>
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          <li>Mulai membeli saham di kisaran harga <strong>Entry (Beli)</strong>.</li>
          <li>Batasi potensi kerugian dengan menjual jika harga turun menembus <strong>Stop Loss (Batas Rugi)</strong>.</li>
          <li>Ambil keuntungan secara bertahap saat harga naik mencapai <strong>Target 1 (Jual)</strong>.</li>
        </ul>
      </div>
    </>
  )
}

function renderSentiment(news, err, busy, aiSummary, sentModel, setSentModel, llmSummary) {
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

  const s = news.sentiment_summary || {}

  // ─── Render model selector ───
  const renderSelector = () => (
    <div className="tab-group" style={{ marginBottom: 16, display: "flex", justifyContent: "stretch" }}>
      <span
        style={{ flex: 1, textAlign: "center", fontSize: 10, padding: "4px 0" }}
        className={`tab ${sentModel === "compare" ? "active-tab" : ""}`}
        onClick={() => setSentModel("compare")}
      >Overview</span>
      <span
        style={{ flex: 1, textAlign: "center", fontSize: 10, padding: "4px 0" }}
        className={`tab ${sentModel === "finetune" ? "active-tab" : ""}`}
        onClick={() => setSentModel("finetune")}
      >Model (BERT)</span>
      <span
        style={{ flex: 1, textAlign: "center", fontSize: 10, padding: "4px 0" }}
        className={`tab ${sentModel === "llm" ? "active-tab" : ""}`}
        onClick={() => setSentModel("llm")}
      >LLM (Groq)</span>
    </div>
  )

  // ─── Render single model gauges & progress bars ───
  const renderSingleModel = (data, title) => {
    const overallColor = data.overall === "positive" ? "var(--green)" : data.overall === "negative" ? "var(--red)" : "var(--amber)"
    const overallLabel = data.overall === "positive" ? "Positif" : data.overall === "negative" ? "Negatif" : "Netral"
    const circleBg = data.overall === "positive" ? "rgba(45,212,160,0.1)" : data.overall === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)"
    const circleStyle = { background: circleBg, borderColor: overallColor + "40" }
    const numStyle = { color: overallColor }
    const headStyle = { color: overallColor }
    const posFill = { width: (data.positive_pct || 0) + "%", background: "var(--green)" }
    const neuFill = { width: (data.neutral_pct || 0) + "%", background: "var(--amber)" }
    const negFill = { width: (data.negative_pct || 0) + "%", background: "var(--red)" }

    return (
      <>
        <div className="sent-top">
          <div className="sent-circle" style={circleStyle}>
            <span className="sent-num" style={numStyle}>{data.score || "—"}</span>
          </div>
          <div className="sent-info">
            <h4 style={headStyle}>{overallLabel}</h4>
            <p>{(news.total_articles || 0) + ` artikel dianalisis · ${title}`}</p>
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
  const renderComparison = () => {
    const overallColor1 = s.overall === "positive" ? "var(--green)" : s.overall === "negative" ? "var(--red)" : "var(--amber)"
    const overallLabel1 = s.overall === "positive" ? "Positif" : s.overall === "negative" ? "Negatif" : "Netral"
    const circleBg1 = s.overall === "positive" ? "rgba(45,212,160,0.1)" : s.overall === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)"
    const circleStyle1 = { background: circleBg1, borderColor: overallColor1 + "40" }
    const numStyle1 = { color: overallColor1 }

    const overallColor2 = llmSummary.overall === "positive" ? "var(--green)" : llmSummary.overall === "negative" ? "var(--red)" : "var(--amber)"
    const overallLabel2 = llmSummary.overall === "positive" ? "Positif" : llmSummary.overall === "negative" ? "Negatif" : "Netral"
    const circleBg2 = llmSummary.overall === "positive" ? "rgba(45,212,160,0.1)" : llmSummary.overall === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)"
    const circleStyle2 = { background: circleBg2, borderColor: overallColor2 + "40" }
    const numStyle2 = { color: overallColor2 }

    const renderCompareRow = (label, pct1, pct2, color) => (
      <div style={{ marginBottom: 12 }} key={label}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>BERT: {pct1}% vs LLM: {pct2}%</span>
        </div>
        {/* BERT Track */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 8, width: 22, color: "var(--text-muted)", fontWeight: 500 }}>BERT</span>
          <div className="sbar-track" style={{ flex: 1, height: 4 }}><div className="sbar-fill" style={{ width: pct1 + "%", background: color }} /></div>
        </div>
        {/* LLM Track */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, width: 22, color: "var(--text-muted)", fontWeight: 500 }}>LLM</span>
          <div className="sbar-track" style={{ flex: 1, height: 4 }}><div className="sbar-fill" style={{ width: pct2 + "%", background: color }} /></div>
        </div>
      </div>
    )

    return (
      <>
        <div className="sent-top" style={{ display: "flex", justifyContent: "space-around", gap: 10, padding: "10px 0 16px 0", borderBottom: "1px solid var(--border-light)", marginBottom: 14 }}>
          {/* Left: BERT */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div className="sent-circle" style={{ ...circleStyle1, width: 56, height: 56, borderWidth: 1.5 }}>
              <span className="sent-num" style={{ ...numStyle1, fontSize: 16 }}>{s.score || "—"}</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, ...numStyle1 }}>{overallLabel1}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>Model (BERT)</div>
            </div>
          </div>
          {/* Divider */}
          <div style={{ borderLeft: "1px solid var(--border-light)", height: 70, alignSelf: "center" }} />
          {/* Right: LLM */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div className="sent-circle" style={{ ...circleStyle2, width: 56, height: 56, borderWidth: 1.5 }}>
              <span className="sent-num" style={{ ...numStyle2, fontSize: 16 }}>{llmSummary.score || "—"}</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, ...numStyle2 }}>{overallLabel2}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>LLM (Groq)</div>
            </div>
          </div>
        </div>

        {renderCompareRow("Positif", s.positive_pct || 0, llmSummary.positive_pct || 0, "var(--green)")}
        {renderCompareRow("Netral", s.neutral_pct || 0, llmSummary.neutral_pct || 0, "var(--amber)")}
        {renderCompareRow("Negatif", s.negative_pct || 0, llmSummary.negative_pct || 0, "var(--red)")}
      </>
    )
  }

  return (
    <>
      {renderSelector()}

      {sentModel === "compare" && renderComparison()}
      {sentModel === "finetune" && renderSingleModel(s, "Model sentimen BERT")}
      {sentModel === "llm" && renderSingleModel(llmSummary, "Model sentimen LLM")}

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
        {/* Dual score badges */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 52 }}>
          <div className={"eNews-score-badge " + hfMeta.cls}>
            {Math.round((a.score || 0) * 100)}
            <span className="esb-sub">BERT: {hfMeta.short}</span>
          </div>
          <div className={"eNews-score-badge " + llmMeta.cls}>
            {Math.round((a.llm_score || 0) * 100)}
            <span className="esb-sub">LLM: {llmMeta.short}</span>
          </div>
        </div>

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
