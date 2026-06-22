import { useEffect, useState } from "react"
import { Line } from "react-chartjs-2"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const St = {
  chart220: { height: 220 },
  note: { fontSize: 10, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 },
  legendRow: { display: "flex", gap: 14, marginBottom: 10 },
  legItem: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" },
  dotBlue: { width: 10, height: 3, borderRadius: 2, background: "var(--blue)" },
  dotPurple: { width: 10, height: 3, borderRadius: 2, background: "var(--purple)" },
  src: { fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" },
  toolbar: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 4 },
  updatedTxt: { fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" },
}

// Fallback (dipakai hanya bila backend belum mengirim charts).
const GDP_MONTHS = ["Q1'24", "Q2'24", "Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26"]
const GDP_FALLBACK = [5.11, 5.05, 4.95, 5.02, 4.87, 5.12, 5.04, 5.39, 5.61]
const INFL_FALLBACK = [null, null, null, null, null, null, 2.65, 2.92, 3.48]
const BIRATE_FALLBACK = [4.75, 4.75, 4.75, 4.75, 4.75, 4.75, 4.75, 5.25, 5.75]

// ── helpers ──
const nf = (v, d = 0) =>
  Number(v || 0).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d })
const arrow = (v) => (Number(v) > 0 ? "▲" : Number(v) < 0 ? "▼" : "•")
const chgColor = (v) => (Number(v) > 0 ? "var(--green)" : Number(v) < 0 ? "var(--red)" : "var(--text-muted)")

function chgStyleFor(h) {
  const base = { fontSize: 11, fontWeight: 600, marginBottom: 4, fontFamily: "var(--font-mono)" }
  if (h.chg == null || h.mode === "pp") return { ...base, color: "var(--text-muted)" }
  return { ...base, color: chgColor(h.chg) }
}

function chgText(h) {
  if (h.chg == null) return "—"
  const unit = h.mode === "pp" ? " pp" : "%"
  return arrow(h.chg) + " " + nf(Math.abs(h.chg), 2) + unit
}

