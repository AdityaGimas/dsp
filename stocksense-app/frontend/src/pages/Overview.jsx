import { useEffect, useMemo, useState } from "react"
import { Line } from "react-chartjs-2"
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
  kpiGrid: { gridTemplateColumns: "repeat(5,1fr)" },
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

const MOCK_IND = {
  rsi: { value: 52.4, signal: "Netral" },
  macd: { value: 12.5, signal: "Bullish" },
  moving_average: { ma20: 5050, ma50: 4900, golden_cross: true, signal: "Beli" },
  overall: { signal: "Netral", buy_count: 2, total: 4 },
}

function mockHistory(period) {
  const days = { "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365 }[period] || 180
  const data = []
  let p = 5000
  const today = new Date()
  for (let i = days; i >= 0; i--) {
    const d = new Date()
    d.setDate(today.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    p += (Math.random() - 0.47) * 120
    data.push({ date: d.toISOString().split("T")[0], close: Math.round(p) })
  }
  return data
}

function mockPrediction(ticker) {
  const preds = []
  let base = 5000
  const today = new Date()
  const cur = new Date(today)
  let added = 0
  while (added < 6) {
    cur.setDate(cur.getDate() + 1)
    if (cur.getDay() === 0 || cur.getDay() === 6) continue
    const chg = (Math.random() - 0.43) * 0.015
    base = base * (1 + chg)
    preds.push({ date: cur.toISOString().split("T")[0], price: Math.round(base), change_pct: chg * 100, confidence: 0.88 - added * 0.05 })
    added++
  }
  return { ticker, model_name: "Tren", model_accuracy: 72.5, predictions: preds, recommendation: "BUY", confidence: 0.8, stop_loss: 4750, entry: 4950, target: 5350 }
}

export default function Overview() {
  const { currentTicker, groqKey } = useApp()

  const [info, setInfo] = useState(null)
  const [hist, setHist] = useState([])
  const [period, setPeriod] = useState("6mo")
  const [indicators, setIndicators] = useState(null)
  const [mlPred, setMlPred] = useState(null)
  const [groqTech, setGroqTech] = useState(null)
  const [news, setNews] = useState(null)
  const [aiSummary, setAiSummary] = useState("")

  const [groqTechBusy, setGroqTechBusy] = useState(false)
  const [groqTechErr, setGroqTechErr] = useState("")
  const [newsBusy, setNewsBusy] = useState(false)
  const [newsErr, setNewsErr] = useState("")
  const [groqTechTs, setGroqTechTs] = useState(null)
  const [newsTs, setNewsTs] = useState(null)

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
      .then((d) => alive && setIndicators(d && d.rsi ? d : MOCK_IND))
      .catch(() => alive && setIndicators(MOCK_IND))

    setMlPred(null)
    api
      .getPrediction(t)
      .then((d) => {
        if (!alive) return
        setMlPred(d)
        saveCache(t, "ml", d)
      })
      .catch(() => alive && setMlPred(mockPrediction(t)))

    return () => {
      alive = false
    }
  }, [currentTicker])

  useEffect(() => {
    let alive = true
    api
      .getHistory(currentTicker, period)
      .then((d) => alive && setHist(d.data && d.data.length ? d.data : mockHistory(period)))
      .catch(() => alive && setHist(mockHistory(period)))
    return () => {
      alive = false
    }
  }, [currentTicker, period])

  async function runGroqTechnical() {
    if (!indicators) {
      alert("Indikator teknikal belum dimuat. Tunggu sebentar.")
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
        api_key: groqKey || undefined,
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
      const newsData = await api.getNews(currentTicker, 5)
      if (!newsData.articles || !newsData.articles.length)
        throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.")
      const sentData = await api.predictSentiment(
        currentTicker,
        newsData.articles.map((a) => ({ title: a.title, content: a.content || "" })),
      )
      const merged = newsData.articles.map((a, i) => ({
        ...a,
        sentiment: sentData.results[i]?.sentiment || "neutral",
        sentiment_label: sentData.results[i]?.label || "Netral",
      }))
      const ln = {
        total_articles: sentData.total_articles,
        articles: merged,
        sentiment_summary: sentData.summary,
      }
      setNews(ln)
      setNewsTs(Date.now())
      saveCache(currentTicker, "news", ln)

      if (groqKey) {
        setAiSummary("Membuat ringkasan AI...")
        api
          .groqNewsSummary({
            ticker: currentTicker,
            articles: merged.map((a) => ({ source: a.source, title: a.title })),
            sentiment_summary: sentData.summary,
            api_key: groqKey,
          })
          .then((r) => {
            const txt = r.summary || r.main_theme || "Groq tidak memberikan ringkasan."
            setAiSummary(txt)
            saveCache(currentTicker, "groqNewsSummary", txt)
          })
          .catch((e) => setAiSummary("Gagal ringkasan Groq: " + e.message))
      } else {
        setAiSummary("Set Groq API Key → dapatkan ringkasan AI berita.")
      }
    } catch (e) {
      setNewsErr(e.message)
    } finally {
      setNewsBusy(false)
    }
  }

  const chartData = useMemo(() => {
    const histLabels = hist.map((r) => r.date)
    const closes = hist.map((r) => r.close)
    const ma20 = closes.map((_, i) =>
      i < 19 ? null : Math.round(closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20),
    )
    const predDates = (mlPred?.predictions || []).map((p) => p.date)
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
      },
      {
        label: "MA 20",
        data: [...ma20, ...padPred],
        borderColor: "#a78bfa",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
      },
    ]

    if (predDates.length && Number.isFinite(lastClose)) {
      const mlConnector = Array(histLen).fill(null)
      mlConnector[histLen - 1] = lastClose
      datasets.push({
        label: "ML Prediksi",
        data: [...mlConnector, ...mlPred.predictions.map((p) => p.price)],
        borderColor: "#4f9cf9",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 3,
        pointBackgroundColor: "#4f9cf9",
        tension: 0.3,
        fill: false,
      })
      if (groqTech?.price_tomorrow) {
        const gd = Array(labels.length).fill(null)
        gd[histLen - 1] = lastClose
        gd[histLen] = groqTech.price_tomorrow
        datasets.push({
          label: "Groq Prediksi",
          data: gd,
          borderColor: "#a78bfa",
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 3,
          pointBackgroundColor: "#a78bfa",
          tension: 0.3,
          fill: false,
        })
      }
    }
    return { labels, datasets }
  }, [hist, mlPred, groqTech])

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
  const ov = indicators?.overall || {}
  const mlFirst = mlPred?.predictions?.[0]
  const pos = info ? info.change_pct >= 0 : true
  const predSubColor = mlFirst && mlFirst.change_pct >= 0 ? S.green : S.red
  const sentColor =
    sm.overall === "positive" ? S.green : sm.overall === "negative" ? S.red : S.amberTxt
  const grokKpiStyle = groqTech ? { color: recColor(groqTech.recommendation) } : S.purpleTxt
  const sentKpiStyle = news ? sentColor : S.tealTxt
  const signalStyle = ov.signal ? { color: indColor(ov.signal) } : S.greenTxt
  const periods = [
    { id: "1mo", lbl: "1M" },
    { id: "3mo", lbl: "3M" },
    { id: "6mo", lbl: "6M" },
    { id: "1y", lbl: "1Y" },
  ]

  return (
    <>
      <TickerSearchBar label="Pilih Saham" />

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
          <div className="kpi-card kpi-c-blue">
            <div className="kpi-label">Akurasi Model ML</div>
            <div className="kpi-val" style={S.blueTxt}>
              {mlPred?.model_accuracy ? mlPred.model_accuracy.toFixed(1) + "%" : "—"}
            </div>
            <div className="kpi-sub">Model: {mlPred?.model_name || "—"}</div>
          </div>
          <div className="kpi-card kpi-c-blue">
            <div className="kpi-label">Prediksi ML Besok</div>
            <div className="kpi-val" style={S.blueTxt}>{mlFirst ? fmt(mlFirst.price) : "—"}</div>
            <div className="kpi-sub">
              {mlFirst ? (
                <span style={predSubColor}>
                  {(mlFirst.change_pct >= 0 ? "↑" : "↓") + " " + mlFirst.change_pct.toFixed(2) + "%"}
                </span>
              ) : (
                "—"
              )}{" "}
              besok
            </div>
          </div>
          <div className="kpi-card kpi-c-purple">
            <div className="kpi-label">Groq Teknikal</div>
            <div className="kpi-val" style={grokKpiStyle}>
              {groqTech ? recLabel(groqTech.recommendation) : groqTechBusy ? "..." : "—"}
            </div>
            <div className="kpi-sub">
              {groqTech
                ? "Confidence: " + Math.round((groqTech.confidence || 0) * 100) + "%"
                : groqTechErr || "Klik ▶ Analisis Groq"}
            </div>
          </div>
          <div className="kpi-card kpi-c-teal">
            <div className="kpi-label">Sentimen Berita</div>
            <div className="kpi-val" style={sentKpiStyle}>
              {news ? (sm.score || "—") + "/100" : "—"}
            </div>
            <div className="kpi-sub">
              {news ? `${sm.positive || 0} pos / ${sm.neutral || 0} netral / ${sm.negative || 0} neg` : 'Klik "Ambil Berita"'}
            </div>
          </div>
          <div className="kpi-card kpi-c-amber">
            <div className="kpi-label">Sinyal Teknikal</div>
            <div className="kpi-val" style={signalStyle}>{ov.signal || "—"}</div>
            <div className="kpi-sub">{`${ov.buy_count || 0}/${ov.total || 4} indikator mendukung`}</div>
          </div>
        </div>

        <div className="main-grid">
          <div className="left-col">
            <div className="card">
              <div className="card-header">
                <div className="card-title">📈 Harga Historis & Prediksi — {code}</div>
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
              </div>
              <div className="chart-legend">
                <span className="leg-item"><span className="leg-line" style={S.legSolidBlue} />Historis</span>
                <span className="leg-item"><span className="leg-line" style={S.legDashBlue} />ML Prediksi</span>
                <span className="leg-item"><span className="leg-line" style={S.legDashPurple} />Groq Prediksi</span>
                <span className="leg-item"><span className="leg-line" style={S.legSolidPurple} />MA 20</span>
              </div>
              <div className="card-body">
                <div className="chart-wrap">
                  <Line data={chartData} options={chartOptions} />
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

            <div className="card">
              <div className="card-header">
                <div className="card-title">🔮 Prediksi Teknikal — Perbandingan</div>
                <div style={S.rowGap8}>
                  <div className="tab-group">
                    <span className="tab active-tab">7H</span>
                    <span className="tab">14H</span>
                    <span className="tab">30H</span>
                  </div>
                  <button
                    className={"fetch-news-btn " + (groqTechBusy ? "loading" : "")}
                    style={S.groqBtn}
                    onClick={runGroqTechnical}
                    disabled={groqTechBusy}
                  >
                    <span className="spin-sm" style={S.spinPurple} />
                    <span className="btn-txt">{groqTechBusy ? "Menganalisis..." : "▶ Analisis Groq"}</span>
                  </button>
                  <span className="analysis-time">{groqTechTs ? "⏱ " + fmtAge(groqTechTs) : ""}</span>
                </div>
              </div>
              <div className="card-body">
                <div className="dual-pred-grid">{renderDualPred(mlPred, groqTech, groqKey, groqTechBusy)}</div>
                {mlPred && groqTech ? renderAgree(mlPred, groqTech) : null}
                <div className="pred-grid">{renderPredGrid(mlPred, groqTech, info)}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">🎯 Rekomendasi Akhir</div>
              </div>
              <div className="card-body">{renderFinalReco(mlPred, groqTech, news)}</div>
            </div>
          </div>

          <div className="right-col">
            <div className="card">
              <div className="card-header">
                <div className="card-title">🌐 Sentimen Berita</div>
                <div style={S.rowGap6}>
                  <span className="analysis-time">{newsTs ? "⏱ " + fmtAge(newsTs) : ""}</span>
                  <button
                    className={"fetch-news-btn " + (newsBusy ? "loading" : "")}
                    onClick={fetchNews}
                    disabled={newsBusy}
                  >
                    <span className="spin-sm" />
                    <span className="btn-txt">↻ Ambil Berita</span>
                  </button>
                </div>
              </div>
              <div className="card-body">{renderSentiment(news, newsErr, newsBusy, aiSummary, groqKey)}</div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">📰 Berita Terkini</div>
                <span style={S.newsCount}>{news?.articles?.length ? news.articles.length + " artikel" : ""}</span>
              </div>
              <div className="card-body" style={S.newsBodyPad}>{renderNews(news, newsErr)}</div>
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
    { label: "RSI (14)", val: fmt(rsi.value, 1), sig: rsi.signal, pct: ((rsi.value || 0) / 100) * 100 },
    { label: "MACD", val: (macd.value >= 0 ? "+" : "") + fmt(macd.value, 1), sig: macd.signal, pct: 70 },
    { label: "MA 20 / MA 50", val: ma.golden_cross ? "Golden X" : "Death X", sig: ma.signal, pct: ma.golden_cross ? 85 : 30, small: true },
  ]
  return items.map((item, i) => {
    const c = indColor(item.sig)
    const valStyle = item.small ? { color: c, fontSize: 13 } : { color: c }
    const sigStyle = { color: c }
    const fillStyle = { width: item.pct + "%", background: c }
    return (
      <div className="ind-item" key={i}>
        <div className="ind-label">{item.label}</div>
        <div className="ind-val" style={valStyle}>{item.val}</div>
        <div className="ind-sig" style={sigStyle}>{item.sig || "—"}</div>
        <div className="ind-track">
          <div className="ind-fill" style={fillStyle} />
        </div>
      </div>
    )
  })
}

