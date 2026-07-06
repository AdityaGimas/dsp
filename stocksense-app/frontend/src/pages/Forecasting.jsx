import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Line } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"
import { fmt, DAY_ID, MON_ID, recColor, recLabel } from "../utils/format.js"

// ─── helpers ────────────────────────────────────────────────────
function nextTradingDays(n) {
  const days = []
  let d = new Date()
  while (days.length < n) {
    d = new Date(d.getTime() + 86400000)
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d))
  }
  return days
}

function mockXGB(lastClose) {
  const preds = []
  let p = lastClose || 9400
  const vol = p * 0.012
  for (let i = 0; i < 3; i++) {
    const chg = (Math.random() - 0.43) * vol
    p += chg
    preds.push({
      date: nextTradingDays(3)[i].toISOString().split("T")[0],
      price: Math.round(p),
      price_low: Math.round(p - vol * (1 + i * 0.5)),
      price_high: Math.round(p + vol * (1 + i * 0.5)),
      change_pct: parseFloat(((chg / (p - chg)) * 100).toFixed(2)),
      confidence: parseFloat((0.88 - i * 0.04).toFixed(2)),
    })
  }
  return { model_name: "XGBoost", model_accuracy: 72.5, predictions: preds, recommendation: "HOLD", confidence: 0.72, _mock: true }
}

function mockLLM(lastClose) {
  const p0 = lastClose || 9400
  const vol = p0 * 0.014
  const d = nextTradingDays(3)
  return {
    price_tomorrow: Math.round(p0 + (Math.random() - 0.45) * vol),
    price_tomorrow_low: Math.round(p0 - vol * 1.1),
    price_tomorrow_high: Math.round(p0 + vol * 1.1),
    day2_price: Math.round(p0 + (Math.random() - 0.43) * vol * 1.5),
    day2_low: Math.round(p0 - vol * 1.6),
    day2_high: Math.round(p0 + vol * 1.6),
    day3_price: Math.round(p0 + (Math.random() - 0.4) * vol * 2),
    day3_low: Math.round(p0 - vol * 2.2),
    day3_high: Math.round(p0 + vol * 2.2),
    price_range_3d: { min: Math.round(p0 - vol * 2.5), max: Math.round(p0 + vol * 2.5) },
    recommendation: "HOLD",
    confidence: 0.78,
    reasons: ["RSI menunjukkan momentum netral", "Volume dalam rentang normal", "Trend jangka pendek belum jelas"],
    summary: "Saham dalam konsolidasi. Tunggu konfirmasi arah sebelum masuk posisi.",
    _mock: true,
  }
}

function mockHistory(months = 3) {
  const data = []
  let p = 9300
  const days = months * 22
  for (let i = days; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    p += (Math.random() - 0.45) * 90
    data.push({ date: d.toISOString().split("T")[0], close: Math.round(p) })
  }
  return data
}

// ─── range-band plugin ──────────────────────────────────────────
const rangeBandPlugin = {
  id: "rangeBand",
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart
    if (!chartArea) return
    const xgbDs = chart.data.datasets.find((d) => d._isXgbBand)
    const llmDs = chart.data.datasets.find((d) => d._isLlmBand)
    ;[
      { ds: xgbDs, color: "rgba(45,212,160,0.10)" },
      { ds: llmDs, color: "rgba(167,139,250,0.10)" },
    ].forEach(({ ds, color }) => {
      if (!ds) return
      const bandData = ds._bandData || []
      if (!bandData.length) return
      ctx.save()
      ctx.beginPath()
      ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top)
      ctx.clip()
      ctx.fillStyle = color
      ctx.beginPath()
      bandData.forEach(({ x, low, high }, idx) => {
        const px = scales.x.getPixelForValue(x)
        const yH = scales.y.getPixelForValue(high)
        const yL = scales.y.getPixelForValue(low)
        if (idx === 0) ctx.moveTo(px, yH)
        else ctx.lineTo(px, yH)
      })
      for (let i = bandData.length - 1; i >= 0; i--) {
        const { x, low } = bandData[i]
        const px = scales.x.getPixelForValue(x)
        const yL = scales.y.getPixelForValue(low)
        ctx.lineTo(px, yL)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })
  },
}

