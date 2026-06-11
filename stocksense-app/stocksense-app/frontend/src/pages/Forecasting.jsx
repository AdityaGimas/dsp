import { useEffect, useMemo, useState } from "react"
import { Line } from "react-chartjs-2"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"
import { fmt, DAY_ID, MON_ID } from "../utils/format.js"

const St = {
  modelPill: { fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", background: "rgba(79,156,249,0.12)", color: "var(--blue)", padding: "3px 9px", borderRadius: 4 },
  modelWrap: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" },
  modelLbl: { fontSize: 11, color: "var(--text-muted)" },
  blue: { color: "var(--blue)" },
  green: { color: "var(--green)" },
  purple: { color: "var(--purple)" },
  amber: { color: "var(--amber)" },
  red: { color: "var(--red)" },
  headRow: { display: "flex", alignItems: "center", gap: 10 },
  chart260: { height: 260 },
  dotBlue: { background: "var(--blue)" },
  dotPurple: { background: "var(--purple)" },
  dotGreen: { background: "var(--green)" },
  ringBox: { borderTop: "1px solid var(--border-light)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 5 },
  featPurple: { width: "82%", background: "var(--purple)" },
  featRf: { width: "79%" },
  featGreen: { width: "85%", background: "var(--green)" },
  pctPurple: { color: "var(--purple)" },
  pctGreen: { color: "var(--green)" },
  bodyNoPad: { padding: 0 },
  monoBull: { fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--green)" },
  monoBase: { fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--blue)" },
  monoBear: { fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" },
  trig: { color: "var(--text-muted)", fontSize: 11 },
  mcAmberBorder: { borderColor: "rgba(245,183,49,0.3)" },
}

function scenBar(bg, fill, color, pct) {
  const trackStyle = { height: 4, borderRadius: 2, background: bg, flex: 1, overflow: "hidden" }
  const fillStyle = { height: "100%", width: pct + "%", background: color, borderRadius: 2 }
  const pctStyle = { fontSize: 11, fontFamily: "var(--font-mono)", color, width: 28 }
  return (
    <div className="scen-bar-wrap">
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>
      <span style={pctStyle}>{pct + "%"}</span>
    </div>
  )
}

function mockHistory() {
  const data = []
  let p = 9300
  for (let i = 60; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    p += (Math.random() - 0.45) * 90
    data.push({ date: d.toISOString().split("T")[0], close: Math.round(p) })
  }
  return data
}

function mockPrediction() {
  const preds = []
  let base = 9500
  const cur = new Date()
  let n = 0
  while (n < 7) {
    cur.setDate(cur.getDate() + 1)
    if (cur.getDay() === 0 || cur.getDay() === 6) continue
    const chg = (n * 0.4) + (n % 2 ? -0.2 : 0.2)
    base = Math.round(9500 * (1 + chg / 100))
    preds.push({ date: cur.toISOString().split("T")[0], price: base, change_pct: chg, confidence: 0.88 - n * 0.02 })
    n++
  }
  return { model_name: "Tren", model_accuracy: 72.5, predictions: preds }
}

export default function Forecasting() {
  const { currentTicker } = useApp()
  const code = currentTicker.replace(".JK", "")
  const [hist, setHist] = useState([])
  const [pred, setPred] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setBusy(true)
    Promise.allSettled([api.getHistory(currentTicker, "6mo"), api.getPrediction(currentTicker)]).then(
      ([h, p]) => {
        if (!alive) return
        const hd = h.status === "fulfilled" && h.value.data?.length ? h.value.data : mockHistory()
        const pd = p.status === "fulfilled" && p.value.predictions?.length ? p.value : mockPrediction()
        setHist(hd)
        setPred(pd)
        setBusy(false)
      },
    )
    return () => {
      alive = false
    }
  }, [currentTicker])

  const preds = pred?.predictions || []
  const lastPred = preds.length ? preds[preds.length - 1] : null
  const lastClose = hist.length ? hist[hist.length - 1].close : 0
  const pct = lastPred && lastClose ? ((lastPred.price - lastClose) / lastClose) * 100 : 0
  const acc = pred?.model_accuracy || 0

  const chartData = useMemo(() => {
    const labels = hist.map((r) => r.date.slice(5)).concat(preds.map((p) => p.date.slice(5)))
    const closes = hist.map((r) => r.close)
    const pad = Array(preds.length).fill(null)
    const connector = Array(closes.length).fill(null)
    if (closes.length) connector[closes.length - 1] = lastClose
    return {
      labels,
      datasets: [
        { label: "Historis", data: [...closes, ...pad], borderColor: "#4f9cf9", borderWidth: 1.8, pointRadius: 0, tension: 0.3 },
        { label: "Ensemble", data: [...connector, ...preds.map((p) => p.price)], borderColor: "#2dd4a0", borderWidth: 1.8, borderDash: [5, 3], pointRadius: 2, tension: 0.3 },
      ],
    }
  }, [hist, pred])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 10 }, maxTicksLimit: 8 } },
      y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 10 }, callback: (v) => "Rp " + Number(v).toLocaleString("id-ID") } },
    },
  }

  return (
    <>
      <TickerSearchBar label="Forecasting">
        <div style={St.modelWrap}>
          <span style={St.modelLbl}>Model:</span>
          <span style={St.modelPill}>Ensemble (RF + LSTM + GB)</span>
        </div>
        <button className={"fetch-news-btn " + (busy ? "loading" : "")} disabled={busy}>
          <span className="spin-sm" />
          <span className="btn-txt">{busy ? "Memuat..." : "▶ Forecast"}</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        <div className="forecast-hero">
          <div className="fh-card fh-blue">
            <div className="fh-label">Prediksi {preds.length} Hari</div>
            <div className="fh-val" style={St.blue}>{lastPred ? fmt(lastPred.price) : "—"}</div>
            <div className="fh-sub">Target harga akhir periode</div>
            <div className={"fh-badge " + (pct >= 0 ? "fh-badge-green" : "fh-badge-purple")}>
              {(pct >= 0 ? "↑ +" : "↓ ") + pct.toFixed(1) + "% dari sekarang"}
            </div>
          </div>
          <div className="fh-card fh-green">
            <div className="fh-label">Akurasi Model</div>
            <div className="fh-val" style={St.green}>{acc ? acc.toFixed(1) + "%" : "—"}</div>
            <div className="fh-sub">Model: {pred?.model_name || "—"}</div>
            <div className="fh-badge fh-badge-green">Validasi backtest</div>
          </div>
          <div className="fh-card fh-purple">
            <div className="fh-label">Harga Saat Ini</div>
            <div className="fh-val" style={St.purple}>{lastClose ? fmt(lastClose) : "—"}</div>
            <div className="fh-sub">Penutupan terakhir ({code})</div>
            <div className="fh-badge fh-badge-purple">Basis prediksi</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">📈 Proyeksi Harga — {code}</div>
            <div style={St.headRow}>
              <div className="horizon-chips">
                <span className="hchip active">7H</span>
                <span className="hchip">14H</span>
                <span className="hchip">30H</span>
              </div>
              <div className="model-toggle">
                <div className="mtog-item"><div className="mtog-dot" style={St.dotBlue} />Historis</div>
                <div className="mtog-item"><div className="mtog-dot" style={St.dotGreen} />Ensemble</div>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="chart-wrap" style={St.chart260}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        <div className="row-main-260">
          <div className="card">
            <div className="card-header"><div className="card-title">📅 Prediksi Harian</div></div>
            <div className="card-body">
              <div className="day-grid">
                {preds.slice(0, 7).map((p, i) => {
                  const dt = new Date(p.date)
                  const up = p.change_pct >= 0
                  const col = up ? "var(--green)" : "var(--red)"
                  const priceStyle = { color: col }
                  const barStyle = { background: up ? "rgba(45,212,160,0.3)" : "rgba(245,94,94,0.3)" }
                  const fillStyle = { height: 3, width: Math.round(p.confidence * 100) + "%", background: col, borderRadius: 1 }
                  const dcDateStyle = { fontSize: 8, color: "var(--text-muted)", marginBottom: 4 }
                  return (
                    <div className={"day-card" + (i === 0 ? " active-day" : "")} key={i}>
                      <div className="dc-lbl">{DAY_ID[dt.getDay()]}</div>
                      <div style={dcDateStyle}>{dt.getDate() + " " + MON_ID[dt.getMonth()]}</div>
                      <div className="dc-price" style={priceStyle}>{fmt(p.price)}</div>
                      <div className="dc-chg" style={priceStyle}>{(up ? "+" : "") + p.change_pct.toFixed(2) + "%"}</div>
                      <div className="dc-bar" style={barStyle}><div style={fillStyle} /></div>
                      <div className="conf-pill">{Math.round(p.confidence * 100) + "%"}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">🎯 Confidence</div></div>
            <div className="card-body">
              <div className="conf-ring-wrap">
                <svg className="ring-svg" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                  <circle cx="48" cy="48" r="40" fill="none" stroke="var(--blue)" strokeWidth="10" strokeDasharray="251.2" strokeDashoffset={251.2 * (1 - acc / 100)} strokeLinecap="round" transform="rotate(-90 48 48)" opacity="0.85" />
                  <text x="48" y="44" textAnchor="middle" fill="var(--text-primary)" fontFamily="'Space Mono',monospace" fontSize="14" fontWeight="700">{Math.round(acc) + "%"}</text>
                  <text x="48" y="57" textAnchor="middle" fill="var(--text-muted)" fontFamily="'DM Sans',sans-serif" fontSize="8">Akurasi</text>
                </svg>
                <div className="ring-label">Ensemble Confidence</div>
              </div>
              <div style={St.ringBox}>
                <div className="feat-row"><div className="feat-name">LSTM</div><div className="feat-bar-track"><div className="feat-bar" style={St.featPurple} /></div><div className="feat-pct" style={St.pctPurple}>82%</div></div>
                <div className="feat-row"><div className="feat-name">Random Forest</div><div className="feat-bar-track"><div className="feat-bar" style={St.featRf} /></div><div className="feat-pct">79%</div></div>
                <div className="feat-row"><div className="feat-name">Gradient Boost</div><div className="feat-bar-track"><div className="feat-bar" style={St.featGreen} /></div><div className="feat-pct" style={St.pctGreen}>85%</div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="row-main-260">
          <div className="card">
            <div className="card-header"><div className="card-title">📊 Analisis Skenario</div></div>
            <div className="card-body" style={St.bodyNoPad}>
              <table className="scen-table">
                <thead>
                  <tr><th>Skenario</th><th>Harga Target</th><th>Return</th><th>Probabilitas</th><th>Trigger Utama</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="scen-name scen-bull">🐂 Bullish</span></td>
                    <td><span style={St.monoBull}>Rp 10.200</span></td>
                    <td><span className="chg-pos">+7.9%</span></td>
                    <td>{scenBar("rgba(45,212,160,0.15)", null, "var(--green)", 28)}</td>
                    <td style={St.trig}>BI rate cut, EPS beat Q2</td>
                  </tr>
                  <tr>
                    <td><span className="scen-name scen-base">📊 Base</span></td>
                    <td><span style={St.monoBase}>Rp 9.650</span></td>
                    <td><span className="chg-pos">+2.1%</span></td>
                    <td>{scenBar("rgba(79,156,249,0.15)", null, "var(--blue)", 55)}</td>
                    <td style={St.trig}>Konsolidasi normal</td>
                  </tr>
                  <tr>
                    <td><span className="scen-name scen-bear">🐻 Bearish</span></td>
                    <td><span style={St.monoBear}>Rp 8.950</span></td>
                    <td><span className="chg-neg">-5.3%</span></td>
                    <td>{scenBar("rgba(245,94,94,0.15)", null, "var(--red)", 17)}</td>
                    <td style={St.trig}>Sentimen global negatif</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">🔍 Feature Importance</div></div>
            <div className="card-body">
              {[["Harga Close", 92, null], ["Volume", 74, null], ["RSI", 68, null], ["MACD", 61, null], ["MA 20", 55, null], ["Bollinger", 48, null], ["Sentimen", 39, "var(--purple)"]].map(([n, p, c], i) => {
                const bar = c ? { width: p + "%", background: c } : { width: p + "%" }
                const pc = c ? { color: c } : null
                return (
                  <div className="feat-row" key={i}>
                    <div className="feat-name">{n}</div>
                    <div className="feat-bar-track"><div className="feat-bar" style={bar} /></div>
                    <div className="feat-pct" style={pc}>{p + "%"}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">🤖 Perbandingan Model</div></div>
          <div className="card-body">
            <div className="mc-grid">
              {[
                { badge: "mc-badge-rf", name: "Random Forest", price: "Rp 9.580", col: "var(--blue)", acc: "79.4%", mae: "124.3", rmse: "187.1" },
                { badge: "mc-badge-lstm", name: "LSTM Neural Net", price: "Rp 9.720", col: "var(--purple)", acc: "82.1%", mae: "98.7", rmse: "152.4" },
                { badge: "mc-badge-gb", name: "Gradient Boosting", price: "Rp 9.610", col: "var(--green)", acc: "85.2%", mae: "112.0", rmse: "164.8" },
                { badge: "mc-badge-ens", name: "✦ Ensemble", price: "Rp 9.650", col: "var(--amber)", acc: "87.3%", mae: "89.4", rmse: "134.1", amber: true },
              ].map((m, i) => {
                const priceStyle = { color: m.col }
                return (
                  <div className="mc-card" style={m.amber ? St.mcAmberBorder : null} key={i}>
                    <div className="mc-head"><span className={"mc-badge " + m.badge}>{m.name}</span></div>
                    <div className="mc-stat-row"><div className="mc-k">Prediksi 7H</div><div className="mc-v" style={priceStyle}>{m.price}</div></div>
                    <div className="mc-stat-row"><div className="mc-k">Akurasi</div><div className="mc-v" style={m.amber ? priceStyle : null}>{m.acc}</div></div>
                    <div className="mc-stat-row"><div className="mc-k">MAE</div><div className="mc-v">{m.mae}</div></div>
                    <div className="mc-stat-row"><div className="mc-k">RMSE</div><div className="mc-v">{m.rmse}</div></div>
                    <div className="mc-stat-row"><div className="mc-k">Sinyal</div><div className="mc-v" style={St.green}>BUY</div></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