function renderDualPred(ml, grok, groqKey, busy) {
  const mlRecStyle = ml ? { color: recColor(ml.recommendation) } : null
  const grokRecStyle = grok ? { color: recColor(grok.recommendation) } : null
  const reasonsStyle = { marginTop: 6, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }
  const rangeStyle = { background: "rgba(167,139,250,0.12)", color: "var(--purple)" }
  const emptyStyle = { padding: "10px 0", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }

  const mlBody = ml ? (
    <>
      <div className="pred-src-badge badge-ml">⚡ Model ML (FastAPI)</div>
      <div className="pred-src-price">{fmt(ml.predictions?.[0]?.price)}</div>
      <span className={"pred-src-chg " + (ml.predictions?.[0]?.change_pct >= 0 ? "chg-pos-bg" : "chg-neg-bg")}>
        {(ml.predictions?.[0]?.change_pct >= 0 ? "+" : "") + (ml.predictions?.[0]?.change_pct?.toFixed(2) || 0) + "%"}
      </span>
      <div className="pred-src-meta">
        <div className="pred-src-row"><span className="pred-src-k">Akurasi Model</span><span className="pred-src-v">{(ml.model_accuracy?.toFixed(1) || "—") + "%"}</span></div>
        <div className="pred-src-row"><span className="pred-src-k">Confidence</span><span className="pred-src-v">{Math.round((ml.confidence || 0) * 100) + "%"}</span></div>
        <div className="pred-src-row"><span className="pred-src-k">Rekomendasi</span><span className="pred-src-v" style={mlRecStyle}>{recLabel(ml.recommendation || "HOLD")}</span></div>
      </div>
    </>
  ) : (
    <>
      <div className="pred-src-badge badge-ml">⚡ Model ML (FastAPI)</div>
      <div className="loading-overlay" style={pad10}><span className="spinner" /></div>
    </>
  )

  const grokBody = grok ? (
    <>
      <div className="pred-src-badge badge-grok">✦ Groq LLM Teknikal</div>
      <div className="pred-src-price">{fmt(grok.price_tomorrow)}</div>
      <span className="pred-src-chg" style={rangeStyle}>
        {"Range: " + fmt(grok.price_min_5d || grok.price_range_5d?.min) + "–" + fmt(grok.price_max_5d || grok.price_range_5d?.max)}
      </span>
      <div className="pred-src-meta">
        <div className="pred-src-row"><span className="pred-src-k">Confidence</span><span className="pred-src-v">{Math.round((grok.confidence || 0) * 100) + "%"}</span></div>
        <div className="pred-src-row"><span className="pred-src-k">Rekomendasi</span><span className="pred-src-v" style={grokRecStyle}>{recLabel(grok.recommendation || "HOLD")}</span></div>
        <div style={reasonsStyle}>{(grok.reasons || []).map((r, i) => <div key={i}>{"• " + r}</div>)}</div>
      </div>
    </>
  ) : (
    <>
      <div className="pred-src-badge badge-grok">✦ Groq LLM Teknikal</div>
      <div style={emptyStyle}>{busy ? "Menganalisis..." : groqKey ? "Klik ▶ Analisis Groq" : "Set Groq API Key untuk mengaktifkan"}</div>
    </>
  )

  return (
    <>
      <div className="pred-source-card psc-ml">{mlBody}</div>
      <div className="pred-source-card psc-grok">{grokBody}</div>
    </>
  )
}

