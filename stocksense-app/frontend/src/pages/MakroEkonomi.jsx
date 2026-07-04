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
  sumLabels: { display: "flex", justifyContent: "space-between", marginTop: 8 },
  green: { fontSize: 11, fontWeight: 500, color: "var(--green)" },
  red: { fontSize: 11, fontWeight: 500, color: "var(--red)" },
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

function fmtFlow(n) {
  const v = Number(n || 0)
  const a = Math.abs(v)
  const s = v < 0 ? "-" : ""
  if (a >= 1e12) return s + "Rp " + (a / 1e12).toFixed(2) + " T"
  if (a >= 1e9) return s + "Rp " + (a / 1e9).toFixed(1) + " M"
  if (a >= 1e6) return s + "Rp " + (a / 1e6).toFixed(0) + " Jt"
  return s + "Rp " + a.toFixed(0)
}

function heroSigWord(sig) {
  return sig > 0 ? "Bullish (positif bagi saham)" : sig < 0 ? "Bearish (negatif bagi saham)" : "Netral"
}

function HeroDetailBox({ title, cls, ch, dir, sub, chips }) {
  return (
    <div className="card hero-detail-card">
      <div className="card-header">
        <div className="card-title">🔍 Detail: {title}</div>
      </div>
      <div className="card-body">
        <div className="kpi-trend makro-ihsg-trend">
          <div className={"kpi-trend-arrow " + cls}>{ch}</div>
          <div className="kpi-trend-main">
            <div className={"kpi-trend-dir " + cls}>{dir}</div>
            <div className="kpi-trend-sub">{sub}</div>
          </div>
          <div className="kpi-trend-chips">
            {chips.map((c, i) => (
              <div className="kpi-chip" key={i}>
                <span className="kpi-chip-k">{c.k}</span>
                <span className={"kpi-chip-v " + (c.cls || "")}>{c.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderHeroDetail(label, m) {
  const cOf = (s) => (s > 0 ? "pos" : s < 0 ? "neg" : "neu")
  const aOf = (s) => (s > 0 ? "▲" : s < 0 ? "▼" : "▬")
  const dirWord = (s) => (s > 0 ? "Bullish" : s < 0 ? "Bearish" : "Netral")
  const fp = (v) => (Number(v || 0) >= 0 ? "+" : "") + Number(v || 0).toFixed(2) + "%"
  const pc = (v) => (Number(v || 0) >= 0 ? "pos" : "neg")

  if (label === "IHSG" || label === "USD / IDR") {
    const key = label === "IHSG" ? "IHSG" : "USDIDR"
    const d = m[key] || {}
    const tr = d.trend
    if (!tr)
      return (
        <HeroDetailBox title={label} cls="neu" ch="▬" dir="Data tren belum tersedia" sub="Tekan Refresh untuk memuat data pasar." chips={[]} />
      )
    const sig = tr.signal || 0
    const sub =
      "Ditentukan dari TREN (bukan gerak 1 hari): posisi harga vs MA20, MA5 vs MA20, dan momentum 1 bulan. Dari 10 hari perdagangan terakhir: " +
      tr.up_days +
      " hari naik, " +
      tr.down_days +
      " hari turun."
    return (
      <HeroDetailBox
        title={label + " — " + heroSigWord(sig)}
        cls={cOf(sig)}
        ch={aOf(sig)}
        dir={"Tren " + tr.direction + " · " + dirWord(sig)}
        sub={sub}
        chips={[
          { k: "1 Minggu", v: fp(tr.week_pct), cls: pc(tr.week_pct) },
          { k: "1 Bulan", v: fp(tr.month_pct), cls: pc(tr.month_pct) },
          { k: "Harga vs MA20", v: tr.ma20 != null ? (Number(d.value) > tr.ma20 ? "Di atas" : "Di bawah") : "—" },
          { k: "MA5 vs MA20", v: tr.ma5 != null && tr.ma20 != null ? (tr.ma5 > tr.ma20 ? "Naik" : "Turun") : "—" },
        ]}
      />
    )
  }

  if (label === "Dana Asing") {
    const ff = m.ForeignFlow
    const fmtT = (v) => {
      const a = Math.abs(Number(v || 0))
      const s = Number(v) < 0 ? "-" : "+"
      if (a >= 1e12) return s + "Rp " + (a / 1e12).toFixed(2) + " T"
      if (a >= 1e9) return s + "Rp " + (a / 1e9).toFixed(1) + " M"
      return s + "Rp " + a.toFixed(0)
    }
    if (!ff)
      return (
        <HeroDetailBox title={label} cls="neu" ch="▬" dir="Data aliran dana asing belum tersedia" sub="Tekan Refresh untuk memuat data IDX." chips={[]} />
      )
    const sig = ff.signal != null ? ff.signal : 0
    const tr = ff.trend
    if (!tr)
      return (
        <HeroDetailBox
          title={label + " — " + heroSigWord(sig)}
          cls={cOf(sig)}
          ch={aOf(sig)}
          dir={sig > 0 ? "Dana asing masuk (inflow)" : sig < 0 ? "Dana asing keluar (outflow)" : "Netral"}
          sub={"Net asing pasar hari terakhir: " + fmtT(ff.net) + ". Data tren beberapa hari belum tersedia."}
          chips={[{ k: "Net terakhir", v: fmtT(ff.net), cls: ff.net >= 0 ? "pos" : "neg" }]}
        />
      )
    const sub =
      "Dinilai dari TREN " +
      tr.days +
      " hari bursa terakhir (bukan 1 hari): " +
      tr.inflow_days +
      " hari dana asing masuk, " +
      tr.outflow_days +
      " hari keluar. Net beli asing = permintaan naik → positif bagi saham; net jual → negatif."
    return (
      <HeroDetailBox
        title={label + " — " + heroSigWord(sig)}
        cls={cOf(sig)}
        ch={aOf(sig)}
        dir={"Tren " + (tr.direction === "inflow" ? "inflow (masuk)" : tr.direction === "outflow" ? "outflow (keluar)" : "campuran") + " · " + dirWord(sig)}
        sub={sub}
        chips={[
          { k: "Akumulasi " + tr.days + " hari", v: fmtT(tr.net_sum), cls: tr.net_sum >= 0 ? "pos" : "neg" },
          { k: "Rata-rata/hari", v: fmtT(tr.avg_net), cls: tr.avg_net >= 0 ? "pos" : "neg" },
          { k: "Hari masuk", v: tr.inflow_days + " hari", cls: "pos" },
          { k: "Hari keluar", v: tr.outflow_days + " hari", cls: "neg" },
        ]}
      />
    )
  }

  const keyMap = { "BI Rate": "BIRate", Inflasi: "Inflation", PDB: "GDP" }
  const key = keyMap[label]
  const d = (key && m[key]) || {}
  const sig = d.signal != null ? d.signal : 0
  const tr = d.trend || {}
  const dw = tr.direction === "rising" ? "menaik" : tr.direction === "falling" ? "menurun" : "mendatar"
  const impact =
    key === "GDP"
      ? "PDB menaik = ekonomi menguat → positif bagi saham; menurun = negatif."
      : key === "BIRate"
        ? "BI Rate menurun = likuiditas longgar → positif bagi saham; naik = negatif."
        : "Inflasi menurun = daya beli terjaga → positif bagi saham; naik = negatif."
  const period = label === "PDB" ? "beberapa kuartal terakhir" : "beberapa bulan terakhir"
  const delta = tr.delta != null ? tr.delta : 0
  const sub =
    "Dinilai dari TREN " + period + " (bukan 1 periode). Perubahan " + (delta >= 0 ? "+" : "") + delta + " poin. " + impact
  return (
    <HeroDetailBox
      title={label + " — " + heroSigWord(sig)}
      cls={cOf(sig)}
      ch={aOf(sig)}
      dir={"Tren " + dw + " · " + dirWord(sig)}
      sub={sub}
      chips={[
        { k: "Nilai kini", v: Number(d.value || 0).toFixed(2) + "%" },
        { k: "Sebelumnya", v: d.prev != null ? Number(d.prev).toFixed(2) + "%" : "—" },
        { k: "Perubahan", v: (delta >= 0 ? "+" : "") + delta + " pp", cls: delta > 0 ? "pos" : delta < 0 ? "neg" : "" },
      ]}
    />
  )
}

export default function MakroEkonomi() {
  const [macroData, setMacroData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState("")

  const [aiData, setAiData] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState("")
  const [activeHero, setActiveHero] = useState(null)

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

  const runAI = async () => {
    if (!macroData) return
    setAiBusy(true)
    setAiErr("")
    try {
      const res = await api.groqMacro({ macro_data: macroData })
      setAiData(res)
    } catch (e) {
      setAiErr(e.message)
    } finally {
      setAiBusy(false)
    }
  }

  const m = macroData || {}

  // ───── HERO: kartu ringkasan indikator ─────
  const hero = [
    {
      label: "IHSG", accent: "mh-blue", mode: "pct",
      val: m.IHSG ? nf(m.IHSG.value) : "—",
      chg: m.IHSG ? m.IHSG.change_pct : null,
      desc: "Indeks Harga Saham Gabungan",
      sig: m.IHSG && m.IHSG.trend ? (m.IHSG.trend.signal || 0) : 0
    },
    {
      label: "USD / IDR", accent: "mh-purple", mode: "pct",
      val: m.USDIDR ? "Rp " + nf(m.USDIDR.value) : "—",
      chg: m.USDIDR ? m.USDIDR.change_pct : null,
      desc: "Nilai tukar Rupiah",
      sig: m.USDIDR && m.USDIDR.trend ? (m.USDIDR.trend.signal || 0) : 0
    },
    {
      label: "BI Rate", accent: "mh-neu", mode: "pp",
      val: m.BIRate ? Number(m.BIRate.value).toFixed(2) + "%" : "—",
      chg: m.BIRate ? m.BIRate.change : null,
      desc: m.BIRate ? m.BIRate.desc : "Suku bunga acuan",
      sig: m.BIRate && m.BIRate.signal != null ? m.BIRate.signal : 0
    },
    {
      label: "Inflasi", accent: "mh-down", mode: "pp",
      val: m.Inflation ? Number(m.Inflation.value).toFixed(2) + "%" : "—",
      chg: m.Inflation ? m.Inflation.change : null,
      desc: m.Inflation ? m.Inflation.desc : "Inflasi tahunan",
      sig: m.Inflation && m.Inflation.signal != null ? m.Inflation.signal : 0
    },
    {
      label: "PDB", accent: "mh-up", mode: "pp",
      val: m.GDP ? Number(m.GDP.value).toFixed(2) + "%" : "—",
      chg: m.GDP ? m.GDP.change : null,
      desc: m.GDP ? m.GDP.desc : "Pertumbuhan ekonomi",
      sig: m.GDP && m.GDP.signal != null ? m.GDP.signal : 0
    },
    {
      label: "Dana Asing", accent: "mh-teal", mode: "pct",
      val: m.ForeignFlow ? fmtFlow(m.ForeignFlow.net) : "—",
      chg: null,
      desc: "Aliran dana asing (net, tren 5 hari bursa)",
      sig: m.ForeignFlow && m.ForeignFlow.signal != null ? m.ForeignFlow.signal : 0
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

  let posCount = hero.filter(h => h.sig === 1).length
  let negCount = hero.filter(h => h.sig === -1).length
  let totalCount = posCount + negCount

  const posPct = totalCount ? (posCount / totalCount) * 100 : 50

  const sumPosStyle = { width: posPct + "%", background: "var(--green)" }
  const sumNegStyle = { width: (100 - posPct) + "%", background: "var(--red)" }

  let overallSignal = "NETRAL"
  if (posCount > negCount) overallSignal = "KONDUSIF"
  if (negCount > posCount) overallSignal = "BERISIKO"

  const ovStyle = {
    background: overallSignal === "KONDUSIF" ? "rgba(45,212,160,0.15)" : overallSignal === "BERISIKO" ? "rgba(245,94,94,0.15)" : "rgba(245,183,49,0.15)",
    color: overallSignal === "KONDUSIF" ? "var(--green)" : overallSignal === "BERISIKO" ? "var(--red)" : "var(--amber)",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600
  }

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
            <div key={h.label} className={"mh-card " + h.accent + (activeHero === h.label ? " mh-active" : "")} onClick={() => setActiveHero(activeHero === h.label ? null : h.label)} style={{ position: "relative" }}>
              <div className="mh-label">{h.label}</div>
              <div className="mh-val">{h.val}</div>
              <div style={chgStyleFor(h)}>{chgText(h)}</div>
              <div className="mh-desc">{h.desc}</div>
              {h.sig !== 0 && (
                <div style={{
                  position: "absolute", top: 12, right: 12, fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                  background: h.sig === 1 ? "rgba(45,212,160,0.15)" : "rgba(245,94,94,0.15)",
                  color: h.sig === 1 ? "var(--green)" : "var(--red)"
                }}>
                  {h.sig === 1 ? "KONDUSIF" : "BERISIKO"}
                </div>
              )}
            </div>
          ))}
        </div>

        {activeHero && renderHeroDetail(activeHero, m)}

        {/* ── RINGKASAN SINYAL ── */}
        {m.ForeignFlow ? (
          <div className="card" style={St.ffWrap}>
            <div className="card-header">
              <div className="card-title">🌐 Aliran Dana Asing (Pasar)</div>
              <span style={St.src}>IDX {String.fromCharCode(183)} {m.ForeignFlow.date || "-"}</span>
            </div>
            <div className="card-body">
              <div className="kpi-trend makro-ihsg-trend">
                <div className={"kpi-trend-arrow " + (m.ForeignFlow.net > 0 ? "pos" : m.ForeignFlow.net < 0 ? "neg" : "neu")}>{m.ForeignFlow.net > 0 ? "▲" : m.ForeignFlow.net < 0 ? "▼" : "▬"}</div>
                <div className="kpi-trend-main">
                  <div className={"kpi-trend-dir " + (m.ForeignFlow.net > 0 ? "pos" : m.ForeignFlow.net < 0 ? "neg" : "neu")}>{m.ForeignFlow.status}</div>
                  <div className="kpi-trend-sub">{m.ForeignFlow.net > 0 ? "Dana asing masuk (net buy)" : m.ForeignFlow.net < 0 ? "Dana asing keluar (net sell)" : "Seimbang"}</div>
                </div>
                <div className="kpi-trend-chips">
                  <div className="kpi-chip"><span className="kpi-chip-k">Net Asing</span><span className={"kpi-chip-v " + (m.ForeignFlow.net >= 0 ? "pos" : "neg")}>Rp {(Math.abs(m.ForeignFlow.net || 0) / 1e12).toFixed(2)} T</span></div>
                  <div className="kpi-chip"><span className="kpi-chip-k">Foreign Buy</span><span className="kpi-chip-v">Rp {((m.ForeignFlow.buy || 0) / 1e12).toFixed(2)} T</span></div>
                  <div className="kpi-chip"><span className="kpi-chip-k">Foreign Sell</span><span className="kpi-chip-v">Rp {((m.ForeignFlow.sell || 0) / 1e12).toFixed(2)} T</span></div>
                </div>
              </div>
              <div className="ff-tops">
                <div className="ff-top-col">
                  <div className="ff-top-h pos">Top Net Buy Asing</div>
                  {(m.ForeignFlow.top_buy || []).length ? (m.ForeignFlow.top_buy || []).map((s) => (
                    <div className="ff-top-row" key={"b" + s.code}>
                      <span className="ff-top-code">{s.code}</span>
                      <span className="ff-top-val pos">+Rp {Math.abs(s.net) >= 1e12 ? (Math.abs(s.net) / 1e12).toFixed(2) + " T" : (Math.abs(s.net) / 1e9).toFixed(1) + " M"}</span>
                    </div>
                  )) : <div className="ff-top-empty">Tidak ada data</div>}
                </div>
                <div className="ff-top-col">
                  <div className="ff-top-h neg">Top Net Sell Asing</div>
                  {(m.ForeignFlow.top_sell || []).length ? (m.ForeignFlow.top_sell || []).map((s) => (
                    <div className="ff-top-row" key={"s" + s.code}>
                      <span className="ff-top-code">{s.code}</span>
                      <span className="ff-top-val neg">-Rp {Math.abs(s.net) >= 1e12 ? (Math.abs(s.net) / 1e12).toFixed(2) + " T" : (Math.abs(s.net) / 1e9).toFixed(1) + " M"}</span>
                    </div>
                  )) : <div className="ff-top-empty">Tidak ada data</div>}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="card-title">📊 Ringkasan Sinyal Makro</div>
            <span className="sig-signal" style={ovStyle}>{overallSignal}</span>
          </div>
          <div className="card-body">
            <div className="sum-bar">
              <div className="sum-seg" style={sumPosStyle} />
              <div className="sum-seg" style={sumNegStyle} />
            </div>
            <div style={St.sumLabels}>
              <span style={St.green}>{posCount} indikator Kondusif</span>
              <span style={St.red}>{negCount} indikator Berisiko</span>
            </div>
          </div>
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
              {m.IHSG && m.IHSG.trend ? (
                <div className="kpi-trend makro-ihsg-trend">
                  <div className={"kpi-trend-arrow " + (m.IHSG.trend.direction === "naik" ? "pos" : m.IHSG.trend.direction === "turun" ? "neg" : "neu")}>{m.IHSG.trend.direction === "naik" ? "▲" : m.IHSG.trend.direction === "turun" ? "▼" : "��"}</div>
                  <div className="kpi-trend-main">
                    <div className={"kpi-trend-dir " + (m.IHSG.trend.direction === "naik" ? "pos" : m.IHSG.trend.direction === "turun" ? "neg" : "neu")}>Tren {m.IHSG.trend.direction} · {m.IHSG.trend.signal > 0 ? "Bullish" : m.IHSG.trend.signal < 0 ? "Bearish" : "Netral"}</div>
                    <div className="kpi-trend-sub">Dari 10 hari perdagangan terakhir: {m.IHSG.trend.up_days} hari ditutup naik, {m.IHSG.trend.down_days} hari ditutup turun</div>
                  </div>
                  <div className="kpi-trend-chips">
                    <div className="kpi-chip"><span className="kpi-chip-k">1 Minggu</span><span className={"kpi-chip-v " + ((m.IHSG.trend.week_pct || 0) >= 0 ? "pos" : "neg")}>{((m.IHSG.trend.week_pct || 0) >= 0 ? "+" : "") + (m.IHSG.trend.week_pct || 0).toFixed(2)}%</span></div>
                    <div className="kpi-chip"><span className="kpi-chip-k">1 Bulan</span><span className={"kpi-chip-v " + ((m.IHSG.trend.month_pct || 0) >= 0 ? "pos" : "neg")}>{((m.IHSG.trend.month_pct || 0) >= 0 ? "+" : "") + (m.IHSG.trend.month_pct || 0).toFixed(2)}%</span></div>
                  </div>
                </div>
              ) : null}
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

        {/* ── ANALISIS AI (DETAIL) ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🤖 Analisis AI</div>
          </div>
          <div className="card-body">
            <div className="ai-box" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", padding: 16, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div className="ai-lbl" style={{ color: "var(--purple)", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 0 }}>Groq · Analisis Makro Ekonomi</div>
                <button className={"fetch-news-btn " + (aiBusy ? "loading" : "")} style={{ padding: "6px 12px", minWidth: 160 }} onClick={runAI} disabled={aiBusy || !macroData}>
                  {aiBusy && <span className="spin-sm" style={{ borderTopColor: "var(--purple)" }} />}
                  <span className="btn-txt">{aiBusy ? "Menganalisis..." : "▶ Jalankan Analisis AI"}</span>
                </button>
              </div>
              {aiErr ? (
                <div className="error-msg">{aiErr}</div>
              ) : aiData ? (
                <div style={{ padding: "10px 0 0" }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Dampak Pasar: </span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: aiData.impact_on_market === "Positif" ? "rgba(45,212,160,0.15)" : aiData.impact_on_market === "Negatif" ? "rgba(245,94,94,0.15)" : "rgba(245,183,49,0.15)",
                      color: aiData.impact_on_market === "Positif" ? "var(--green)" : aiData.impact_on_market === "Negatif" ? "var(--red)" : "var(--amber)"
                    }}>
                      {aiData.impact_on_market.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600, lineHeight: 1.6, margin: "0 0 8px" }}>
                    {aiData.summary}
                  </p>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {aiData.detailed_analysis}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>
                  Klik tombol "Jalankan Analisis AI" untuk mendapatkan interpretasi naratif secara kalimat lengkap tentang indikator makro ekonomi saat ini.
                </div>
              )}
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