// ─── main component ─────────────────────────────────────────────
export default function Forecasting() {
  const { currentTicker } = useApp()
  const code = currentTicker.replace(".JK", "")

  const [hist, setHist] = useState([])
  const [xgbPred, setXgbPred] = useState(null)
  const [llmPred, setLlmPred] = useState(null)
  const [busy, setBusy] = useState(false)
  const [activeModel, setActiveModel] = useState("both") // "xgb" | "llm" | "both"
  const [histPeriod, setHistPeriod] = useState("3mo")
  const [predHistory, setPredHistory] = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const savedRef = useRef("")

  const HIST_PERIODS = [
    { id: "1mo", lbl: "1B" },
    { id: "3mo", lbl: "3B" },
    { id: "6mo", lbl: "6B" },
    { id: "1y", lbl: "1T" },
  ]

  useEffect(() => {
    let alive = true
    setBusy(true)
    setXgbPred(null)
    setLlmPred(null)

    Promise.allSettled([
      api.getHistory(currentTicker, histPeriod),
      api.getPrediction(currentTicker),
    ]).then(([h, p]) => {
      if (!alive) return
      const hd = h.status === "fulfilled" && h.value.data?.length ? h.value.data : mockHistory(3)
      const lastClose = hd.length ? hd[hd.length - 1].close : 9400
      const pd = p.status === "fulfilled" && p.value.predictions?.length ? p.value : mockXGB(lastClose)
      setHist(hd)
      setXgbPred(pd)
      setBusy(false)
    })

    return () => { alive = false }
  }, [currentTicker, histPeriod])

  // After XGB loads, trigger LLM
  useEffect(() => {
    if (!xgbPred) return
    let alive = true

    api.getIndicators(currentTicker).then((ind) => {
      if (!alive || !ind) return
      const lastClose = hist.length ? hist[hist.length - 1].close : 0
      return api.groqTechnical({
        ticker: currentTicker,
        current_price: lastClose,
        indicators: ind,
        ml_prediction: xgbPred,
      })
    }).then((data) => {
      if (!alive) return
      if (data) setLlmPred(data)
    }).catch(() => {
      if (alive) setLlmPred(mockLLM(hist.length ? hist[hist.length - 1].close : 9400))
    })

    return () => { alive = false }
  }, [xgbPred])

  const lastClose = hist.length ? hist[hist.length - 1].close : 0
  const xgbPreds = xgbPred?.predictions || []
  const xgbFinal = xgbPreds[xgbPreds.length - 1]
  const xgbPct = xgbFinal && lastClose ? ((xgbFinal.price - lastClose) / lastClose) * 100 : 0
  const llmFinal3dPrice = llmPred?.day3_price || llmPred?.price_tomorrow || null
  const llmPct = llmFinal3dPrice && lastClose ? ((llmFinal3dPrice - lastClose) / lastClose) * 100 : 0

  // ─── chart data ────────────────────────────────────────────────
  const { chartData, chartOptions } = useMemo(() => {
    const histLabels = hist.map((r) => r.date.slice(5))
    const closes = hist.map((r) => r.close)

    // Determine prediction dates & labels
    const xDays = nextTradingDays(3)
    const predLabels = xDays.map((d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`)
    const histLen = histLabels.length
    const labels = [...histLabels, ...predLabels]

    // Connector value (last historical close)
    const connector = (idx, val) => {
      const arr = Array(labels.length).fill(null)
      if (histLen > 0) arr[histLen - 1] = lastClose
      if (val !== undefined) arr[histLen + idx] = val
      return arr
    }

    const datasets = [
      {
        label: "Historis",
        data: [...closes, ...Array(predLabels.length).fill(null)],
        borderColor: "#4f9cf9",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
        backgroundColor: (c) => {
          if (!c.chart.ctx) return "transparent"
          const g = c.chart.ctx.createLinearGradient(0, 0, 0, 280)
          g.addColorStop(0, "rgba(79,156,249,0.18)")
          g.addColorStop(1, "rgba(79,156,249,0)")
          return g
        },
      },
    ]

    // XGBoost line + band
    if (xgbPreds.length && (activeModel === "xgb" || activeModel === "both")) {
      const xgbLine = Array(labels.length).fill(null)
      xgbLine[histLen - 1] = lastClose
      xgbPreds.forEach((p, i) => { xgbLine[histLen + i] = p.price })

      datasets.push({
        label: "XGBoost",
        data: xgbLine,
        borderColor: "#2dd4a0",
        borderWidth: 2,
        borderDash: [5, 3],
        pointRadius: [
          ...Array(histLen - 1).fill(0),
          4,
          ...xgbPreds.map(() => 5),
        ],
        pointBackgroundColor: "#2dd4a0",
        tension: 0.3,
        fill: false,
        _isXgbBand: true,
        _bandData: xgbPreds.map((p, i) => ({
          x: predLabels[i],
          low: p.price_low,
          high: p.price_high,
        })),
      })
    }

    // LLM line + band
    if (llmPred && (activeModel === "llm" || activeModel === "both")) {
      const llmDayPrices = [
        llmPred.price_tomorrow,
        llmPred.day2_price,
        llmPred.day3_price,
      ].filter(Boolean)
      const llmDayLow = [
        llmPred.price_tomorrow_low,
        llmPred.day2_low,
        llmPred.day3_low,
      ]
      const llmDayHigh = [
        llmPred.price_tomorrow_high,
        llmPred.day2_high,
        llmPred.day3_high,
      ]

      const llmLine = Array(labels.length).fill(null)
      llmLine[histLen - 1] = lastClose
      llmDayPrices.forEach((p, i) => { llmLine[histLen + i] = p })

      datasets.push({
        label: "LLM",
        data: llmLine,
        borderColor: "#a78bfa",
        borderWidth: 2,
        borderDash: [5, 3],
        pointRadius: [
          ...Array(histLen - 1).fill(0),
          4,
          ...llmDayPrices.map(() => 5),
        ],
        pointBackgroundColor: "#a78bfa",
        tension: 0.3,
        fill: false,
        _isLlmBand: true,
        _bandData: llmDayPrices.map((_, i) => ({
          x: predLabels[i],
          low: llmDayLow[i] ?? lastClose * 0.97,
          high: llmDayHigh[i] ?? lastClose * 1.03,
        })),
      })
    }

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        rangeBand: true,
        tooltip: {
          backgroundColor: "#1c2028",
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          titleColor: "#8a8f9e",
          bodyColor: "#e8eaf0",
          padding: 10,
          mode: "index",
          intersect: false,
          callbacks: {
            label: (c) => {
              if (c.parsed.y == null) return null
              return ` ${c.dataset.label}: Rp ${Number(c.parsed.y).toLocaleString("id-ID")}`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: {
            color: "#505568",
            font: { size: 10 },
            maxTicksLimit: histPeriod === "1y" ? 12 : histPeriod === "6mo" ? 10 : 8,
          },
          border: { display: false },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: {
            color: "#505568",
            font: { size: 10 },
            callback: (v) => "Rp " + Number(v).toLocaleString("id-ID"),
          },
          border: { display: false },
        },
      },
      interaction: { mode: "index", intersect: false },
    }

    return { chartData: { labels, datasets }, chartOptions: opts }
  }, [hist, xgbPreds, llmPred, activeModel, histPeriod])

  // LLM days array
  const llmDays = llmPred
    ? [
        { date: xgbPreds[0]?.date, price: llmPred.price_tomorrow, low: llmPred.price_tomorrow_low, high: llmPred.price_tomorrow_high },
        { date: xgbPreds[1]?.date, price: llmPred.day2_price, low: llmPred.day2_low, high: llmPred.day2_high },
        { date: xgbPreds[2]?.date, price: llmPred.day3_price, low: llmPred.day3_low, high: llmPred.day3_high },
      ]
    : []

  // Riwayat & akurasi prediksi
  const loadHistory = () => {
    setHistLoading(true)
    api.getPredictionHistory(currentTicker, 30)
      .then((d) => setPredHistory(d))
      .catch(() => setPredHistory(null))
      .finally(() => setHistLoading(false))
  }

  useEffect(() => {
    setPredHistory(null)
    savedRef.current = ""
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker])

  // Auto-simpan begitu prediksi XGBoost & LLM (asli, bukan mock) siap.
  useEffect(() => {
    if (!xgbPred || !llmPred) return
    if (xgbPred._mock || llmPred._mock) return
    if (!lastClose) return
    const key = currentTicker + ":" + (xgbPreds[0]?.date || "")
    if (savedRef.current === key) return
    savedRef.current = key

    const payload = {
      ticker: currentTicker,
      base_price: lastClose,
      xgb: {
        recommendation: xgbPred.recommendation,
        confidence: xgbPred.confidence,
        model_accuracy: xgbPred.model_accuracy,
        points: xgbPreds.slice(0, 3).map((pt, i) => ({
          horizon: i + 1, date: pt.date, price: pt.price, low: pt.price_low, high: pt.price_high,
        })),
      },
      llm: {
        recommendation: llmPred.recommendation,
        confidence: llmPred.confidence,
        points: llmDays.map((pt, i) => ({
          horizon: i + 1, date: pt.date, price: pt.price, low: pt.low, high: pt.high,
        })),
      },
    }
    api.savePredictionHistory(payload).then(() => loadHistory()).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xgbPred, llmPred, lastClose])

  return (
    <>
      <TickerSearchBar label="Forecasting">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Model:</span>
          <span className="model-pill model-pill-xgb">XGBoost</span>
          <span className="model-pill model-pill-llm">LLM</span>
        </div>
        <button
          className={"fetch-news-btn " + (busy ? "loading" : "")}
          disabled={busy}
          onClick={() => {
            setXgbPred(null); setLlmPred(null)
            setBusy(true)
            Promise.allSettled([api.getHistory(currentTicker, histPeriod, true), api.getPrediction(currentTicker)])
              .then(([h, p]) => {
                const hd = h.status === "fulfilled" && h.value.data?.length ? h.value.data : mockHistory(3)
                const lastC = hd.length ? hd[hd.length - 1].close : 9400
                const pd = p.status === "fulfilled" && p.value.predictions?.length ? p.value : mockXGB(lastC)
                setHist(hd); setXgbPred(pd); setBusy(false)
              })
          }}
        >
          <span className="spin-sm" />
          <span className="btn-txt">{busy ? "Memuat..." : "↻ Refresh"}</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        {/* ── Hero Cards ── */}
        <div className="fc-hero-grid">
          <HeroCard
            color="blue"
            label={`XGBoost — 3 Hari`}
            val={xgbFinal ? fmt(xgbFinal.price) : busy ? "..." : "—"}
            sub={`Rentang: ${xgbFinal ? fmt(xgbPred.predictions[0]?.price_low) + "–" + fmt(xgbFinal.price_high) : "—"}`}
            badge={(xgbPct >= 0 ? "↑ +" : "↓ ") + xgbPct.toFixed(2) + "%"}
            badgeCls={xgbPct >= 0 ? "fh-badge-green" : "fh-badge-red"}
          />
          <HeroCard
            color="purple"
            label={`LLM (Groq) — 3 Hari`}
            val={llmFinal3dPrice ? fmt(llmFinal3dPrice) : llmPred === null && !busy ? "..." : "—"}
            sub={`Rentang: ${llmPred ? fmt(llmPred.price_range_3d?.min) + "–" + fmt(llmPred.price_range_3d?.max) : "—"}`}
            badge={(llmPct >= 0 ? "↑ +" : "↓ ") + llmPct.toFixed(2) + "%"}
            badgeCls={llmPct >= 0 ? "fh-badge-green" : "fh-badge-red"}
          />
          <HeroCard
            color="green"
            label="Akurasi XGBoost"
            val={xgbPred?.model_accuracy ? xgbPred.model_accuracy.toFixed(1) + "%" : "—"}
            sub="Validasi backtest historis"
            badge="Model terlatih 2 tahun"
            badgeCls="fh-badge-green"
          />
          <HeroCard
            color="amber"
            label="Harga Saat Ini"
            val={lastClose ? fmt(lastClose) : "—"}
            sub={`Penutupan terakhir (${code})`}
            badge="Basis prediksi"
            badgeCls="fh-badge-amber"
          />
        </div>

        {/* ── Main Chart ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📈 Proyeksi Harga 3 Hari — {code}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* History period tabs */}
              <div className="tab-group">
                {HIST_PERIODS.map((p) => (
                  <span
                    key={p.id}
                    className={"tab " + (histPeriod === p.id ? "active-tab" : "")}
                    onClick={() => setHistPeriod(p.id)}
                  >{p.lbl}</span>
                ))}
              </div>
              {/* Model toggle */}
              <div className="fc-model-toggle">
                {[
                  { id: "both", lbl: "Keduanya" },
                  { id: "xgb", lbl: "XGBoost" },
                  { id: "llm", lbl: "LLM" },
                ].map((m) => (
                  <button
                    key={m.id}
                    className={"fc-mtog " + (activeModel === m.id ? "fc-mtog-active" : "")}
                    onClick={() => setActiveModel(m.id)}
                  >{m.lbl}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Legend */}
          <div className="chart-legend" style={{ padding: "0 16px 8px" }}>
            <span className="leg-item"><span className="leg-line" style={{ background: "#4f9cf9" }} />Historis</span>
            {(activeModel === "xgb" || activeModel === "both") && (
              <span className="leg-item">
                <span className="leg-line" style={{ background: "#2dd4a0", borderTop: "2px dashed #2dd4a0", height: 0 }} />
                XGBoost ± Rentang
              </span>
            )}
            {(activeModel === "llm" || activeModel === "both") && (
              <span className="leg-item">
                <span className="leg-line" style={{ background: "#a78bfa", borderTop: "2px dashed #a78bfa", height: 0 }} />
                LLM ± Rentang
              </span>
            )}
          </div>
          <div className="card-body">
            <div className="chart-wrap" style={{ height: 300 }}>
              <Line data={chartData} options={chartOptions} plugins={[rangeBandPlugin]} />
            </div>
          </div>
        </div>

        {/* ── 3-Day Comparison Grid ── */}
        <div className="fc-compare-grid">
          {/* XGBoost 3-Day */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">⚡ XGBoost — 3 Hari ke Depan</div>
              <span className="model-pill model-pill-xgb" style={{ fontSize: 10 }}>
                Akurasi {xgbPred?.model_accuracy?.toFixed(1) || "—"}%
              </span>
            </div>
            <div className="card-body">
              {busy && !xgbPred ? (
                <div className="loading-overlay"><span className="spinner" /> Menghitung XGBoost...</div>
              ) : (
                <div className="fc-day-cols">
                  {xgbPreds.slice(0, 3).map((p, i) => (
                    <DayForecastCard
                      key={i}
                      dayNum={i + 1}
                      date={p.date}
                      price={p.price}
                      low={p.price_low}
                      high={p.price_high}
                      changePct={p.change_pct}
                      confidence={p.confidence}
                      color="green"
                      lastClose={lastClose}
                    />
                  ))}
                  {xgbPreds.length === 0 && (
                    <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "16px 0", textAlign: "center", gridColumn: "1/-1" }}>
                      Tidak ada data prediksi
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* LLM 3-Day */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">✦ LLM (Groq) — 3 Hari ke Depan</div>
              <span className="model-pill model-pill-llm" style={{ fontSize: 10 }}>
                Conf {llmPred ? Math.round((llmPred.confidence || 0) * 100) + "%" : "—"}
              </span>
            </div>
            <div className="card-body">
              {!llmPred ? (
                <div className="loading-overlay"><span className="spinner" /> Menganalisis LLM...</div>
              ) : (
                <div className="fc-day-cols">
                  {llmDays.map((p, i) => {
                    const chgPct = p.price && lastClose ? ((p.price - lastClose) / lastClose) * 100 : 0
                    return (
                      <DayForecastCard
                        key={i}
                        dayNum={i + 1}
                        date={p.date}
                        price={p.price}
                        low={p.low}
                        high={p.high}
                        changePct={chgPct}
                        confidence={llmPred.confidence - i * 0.04}
                        color="purple"
                        lastClose={lastClose}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Model Summary + Signals ── */}
        <div className="fc-bottom-grid">
          {/* Agreement panel */}
          <div className="card">
            <div className="card-header"><div className="card-title">🤝 Persetujuan Model</div></div>
            <div className="card-body">
              <ModelAgreement xgb={xgbPred} llm={llmPred} lastClose={lastClose} />
            </div>
          </div>

          {/* LLM Reasons */}
          <div className="card">
            <div className="card-header"><div className="card-title">🔍 Alasan LLM</div></div>
            <div className="card-body">
              {llmPred?.reasons?.length ? (
                <div className="fc-reasons">
                  {llmPred.reasons.map((r, i) => (
                    <div className="fc-reason-item" key={i}>
                      <span className="fc-reason-num">{i + 1}</span>
                      <span className="fc-reason-txt">{r}</span>
                    </div>
                  ))}
                  {llmPred.summary && (
                    <div className="fc-summary-box">
                      <span className="fc-summary-lbl">✦ Ringkasan</span>
                      <span className="fc-summary-txt">{llmPred.summary}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
                  Menunggu analisis LLM...
                </div>
              )}
            </div>
          </div>

          {/* Scenario Table */}
          <div className="card">
            <div className="card-header"><div className="card-title">📊 Skenario 3 Hari</div></div>
            <div className="card-body" style={{ padding: 0 }}>
              <ScenarioTable xgb={xgbPred} llm={llmPred} lastClose={lastClose} />
            </div>
          </div>
        </div>

        {/* Riwayat & Akurasi Prediksi */}
        <PredictionHistory data={predHistory} loading={histLoading} onRefresh={loadHistory} />
      </div>
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function HeroCard({ color, label, val, sub, badge, badgeCls }) {
  const colVar = `var(--${color})`
  return (
    <div className={`fh-card fh-${color}`}>
      <div className="fh-label">{label}</div>
      <div className="fh-val" style={{ color: colVar }}>{val}</div>
      <div className="fh-sub">{sub}</div>
      <div className={`fh-badge ${badgeCls}`}>{badge}</div>
    </div>
  )
}

function DayForecastCard({ dayNum, date, price, low, high, changePct, confidence, color, lastClose }) {
  const up = changePct >= 0
  const col = up ? "var(--green)" : "var(--red)"
  const colVar = `var(--${color})`
  const dt = date ? new Date(date) : null
  const range = high && low ? high - low : 0
  const rangeBarPct = range && price ? Math.round(((price - low) / range) * 100) : 50

  // Price position within range bar
  const fromClose = lastClose && price ? ((price - lastClose) / lastClose) * 100 : 0

  return (
    <div className={"fc-day-card " + (dayNum === 1 ? "fc-day-active" : "")}>
      <div className="fc-day-header">
        <span className="fc-day-num">H+{dayNum}</span>
        {dt && (
          <span className="fc-day-date">
            {DAY_ID[dt.getDay()]}, {dt.getDate()} {MON_ID[dt.getMonth()]}
          </span>
        )}
      </div>

      <div className="fc-day-price" style={{ color: colVar }}>{price ? fmt(price) : "—"}</div>

      <div className="fc-range-labels">
        <span className="fc-range-lo">↓ {low ? fmt(low) : "—"}</span>
        <span className="fc-range-hi">↑ {high ? fmt(high) : "—"}</span>
      </div>

      {/* Range bar */}
      <div className="fc-range-bar">
        <div className="fc-range-track">
          <div className="fc-range-fill" style={{ width: "100%", background: `var(--${color})`, opacity: 0.15 }} />
          <div
            className="fc-range-needle"
            style={{ left: rangeBarPct + "%", background: colVar }}
          />
        </div>
      </div>

      <div className="fc-day-change" style={{ color: col }}>
        {(up ? "+" : "") + changePct.toFixed(2) + "%"}
      </div>
      <div className="fc-conf-pill">
        Conf: {Math.round((confidence || 0) * 100)}%
      </div>

      {fromClose !== 0 && (
        <div className="fc-from-close" style={{ color: fromClose >= 0 ? "var(--green)" : "var(--red)" }}>
          {fromClose >= 0 ? "+" : ""}{fromClose.toFixed(1)}% dari sekarang
        </div>
      )}
    </div>
  )
}

function ModelAgreement({ xgb, llm, lastClose }) {
  if (!xgb) return <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>Menunggu data XGBoost...</div>
  const xgbRec = xgb.recommendation || "HOLD"
  const llmRec = llm?.recommendation || null
  const agree = llmRec && xgbRec === llmRec
  const agreeClass = agree ? "agree" : "disagree"

  return (
    <div className="fc-agree-panel">
      <div className="fc-agree-sources">
        <div className="fc-agree-src">
          <div className="fc-agree-src-lbl">⚡ XGBoost</div>
          <div className="fc-agree-src-rec" style={{ color: recColor(xgbRec) }}>{recLabel(xgbRec)}</div>
          <div className="fc-agree-src-conf">Conf: {Math.round((xgb.confidence || 0) * 100)}%</div>
        </div>
        <div className={"fc-agree-badge " + agreeClass}>
          {!llmRec ? "—" : agree ? "✓ Sepakat" : "✗ Berbeda"}
        </div>
        <div className="fc-agree-src">
          <div className="fc-agree-src-lbl">✦ LLM</div>
          <div className="fc-agree-src-rec" style={{ color: llmRec ? recColor(llmRec) : "var(--text-muted)" }}>
            {llmRec ? recLabel(llmRec) : "—"}
          </div>
          <div className="fc-agree-src-conf">Conf: {llm ? Math.round((llm.confidence || 0) * 100) + "%" : "—"}</div>
        </div>
      </div>
      <div className="fc-agree-desc">
        {!llmRec
          ? "Menganalisis dengan LLM..."
          : agree
          ? `Kedua model sepakat: ${recLabel(xgbRec)} — sinyal lebih kuat.`
          : `XGBoost: ${recLabel(xgbRec)} · LLM: ${recLabel(llmRec)} — pertimbangkan faktor lain.`}
      </div>
    </div>
  )
}

function ScenarioTable({ xgb, llm, lastClose }) {
  const base = lastClose || 0
  const xgbHigh = xgb?.predictions?.[2]?.price_high || (base * 1.05)
  const xgbMid  = xgb?.predictions?.[2]?.price    || (base * 1.015)
  const xgbLow  = xgb?.predictions?.[2]?.price_low  || (base * 0.97)
  const llmHigh = llm?.price_range_3d?.max || llm?.day3_high || (base * 1.06)
  const llmLow  = llm?.price_range_3d?.min || llm?.day3_low  || (base * 0.96)

  const bull  = Math.round((xgbHigh + llmHigh) / 2)
  const mid   = Math.round((xgbMid  + (llm?.day3_price || xgbMid)) / 2)
  const bear  = Math.round((xgbLow  + llmLow)  / 2)

  const bullPct = base ? ((bull - base) / base * 100).toFixed(1) : "0"
  const midPct  = base ? ((mid  - base) / base * 100).toFixed(1) : "0"
  const bearPct = base ? ((bear - base) / base * 100).toFixed(1) : "0"

  return (
    <table className="scen-table">
      <thead>
        <tr>
          <th>Skenario</th>
          <th>Harga Target</th>
          <th>Return</th>
          <th>Probabilitas</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span className="scen-name scen-bull">🐂 Bullish</span></td>
          <td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--green)" }}>Rp {fmt(bull)}</span></td>
          <td><span className="chg-pos">+{bullPct}%</span></td>
          <td>
            <div className="scen-bar-wrap">
              <div style={{ height: 4, borderRadius: 2, background: "rgba(45,212,160,0.15)", flex: 1, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "28%", background: "var(--green)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--green)", width: 28 }}>28%</span>
            </div>
          </td>
        </tr>
        <tr>
          <td><span className="scen-name scen-base">📊 Base</span></td>
          <td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--blue)" }}>Rp {fmt(mid)}</span></td>
          <td><span className={parseFloat(midPct) >= 0 ? "chg-pos" : "chg-neg"}>{parseFloat(midPct) >= 0 ? "+" : ""}{midPct}%</span></td>
          <td>
            <div className="scen-bar-wrap">
              <div style={{ height: 4, borderRadius: 2, background: "rgba(79,156,249,0.15)", flex: 1, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "55%", background: "var(--blue)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--blue)", width: 28 }}>55%</span>
            </div>
          </td>
        </tr>
        <tr>
          <td><span className="scen-name scen-bear">🐻 Bearish</span></td>
          <td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>Rp {fmt(bear)}</span></td>
          <td><span className="chg-neg">{bearPct}%</span></td>
          <td>
            <div className="scen-bar-wrap">
              <div style={{ height: 4, borderRadius: 2, background: "rgba(245,94,94,0.15)", flex: 1, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "17%", background: "var(--red)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--red)", width: 28 }}>17%</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Riwayat & Akurasi Prediksi ────────────────────────
function AccCard({ title, acc, color }) {
  const a = acc || {}
  const hasData = a.count > 0
  return (
    <div className={"fh-card fh-" + color}>
      <div className="fh-label">{title} — Akurasi</div>
      <div className="fh-val fc-hist-accval">{hasData && a.accuracy != null ? a.accuracy.toFixed(1) + "%" : "—"}</div>
      <div className="fh-sub">{hasData ? `MAPE ${a.mape}% · ${a.count} titik dievaluasi` : "Belum ada data aktual untuk dievaluasi"}</div>
      <div className={"fh-badge fh-badge-" + (color === "green" ? "green" : "amber")}>
        {hasData && a.direction_hit_rate != null ? `Arah benar ${a.direction_hit_rate}%` : "Menunggu evaluasi"}
      </div>
    </div>
  )
}

function HistRow({ date, model, pt }) {
  const d = date ? new Date(date) : null
  const td = pt.target_date ? new Date(pt.target_date) : null
  const hasActual = pt.actual_price != null
  const err = pt.error_pct
  const errCls = err == null ? "" : Math.abs(err) <= 2 ? "chg-pos" : "chg-neg"
  return (
    <tr>
      <td>{d ? `${d.getDate()} ${MON_ID[d.getMonth()]}` : "—"}</td>
      <td><span className={"model-pill " + (model === "XGBoost" ? "model-pill-xgb" : "model-pill-llm")}>{model}</span></td>
      <td>{td ? `H+${pt.horizon} · ${td.getDate()} ${MON_ID[td.getMonth()]}` : `H+${pt.horizon}`}</td>
      <td>Rp {fmt(pt.predicted_price)}</td>
      <td>{hasActual ? "Rp " + fmt(pt.actual_price) : <span className="fc-hist-muted">menunggu</span>}</td>
      <td>{err == null ? "—" : <span className={errCls}>{(err >= 0 ? "+" : "") + err.toFixed(2)}%</span>}</td>
      <td>{pt.direction_hit == null ? "—" : pt.direction_hit ? <span className="chg-pos">✓</span> : <span className="chg-neg">✗</span>}</td>
    </tr>
  )
}

function PredictionHistory({ data, loading, onRefresh }) {
  const history = data?.history || []
  const acc = data?.accuracy || {}

  const rows = history.map((h) => ({
    target_date: h.target_date,
    xp: h.xgb,
    lp: h.llm,
  }))
  const pending = history.filter(
    (h) => (!h.xgb || h.xgb.actual_price == null) && (!h.llm || h.llm.actual_price == null)
  )

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">📂 Riwayat & Akurasi Prediksi</div>
        <button className={"fetch-news-btn " + (loading ? "loading" : "")} onClick={onRefresh} disabled={loading}>
          <span className="spin-sm" />
          <span className="btn-txt">{loading ? "Memuat..." : "↻ Muat Ulang"}</span>
        </button>
      </div>
      <div className="card-body">
        <div className="fc-hist-acc">
          <AccCard title="⚡ XGBoost" acc={acc.xgb} color="green" />
          <AccCard title="✦ LLM (Groq)" acc={acc.llm} color="purple" />
        </div>

        {history.length === 0 ? (
          <div className="fc-hist-empty">
            {loading ? "Memuat riwayat..." : "Belum ada riwayat prediksi tersimpan. Prediksi akan otomatis disimpan setiap kali dibuat."}
          </div>
        ) : (
          <>
            <div className="fc-hist-caption">
              Prediksi pertama untuk tiap tanggal (dibuat beberapa hari sebelumnya) vs harga aktual
            </div>
            <div className="fc-hist-table-wrap">
              <table className="scen-table fc-hist-table">
                <thead>
                  <tr>
                    <th>Dibuat</th>
                    <th>Model</th>
                    <th>Target</th>
                    <th>Prediksi</th>
                    <th>Aktual</th>
                    <th>Selisih</th>
                    <th>Arah</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.target_date}>
                      {r.xp && <HistRow date={r.xp.pred_date} model="XGBoost" pt={r.xp} />}
                      {r.lp && <HistRow date={r.lp.pred_date} model="LLM" pt={r.lp} />}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {pending.length > 0 && (
              <div className="fc-hist-pending">
                {pending.length} prediksi menunggu harga aktual (target belum tiba / hari libur bursa).
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