function renderAgree(ml, grok) {
  const agree = ml.recommendation === grok.recommendation
  const txtStyle = { fontSize: 11 }
  return (
    <div className={"pred-agree" + (agree ? "" : " disagree")}>
      <span className={"agree-dot" + (agree ? "" : " disagree")} />
      <span style={txtStyle}>
        {agree
          ? `Kedua sumber sepakat: ${recLabel(ml.recommendation)} — sinyal lebih kuat`
          : `Sumber berbeda pendapat: ML → ${recLabel(ml.recommendation)}, Groq → ${recLabel(grok.recommendation)} — pertimbangkan dengan hati-hati`}
      </span>
    </div>
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
  ml.predictions.slice(0, 6).forEach((p, i) => {
    const dt = new Date(p.date)
    const up = p.change_pct >= 0
    const chgStyle = { color: up ? "var(--green)" : "var(--red)" }
    cells.push(
      <div className="pred-day" key={i}>
        <div className="pred-date-lbl">{`${DAY_ID[dt.getDay()]} ${dt.getDate()} ${MON_ID[dt.getMonth()]}`}</div>
        <div style={gap} />
        <div className="pred-price">{fmt(p.price)}</div>
        <div className="pred-chg" style={chgStyle}>{(up ? "+" : "") + p.change_pct.toFixed(2) + "%"}</div>
        <div className="pred-conf">{"ML " + Math.round(p.confidence * 100) + "%"}</div>
        {i === 0 && grok ? <div className="pred-grok-price">{"G: " + fmt(grok.price_tomorrow)}</div> : null}
      </div>,
    )
  })
  return cells
}

function renderFinalReco(ml, grok, news) {
  if (!ml) {
    return (
      <div className="loading-overlay">
        <span className="spinner" /> Menunggu prediksi ML...
      </div>
    )
  }
  const scores = { BUY: 1, HOLD: 0, SELL: -1 }
  let totalWeight = 0
  let weighted = 0
  const mlScore = scores[ml.recommendation] || 0
  const mlConf = ml.confidence || 0.5
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
  const finalRec = norm > 0.15 ? "BUY" : norm < -0.15 ? "SELL" : "HOLD"
  const finalConf = Math.round(Math.min(Math.abs(norm) * 100 + 50, 95))
  const curRaw = ml.entry || ml.predictions?.[0]?.price || 0
  const stopLoss = ml.stop_loss || Math.round(curRaw * (finalRec === "BUY" ? 0.95 : 1.05))
  const entry = ml.entry || curRaw
  const target = ml.target || grok?.price_max_5d || grok?.price_range_5d?.max || Math.round(curRaw * (finalRec === "BUY" ? 1.06 : 0.94))
  const dotClass = finalRec === "BUY" ? "buy" : finalRec === "SELL" ? "sell" : "hold"
  const color = recColor(finalRec)
  const colorStyle = { color }
  const redV = { color: "var(--red)" }
  const blueV = { color: "var(--blue)" }
  const greenV = { color: "var(--green)" }
  const summaryStyle = { color: "var(--purple)" }
  const mlActionStyle = { color: recColor(ml.recommendation) }
  const grokActionStyle = { color: grok ? recColor(grok.recommendation) : "var(--text-muted)" }

  const sources = [`ML (${Math.round(mlConf * 100)}%)`]
  if (grok) sources.push(`Groq Teknikal (${Math.round((grok.confidence || 0) * 100)}%)`)
  if (news) sources.push(`Sentimen Berita (${news.sentiment_summary?.score || "—"}/100)`)

  const sentOverall = news?.sentiment_summary?.overall
  const sentAction = news ? (sentOverall === "positive" ? "Positif" : sentOverall === "negative" ? "Negatif" : "Netral") : "—"
  const sentActionStyle = {
    color: news ? recColor(sentOverall === "positive" ? "BUY" : sentOverall === "negative" ? "SELL" : "HOLD") : "var(--text-muted)",
  }

  return (
    <>
      <div className="reco-sources">
        <div className="reco-src-card">
          <div className="reco-src-label">⚡ Model ML</div>
          <div className="reco-src-action" style={mlActionStyle}>{recLabel(ml.recommendation || "HOLD")}</div>
          <div className="reco-src-conf">{"Conf: " + Math.round((ml.confidence || 0) * 100) + "%"}</div>
        </div>
        <div className="reco-src-card">
          <div className="reco-src-label">✦ Groq Teknikal</div>
          <div className="reco-src-action" style={grokActionStyle}>{grok ? recLabel(grok.recommendation) : "—"}</div>
          <div className="reco-src-conf">{grok ? "Conf: " + Math.round((grok.confidence || 0) * 100) + "%" : "Belum dianalisis"}</div>
        </div>
        <div className="reco-src-card">
          <div className="reco-src-label">📰 Sentimen</div>
          <div className="reco-src-action" style={sentActionStyle}>{sentAction}</div>
          <div className="reco-src-conf">{news ? "Skor: " + (news.sentiment_summary?.score || "—") + "/100" : "Klik Ambil Berita"}</div>
        </div>
      </div>
      <div className="reco-divider" />
      <div className="reco-action">
        <div className={"action-dot " + dotClass} />
        <div className="action-label" style={colorStyle}>{recLabel(finalRec)}</div>
        <div className="conf-block">
          <div className="conf-lbl">Tingkat Keyakinan</div>
          <div className="conf-val" style={colorStyle}>{finalConf + "%"}</div>
        </div>
      </div>
      <div className="reco-desc">
        {"Rekomendasi akhir dihitung dari: "}
        <strong>{sources.join(" · ")}</strong>.
        {grok?.summary ? <><br /><em style={summaryStyle}>{`“${grok.summary}”`}</em></> : null}
      </div>
      <div className="reco-levels">
        <div className="lvl-item"><div className="lvl-label">Stop Loss</div><div className="lvl-val" style={redV}>{fmt(stopLoss)}</div></div>
        <div className="lvl-item"><div className="lvl-label">Entry</div><div className="lvl-val" style={blueV}>{fmt(entry)}</div></div>
        <div className="lvl-item"><div className="lvl-label">Target</div><div className="lvl-val" style={greenV}>{fmt(target)}</div></div>
      </div>
    </>
  )
}

function renderSentiment(news, err, busy, aiSummary, groqKey) {
  if (busy && !news) {
    return (
      <div className="loading-overlay">
        <span className="spinner" /> Scraping berita & analisis sentimen...
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
  const overallColor = s.overall === "positive" ? "var(--green)" : s.overall === "negative" ? "var(--red)" : "var(--amber)"
  const overallLabel = s.overall === "positive" ? "Positif" : s.overall === "negative" ? "Negatif" : "Netral"
  const circleBg = s.overall === "positive" ? "rgba(45,212,160,0.1)" : s.overall === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)"
  const circleStyle = { background: circleBg, borderColor: overallColor + "40" }
  const numStyle = { color: overallColor }
  const headStyle = { color: overallColor }
  const posFill = { width: (s.positive_pct || 0) + "%", background: "var(--green)" }
  const neuFill = { width: (s.neutral_pct || 0) + "%", background: "var(--amber)" }
  const negFill = { width: (s.negative_pct || 0) + "%", background: "var(--red)" }
  return (
    <>
      <div className="sent-top">
        <div className="sent-circle" style={circleStyle}>
          <span className="sent-num" style={numStyle}>{s.score || "—"}</span>
        </div>
        <div className="sent-info">
          <h4 style={headStyle}>{overallLabel}</h4>
          <p>{(news.total_articles || 0) + " artikel dianalisis · Model sentimen finetune"}</p>
        </div>
      </div>
      <div className="sbar-row">
        <span className="sbar-lbl">Positif</span>
        <div className="sbar-track"><div className="sbar-fill" style={posFill} /></div>
        <span className="sbar-pct">{(s.positive_pct || 0) + "%"}</span>
      </div>
      <div className="sbar-row">
        <span className="sbar-lbl">Netral</span>
        <div className="sbar-track"><div className="sbar-fill" style={neuFill} /></div>
        <span className="sbar-pct">{(s.neutral_pct || 0) + "%"}</span>
      </div>
      <div className="sbar-row">
        <span className="sbar-lbl">Negatif</span>
        <div className="sbar-track"><div className="sbar-fill" style={negFill} /></div>
        <span className="sbar-pct">{(s.negative_pct || 0) + "%"}</span>
      </div>
      <div className="ai-box">
        <div className="ai-lbl"><span>✦</span> Ringkasan Groq AI</div>
        <span>{aiSummary || (groqKey ? "Membuat ringkasan AI..." : "Set Groq API Key → dapatkan ringkasan AI.")}</span>
      </div>
    </>
  )
}

function renderNews(news, err) {
  if (err && !news) return <div className="error-msg">{"Gagal memuat berita: " + err}</div>
  const articles = news?.articles || []
  if (!articles.length) {
    const def = { color: "var(--text-muted)", fontSize: 12, padding: "12px 0", textAlign: "center" }
    return <div style={def}>Belum ada berita. Klik “↻ Ambil Berita”.</div>
  }
  return articles.map((a, i) => {
    const pillClass = a.sentiment === "positive" ? "sp-pos" : a.sentiment === "negative" ? "sp-neg" : "sp-neu"
    const pillLabel = a.sentiment_label || (a.sentiment === "positive" ? "Positif" : a.sentiment === "negative" ? "Negatif" : "Netral")
    return (
      <div className="news-item" key={i}>
        <div className="news-meta">
          <span className="news-src">{a.source}</span>
          <span className="news-time">{"· " + (a.time || "")}</span>
        </div>
        <div className="news-title-text">
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a>
          ) : (
            a.title
          )}
        </div>
        <span className={"sent-pill " + pillClass}>{"● " + pillLabel}</span>
      </div>
    )
  })
}