export default function MakroEkonomi() {
  const [macroData, setMacroData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState("")

  const load = (refresh = false) => {
    setLoading(true)
    api
      .getMacro(refresh)
      .then((d) => {
        setMacroData(d.data)
        setUpdatedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(false)
  }, [])

  const m = macroData || {}

  // ───── HERO: kartu ringkasan indikator ─────
  const hero = [
    {
      label: "IHSG", accent: "mh-blue", mode: "pct",
      val: m.IHSG ? nf(m.IHSG.value) : "—",
      chg: m.IHSG ? m.IHSG.change_pct : null,
      desc: "Indeks Harga Saham Gabungan",
    },
    {
      label: "USD / IDR", accent: "mh-purple", mode: "pct",
      val: m.USDIDR ? "Rp " + nf(m.USDIDR.value) : "—",
      chg: m.USDIDR ? m.USDIDR.change_pct : null,
      desc: "Nilai tukar Rupiah",
    },
    {
      label: "BI Rate", accent: "mh-neu", mode: "pp",
      val: m.BIRate ? Number(m.BIRate.value).toFixed(2) + "%" : "—",
      chg: m.BIRate ? m.BIRate.change : null,
      desc: m.BIRate ? m.BIRate.desc : "Suku bunga acuan",
    },
    {
      label: "Inflasi", accent: "mh-down", mode: "pp",
      val: m.Inflation ? Number(m.Inflation.value).toFixed(2) + "%" : "—",
      chg: m.Inflation ? m.Inflation.change : null,
      desc: m.Inflation ? m.Inflation.desc : "Inflasi tahunan",
    },
    {
      label: "PDB", accent: "mh-up", mode: "pp",
      val: m.GDP ? Number(m.GDP.value).toFixed(2) + "%" : "—",
      chg: m.GDP ? m.GDP.change : null,
      desc: m.GDP ? m.GDP.desc : "Pertumbuhan ekonomi",
    },
  ]

  // ───── CHARTS ─────
  const gdpChart = m.charts ? m.charts.GDP || {} : {}
  const gdpData = {
    labels: gdpChart.labels || GDP_MONTHS,
    datasets: [
      { label: "PDB", data: gdpChart.data || GDP_FALLBACK, borderColor: "#4f9cf9", backgroundColor: "rgba(79,156,249,0.12)", borderWidth: 2, pointRadius: 2.5, pointBackgroundColor: "#4f9cf9", tension: 0.35, fill: true, yAxisID: "y", spanGaps: true },
      { label: "Inflasi", data: gdpChart.inflation || INFL_FALLBACK, borderColor: "#a78bfa", borderWidth: 2, pointRadius: 2.5, pointBackgroundColor: "#a78bfa", borderDash: [4, 3], tension: 0.35, yAxisID: "y", spanGaps: true },
    ],
  }
  const gdpOpts = baseOpts((v) => v + "%")

  const fxChart = m.charts ? m.charts.USDIDR || {} : {}
  const fxData = {
    labels: fxChart.labels || [],
    datasets: [{ data: fxChart.data || [], borderColor: "#2dd4a0", backgroundColor: "rgba(45,212,160,0.12)", borderWidth: 2, pointRadius: 2, pointBackgroundColor: "#2dd4a0", tension: 0.35, fill: true }],
  }
  const fxOpts = baseOpts((v) => nf(v))

  const ihsgChart = m.charts ? m.charts.IHSG || {} : {}
  const ihsgData = {
    labels: ihsgChart.labels || [],
    datasets: [{ data: ihsgChart.data || [], borderColor: "#f5b731", backgroundColor: "rgba(245,183,49,0.12)", borderWidth: 2, pointRadius: 2, pointBackgroundColor: "#f5b731", tension: 0.35, fill: true }],
  }
  const ihsgOpts = baseOpts((v) => nf(v))

  const biRateChart = m.charts ? m.charts.BIRate || {} : {}
  const biRateData = {
    labels: biRateChart.labels || GDP_MONTHS,
    datasets: [{ data: biRateChart.data || BIRATE_FALLBACK, borderColor: "#f55e5e", backgroundColor: "rgba(245,94,94,0.12)", borderWidth: 2, pointRadius: 2.5, pointBackgroundColor: "#f55e5e", tension: 0.1, fill: true, stepped: true }],
  }
  const biRateOpts = baseOpts((v) => Number(v).toFixed(2) + "%")

  const srcLine = (c) =>
    c && c.source ? "Sumber: " + c.source + (c.updated ? " · " + c.updated : "") : ""

  return (
    <>
      <TickerSearchBar label="Makro Ekonomi" />
      <div className="content">
        {/* ── Toolbar refresh ── */}
        <div style={St.toolbar}>
          <span style={St.updatedTxt}>{updatedAt ? "Diperbarui " + updatedAt : ""}</span>
          <button
            className={"fetch-news-btn" + (loading ? " loading" : "")}
            onClick={() => load(true)}
            disabled={loading}
            title="Ambil data terbaru (abaikan cache)"
          >
            <span className="spin-sm" />
            <span className="btn-txt">↻ Refresh</span>
          </button>
        </div>

        {/* ── HERO ── */}
        <div className="macro-hero">
          {hero.map((h) => (
            <div key={h.label} className={"mh-card " + h.accent}>
              <div className="mh-label">{h.label}</div>
              <div className="mh-val">{h.val}</div>
              <div style={chgStyleFor(h)}>{chgText(h)}</div>
              <div className="mh-desc">{h.desc}</div>
            </div>
          ))}
        </div>

        {/* ── ROW 1 ── */}
        <div className="row-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">📈 PDB & Inflasi (YoY)</div>
              <span style={St.src}>{srcLine(m.GDP)}</span>
            </div>
            <div className="card-body">
              <div style={St.legendRow}>
                <div style={St.legItem}><span style={St.dotBlue} /> PDB (kuartalan)</div>
                <div style={St.legItem}><span style={St.dotPurple} /> Inflasi (YoY)</div>
              </div>
              <div className="chart-wrap" style={St.chart220}><Line data={gdpData} options={gdpOpts} /></div>
              <div style={St.note}>Pertumbuhan PDB per kuartal dibandingkan inflasi tahunan di akhir kuartal. Garis putus-putus = inflasi.</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">💱 Kurs USD/IDR (6 Bulan)</div>
              <span style={St.src}>Sumber: Yahoo Finance</span>
            </div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={fxData} options={fxOpts} /></div>
              <div style={St.note}>Pergerakan nilai tukar Rupiah terhadap Dolar AS (harga penutupan akhir bulan).</div>
            </div>
          </div>
        </div>

        {/* ── ROW 2 ── */}
        <div className="row-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">📊 IHSG (6 Bulan)</div>
              <span style={St.src}>Sumber: Yahoo Finance</span>
            </div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={ihsgData} options={ihsgOpts} /></div>
              <div style={St.note}>Kinerja Indeks Harga Saham Gabungan selama 6 bulan terakhir — cermin sentimen pasar.</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">🏦 Suku Bunga Acuan (BI Rate)</div>
              <span style={St.src}>{srcLine(m.BIRate)}</span>
            </div>
            <div className="card-body">
              <div className="chart-wrap" style={St.chart220}><Line data={biRateData} options={biRateOpts} /></div>
              <div style={St.note}>Perubahan BI 7-Day Reverse Repo Rate. Garis bertingkat menandai keputusan Rapat Dewan Gubernur BI.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Opsi chart standar (gaya gelap, sumbu Y custom).
function baseOpts(yCallback) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(17,19,24,0.95)",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        padding: 10,
        titleColor: "#e8eaf0",
        bodyColor: "#b0b7c6",
        cornerRadius: 8,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 10 } } },
      y: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#505568", font: { size: 10 }, callback: yCallback },
      },
    },
  }
}
