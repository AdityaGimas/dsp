import { useEffect, useMemo, useRef, useState } from "react"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

const St = {
  monoGreen:  { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--green)" },
  monoRed:    { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--red)" },
  monoBlue:   { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--blue)" },
  monoAmber:  { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--amber)" },
  chart200:   { height: 200 },
  emptyNote:  { fontSize: 12, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" },
}

const SENT_META = {
  positive: { cls: "esb-pos", label: "Positif", short: "POS" },
  neutral:  { cls: "esb-neu", label: "Netral",  short: "NTR" },
  negative: { cls: "esb-neg", label: "Negatif", short: "NEG" },
}

const CAT_LABELS = {
  market:     "📈 Pasar",
  macro:      "🏦 Makro Ekonomi",
  geopolitics:"🌍 Geopolitik",
}

const CAT_KEYS = ["all", "market", "macro", "geopolitics"]
const CAT_FILTER_LABELS = {
  all:         "Semua",
  market:      "Pasar",
  macro:       "Makro Ekonomi",
  geopolitics: "Geopolitik",
}

// Dummy 7-hari tren sentimen
const TREND_LABELS = ["H-7","H-6","H-5","H-4","H-3","H-2","H-1"]
const TREND_DATA   = [52, 55, 51, 58, 60, 57, 62]

export default function BeritaSentimen() {
  const { currentTicker } = useApp()
  const code = currentTicker.replace(".JK", "")

  const [news,           setNews]           = useState(null)
  const [busy,           setBusy]           = useState(false)
  const [err,            setErr]            = useState("")
  const [filter,         setFilter]         = useState("all")

  // Per-sector AI
  const [sectorAi,       setSectorAi]       = useState({})   // { market: "...", macro: "...", geopolitics: "..." }
  const [sectorAiBusy,   setSectorAiBusy]   = useState({})

  // Overall AI (bottom)
  const [overallAi,      setOverallAi]      = useState("")
  const [overallAiBusy,  setOverallAiBusy]  = useState(false)

  // ─── Fetch pipeline ──────────────────────────────────────────────────────
  async function fetchNews() {
    setBusy(true)
    setErr("")
    setSectorAi({})
    setOverallAi("")
    try {
      const newsData = await api.getNews(currentTicker, 50)
      if (!newsData.articles || !newsData.articles.length)
        throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.")

      const sentData = await api.predictSentiment(
        currentTicker,
        newsData.articles.map((a) => ({
          title:    a.title,
          content:  a.content || "",
          category: a.category || "market",
        })),
      )

      const merged = newsData.articles.map((a, i) => ({
        ...a,
        category:       sentData.results[i]?.category    || a.category || "market",
        sentiment:      sentData.results[i]?.sentiment   || "neutral",
        sentiment_label:sentData.results[i]?.label       || "Netral",
        score:          sentData.results[i]?.score       ?? 0,
        llm_sentiment:  sentData.results[i]?.llm_sentiment || "neutral",
        llm_label:      sentData.results[i]?.llm_label   || "Netral",
        llm_score:      sentData.results[i]?.llm_score   ?? 0,
      }))

      setNews({ total_articles: sentData.total_articles, articles: merged, summary: sentData.summary })

    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ─── Per-sector AI analysis ────────────────────────────────────────────────
  async function runSectorAi(sector, articlesForSector) {
    if (!articlesForSector.length) return
    setSectorAiBusy(prev => ({ ...prev, [sector]: true }))
    try {
      const res = await api.groqNewsSummary({
        ticker:            currentTicker,
        articles:          articlesForSector.map((a) => ({ source: a.source, title: a.title, content: a.content || "" })),
        sentiment_summary: news?.summary,
        sector_filter:     sector,
      })
      setSectorAi(prev => ({ ...prev, [sector]: res.summary || res.main_theme || "Groq tidak memberikan ringkasan." }))
    } catch (e) {
      setSectorAi(prev => ({ ...prev, [sector]: "Gagal analisis sektor: " + e.message }))
    } finally {
      setSectorAiBusy(prev => ({ ...prev, [sector]: false }))
    }
  }

  // ─── Overall AI analysis (kesimpulan akhir) ───────────────────────────────
  async function runOverallAi() {
    if (!articles.length) return
    setOverallAiBusy(true)
    try {
      const total = articles.length || 1
      const bertPos = articles.filter(a => a.sentiment === "positive").length
      const bertNeg = articles.filter(a => a.sentiment === "negative").length
      const bertNeu = articles.filter(a => a.sentiment === "neutral").length
      const llmPos  = articles.filter(a => a.llm_sentiment === "positive").length
      const llmNeg  = articles.filter(a => a.llm_sentiment === "negative").length
      const llmNeu  = articles.filter(a => a.llm_sentiment === "neutral").length

      const bert_summary = {
        positive_pct: Math.round(bertPos / total * 100),
        neutral_pct:  Math.round(bertNeu / total * 100),
        negative_pct: Math.round(bertNeg / total * 100),
        score:        Math.round(articles.reduce((s, a) => s + (a.score || 0), 0) / total * 100),
      }
      const llm_summary = {
        positive_pct: Math.round(llmPos / total * 100),
        neutral_pct:  Math.round(llmNeu / total * 100),
        negative_pct: Math.round(llmNeg / total * 100),
        score:        Math.round(articles.reduce((s, a) => s + (a.llm_score || 0), 0) / total * 100),
      }

      const res = await api.groqNewsSummary({
        ticker:            currentTicker,
        articles:          articles.map((a) => ({ source: a.source, title: a.title, content: a.content || "" })),
        sentiment_summary: news?.summary,
        bert_summary,
        llm_summary,
        sector_filter:     "all",
      })
      setOverallAi(res.summary || res.main_theme || "Groq tidak memberikan ringkasan.")
    } catch (e) {
      setOverallAi("Gagal analisis keseluruhan: " + e.message)
    } finally {
      setOverallAiBusy(false)
    }
  }

  const lastFetched = useRef(null)
  useEffect(() => {
    if (!currentTicker) return
    if (lastFetched.current === currentTicker) return
    lastFetched.current = currentTicker
    setNews(null); setSectorAi({}); setOverallAi(""); setErr("")
    fetchNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker])

  // ─── Derived state ─────────────────────────────────────────────────────────
  const summary  = news?.summary
  const articles = news?.articles || []

  const categories = useMemo(() => {
    const m = {}
    articles.forEach((a) => { const c = a.category || "market"; m[c] = (m[c] || 0) + 1 })
    const total = articles.length || 1
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name: CAT_LABELS[name] || name, count, pct: Math.round(count / total * 100) }))
  }, [articles])

  const filtered = articles.filter((a) => filter === "all" || (a.category || "market") === filter)

  // Articles per sector (for per-sector AI)
  const articlesBySector = useMemo(() => {
    const r = {}
    for (const k of ["market", "macro", "geopolitics"]) {
      r[k] = articles.filter(a => (a.category || "market") === k)
    }
    return r
  }, [articles])

  const posPct       = summary?.positive_pct ?? 0
  const neuPct       = summary?.neutral_pct  ?? 0
  const negPct       = summary?.negative_pct ?? 0
  const score        = summary?.score        ?? 0
  const overallLabel = summary?.overall_label || "—"

  // Trend range state (3, 7, 14, 30)
  const [trendRange, setTrendRange] = useState(7)

  // ─── Trend chart data calculation ──────────────────────────────────────────
  const chartDataObj = useMemo(() => {
    if (!articles || articles.length === 0) {
       return { labels: [], data: [] }
    }

    // Kelompokkan artikel per tanggal dan hitung total skor sentimennya
    const byDate = {}
    articles.forEach(a => {
      // Prioritaskan skor LLM (jika tidak ada, pakai skor finetune/HF)
      const score = Math.round((a.llm_score !== undefined ? a.llm_score : (a.score || 0)) * 100)
      if (!byDate[a.time]) {
        byDate[a.time] = { sum: 0, count: 0 }
      }
      byDate[a.time].sum += score
      byDate[a.time].count += 1
    })

    // Rata-rata sentimen per hari
    const avgByDate = {}
    for (const d in byDate) {
      avgByDate[d] = byDate[d].sum / byDate[d].count
    }

    // Untuk forward fill, mulai dengan skor tertua yang tersedia, atau 50 jika kosong
    const dates = Object.keys(avgByDate).sort()
    let lastValidScore = dates.length > 0 ? avgByDate[dates[0]] : 50

    const labels = []
    const data = []
    const today = new Date()
    
    // Bangun data deret waktu ke belakang
    for (let i = trendRange - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(today.getDate() - i)
      
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const dStr = `${year}-${month}-${day}`
      
      let label = ""
      if (trendRange <= 7) {
        label = d.toLocaleDateString("id-ID", { weekday: 'short' }) // Sen, Sel, Rab
      } else {
        label = d.toLocaleDateString("id-ID", { day: 'numeric', month: 'short' }) // 12 Jun
      }
      
      labels.push(label)

      // Update last score jika hari ini ada data beritanya
      if (avgByDate[dStr] !== undefined) {
        lastValidScore = avgByDate[dStr]
      }
      data.push(lastValidScore)
    }

    return { labels, data }
  }, [articles, trendRange])

  const trendData = {
    labels: chartDataObj.labels,
    datasets: [{
      data:            chartDataObj.data,
      borderColor:     "#2dd4a0",
      backgroundColor: "rgba(45,212,160,0.12)",
      borderWidth: 1.8,
      pointRadius: 3,
      tension: 0.35,
      fill: true,
    }],
  }
  const trendOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#505568", font: { size: 9 } } },
      y: { min: 0, max: 100, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#505568", font: { size: 9 } } },
    },
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <TickerSearchBar label="Berita &amp; Sentimen">
        <button className={"fetch-news-btn " + (busy ? "loading" : "")} onClick={fetchNews} disabled={busy}>
          <span className="spin-sm" />
          <span className="btn-txt">{busy ? "Memuat berita..." : "↻ Ambil Berita"}</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        {err && <div className="error-msg">{err}</div>}

        {/* ── KPI Cards ── */}
        <div className="sent-hero">
          <div className="sh-card sh-green">
            <div className="kpi-label">Sentimen Positif</div>
            <div style={St.monoGreen}>{posPct}%</div>
            <div className="kpi-sub">{summary ? summary.positive + " artikel" : "—"}</div>
          </div>
          <div className="sh-card sh-amber">
            <div className="kpi-label">Sentimen Netral</div>
            <div style={St.monoAmber}>{neuPct}%</div>
            <div className="kpi-sub">{summary ? summary.neutral + " artikel" : "—"}</div>
          </div>
          <div className="sh-card sh-red">
            <div className="kpi-label">Sentimen Negatif</div>
            <div style={St.monoRed}>{negPct}%</div>
            <div className="kpi-sub">{summary ? summary.negative + " artikel" : "—"}</div>
          </div>
          <div className="sh-card sh-blue">
            <div className="kpi-label">Skor Agregat</div>
            <div style={St.monoBlue}>{score}/100</div>
            <div className="kpi-sub">{overallLabel}</div>
          </div>
        </div>

        {/* ── Main 2-col layout ── */}
        <div className="row-main-320">

          {/* Left col: article list */}
          <div className="col-gap14">
            <div className="card">
              <div className="card-header">
                <div className="card-title">📰 Berita Terkini — {code}</div>
                <span className="analysis-time">{news ? news.total_articles + " artikel" : ""}</span>
              </div>
              <div className="card-body">

                {/* Filter chips */}
                <div className="nf-bar">
                  {CAT_KEYS.map((key) => (
                    <span
                      key={key}
                      className={"nf-chip nf-" + key + (filter === key ? " active" : "")}
                      onClick={() => setFilter(key)}
                    >{CAT_FILTER_LABELS[key]}</span>
                  ))}
                </div>

                {/* ── Per-sector AI Analysis (shown when non-"all" filter selected) ── */}
                {filter !== "all" && news && (
                  <div className="ai-summary" style={{ marginTop: 12, marginBottom: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      <div className="ai-tag" style={{ marginBottom: 0 }}>
                        ✦ Analisis AI · {CAT_FILTER_LABELS[filter]}
                      </div>
                      <button
                        className={"fetch-news-btn " + (sectorAiBusy[filter] ? "loading" : "")}
                        style={{ padding: "4px 10px", fontSize: 11, height: 26, minWidth: 130 }}
                        onClick={() => runSectorAi(filter, articlesBySector[filter] || [])}
                        disabled={sectorAiBusy[filter] || !articlesBySector[filter]?.length}
                      >
                        <span className="spin-sm" style={{ width: 10, height: 10 }} />
                        <span className="btn-txt">{sectorAiBusy[filter] ? "Menganalisis..." : "▶ Analisis Sektor"}</span>
                      </button>
                    </div>
                    <div className="ai-text">
                      {sectorAiBusy[filter]
                        ? "Menganalisis berita sektor ini dengan AI..."
                        : (sectorAi[filter] || `Klik "Analisis Sektor" untuk mendapatkan ringkasan AI khusus berita ${CAT_FILTER_LABELS[filter]}.`)}
                    </div>
                  </div>
                )}

                {busy && <div style={St.emptyNote}>Memuat berita...</div>}
                {!busy && !filtered.length && (
                  <div style={St.emptyNote}>Tidak ada berita untuk filter ini.</div>
                )}

                {filtered.map((a, i) => {
                  const hfMeta  = SENT_META[a.sentiment]      || SENT_META.neutral
                  const llmMeta = SENT_META[a.llm_sentiment]  || SENT_META.neutral
                  return (
                    <div className="eNews-item" key={i}>
                      {/* Dual score badges */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 52 }}>
                        <div className={"eNews-score-badge " + hfMeta.cls}>
                          {Math.round((a.score || 0) * 100)}
                          <span className="esb-sub">HF: {hfMeta.short}</span>
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
                            Finetune: {hfMeta.label} &nbsp;|&nbsp; LLM: {llmMeta.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right col: distributions + trend */}
          <div className="col-gap14">

            {/* Sentiment distribution bar */}
            <div className="card">
              <div className="card-header"><div className="card-title">📊 Distribusi Sentimen</div></div>
              <div className="card-body">
                {[
                  { label: "Positif", pct: posPct, color: "var(--green)" },
                  { label: "Netral",  pct: neuPct, color: "var(--amber)" },
                  { label: "Negatif", pct: negPct, color: "var(--red)" },
                ].map(({ label, pct, color }) => (
                  <div className="sbar-row" key={label}>
                    <span className="sbar-lbl">{label}</span>
                    <div className="sbar-track">
                      <div className="sbar-fill" style={{ width: pct + "%", background: color }} />
                    </div>
                    <span className="sbar-pct">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category distribution */}
            <div className="card">
              <div className="card-header"><div className="card-title">📡 Distribusi Kategori</div></div>
              <div className="card-body">
                {!categories.length && <div style={St.emptyNote}>—</div>}
                {categories.map((s, i) => (
                  <div className="src-row" key={i}>
                    <div className="src-name">{s.name}</div>
                    <div className="src-track">
                      <div className="src-fill" style={{ width: s.pct + "%", background: "var(--blue)" }} />
                    </div>
                    <div className="src-count">{s.count} ({s.pct}%)</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trend chart */}
            <div className="card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="card-title">📈 Tren Sentimen</div>
                <select 
                   value={trendRange} 
                   onChange={(e) => setTrendRange(Number(e.target.value))}
                   style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)", borderRadius: 4, padding: "2px 6px", fontSize: 11, outline: "none", cursor: "pointer" }}
                >
                  <option value={3} style={{background: "var(--bg-dark)"}}>3 Hari</option>
                  <option value={7} style={{background: "var(--bg-dark)"}}>7 Hari</option>
                  <option value={14} style={{background: "var(--bg-dark)"}}>14 Hari</option>
                  <option value={30} style={{background: "var(--bg-dark)"}}>1 Bulan</option>
                </select>
              </div>
              <div className="card-body">
                {chartDataObj.labels.length === 0 ? (
                  <div style={St.emptyNote}>Belum ada data riwayat sentimen.</div>
                ) : (
                  <div className="chart-wrap" style={St.chart200}>
                    <Line data={trendData} options={trendOpts} />
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Kesimpulan Akhir Sentimen (bottom) ── */}
        {news && (() => {
          // Hitung ringkasan BERT & LLM dari artikel yang sudah dianalisis
          const total = articles.length || 1

          // BERT summary
          const bertPos = articles.filter(a => a.sentiment === "positive").length
          const bertNeu = articles.filter(a => a.sentiment === "neutral").length
          const bertNeg = articles.filter(a => a.sentiment === "negative").length
          const bertScoreAvg = Math.round(articles.reduce((s, a) => s + (a.score || 0), 0) / total * 100)
          const bertOverall = bertPos >= bertNeg && bertPos >= bertNeu ? "positive" : bertNeg >= bertPos && bertNeg >= bertNeu ? "negative" : "neutral"
          const bert = {
            overall: bertOverall,
            score: bertScoreAvg,
            positive_pct: Math.round(bertPos / total * 100),
            neutral_pct: Math.round(bertNeu / total * 100),
            negative_pct: Math.round(bertNeg / total * 100),
          }

          // LLM summary
          const llmPos = articles.filter(a => a.llm_sentiment === "positive").length
          const llmNeu = articles.filter(a => a.llm_sentiment === "neutral").length
          const llmNeg = articles.filter(a => a.llm_sentiment === "negative").length
          const llmScoreAvg = Math.round(articles.reduce((s, a) => s + (a.llm_score || 0), 0) / total * 100)
          const llmOverall = llmPos >= llmNeg && llmPos >= llmNeu ? "positive" : llmNeg >= llmPos && llmNeg >= llmNeu ? "negative" : "neutral"
          const llm = {
            overall: llmOverall,
            score: llmScoreAvg,
            positive_pct: Math.round(llmPos / total * 100),
            neutral_pct: Math.round(llmNeu / total * 100),
            negative_pct: Math.round(llmNeg / total * 100),
          }

          // Color helpers
          const clr = (o) => o === "positive" ? "var(--green)" : o === "negative" ? "var(--red)" : "var(--amber)"
          const lbl = (o) => o === "positive" ? "Positif" : o === "negative" ? "Negatif" : "Netral"
          const bgClr = (o) => o === "positive" ? "rgba(45,212,160,0.1)" : o === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)"

          const CompareRow = ({ label, pct1, pct2, color }) => (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>BERT: {pct1}% &nbsp;|&nbsp; LLM: {pct2}%</span>
              </div>
              {/* BERT track */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 8, width: 28, color: "var(--text-muted)", fontWeight: 600 }}>BERT</span>
                <div className="sbar-track" style={{ flex: 1, height: 4 }}>
                  <div className="sbar-fill" style={{ width: pct1 + "%", background: color }} />
                </div>
                <span style={{ fontSize: 10, width: 32, textAlign: "right", color }}>{pct1}%</span>
              </div>
              {/* LLM track */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 8, width: 28, color: "var(--text-muted)", fontWeight: 600 }}>LLM</span>
                <div className="sbar-track" style={{ flex: 1, height: 4, opacity: 0.7 }}>
                  <div className="sbar-fill" style={{ width: pct2 + "%", background: color }} />
                </div>
                <span style={{ fontSize: 10, width: 32, textAlign: "right", color }}>{pct2}%</span>
              </div>
            </div>
          )

          return (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div className="card-title">🤖 Kesimpulan Sentimen — Model BERT &amp; LLM</div>
                <button
                  className={"fetch-news-btn " + (overallAiBusy ? "loading" : "")}
                  style={{ padding: "6px 14px", fontSize: 11, minWidth: 170 }}
                  onClick={runOverallAi}
                  disabled={overallAiBusy || !articles.length}
                >
                  {overallAiBusy && <span className="spin-sm" style={{ borderTopColor: "var(--purple)" }} />}
                  <span className="btn-txt">{overallAiBusy ? "Menganalisis..." : "✦ Analisis Kesimpulan Groq"}</span>
                </button>
              </div>
              <div className="card-body">

                {/* ── Dual score circles ── */}
                <div style={{ display: "flex", justifyContent: "space-around", gap: 10, padding: "10px 0 18px 0", borderBottom: "1px solid var(--border-light)", marginBottom: 16 }}>
                  {/* BERT */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div className="sent-circle" style={{ background: bgClr(bert.overall), borderColor: clr(bert.overall) + "40", width: 60, height: 60, borderWidth: 1.5 }}>
                      <span className="sent-num" style={{ color: clr(bert.overall), fontSize: 17 }}>{bert.score}</span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: clr(bert.overall) }}>{lbl(bert.overall)}</div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>Model (BERT)</div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderLeft: "1px solid var(--border-light)", height: 80, alignSelf: "center" }} />

                  {/* LLM */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div className="sent-circle" style={{ background: bgClr(llm.overall), borderColor: clr(llm.overall) + "40", width: 60, height: 60, borderWidth: 1.5 }}>
                      <span className="sent-num" style={{ color: clr(llm.overall), fontSize: 17 }}>{llm.score}</span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: clr(llm.overall) }}>{lbl(llm.overall)}</div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>LLM (Groq)</div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderLeft: "1px solid var(--border-light)", height: 80, alignSelf: "center" }} />

                  {/* Agreement */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div className="sent-circle" style={{
                      background: bert.overall === llm.overall ? "rgba(45,212,160,0.1)" : "rgba(245,183,49,0.1)",
                      borderColor: bert.overall === llm.overall ? "rgba(45,212,160,0.4)" : "rgba(245,183,49,0.4)",
                      width: 60, height: 60, borderWidth: 1.5
                    }}>
                      <span style={{ fontSize: 22 }}>{bert.overall === llm.overall ? "✓" : "≈"}</span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: bert.overall === llm.overall ? "var(--green)" : "var(--amber)" }}>
                        {bert.overall === llm.overall ? "Sepakat" : "Berbeda"}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>Konsensus</div>
                    </div>
                  </div>
                </div>

                {/* ── Dual progress bars per sentiment ── */}
                <div style={{ marginBottom: 16 }}>
                  <CompareRow label="Positif" pct1={bert.positive_pct} pct2={llm.positive_pct} color="var(--green)" />
                  <CompareRow label="Netral"  pct1={bert.neutral_pct}  pct2={llm.neutral_pct}  color="var(--amber)" />
                  <CompareRow label="Negatif" pct1={bert.negative_pct} pct2={llm.negative_pct} color="var(--red)" />
                </div>

                {/* ── Groq AI text analysis ── */}
                <div className="ai-box" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", padding: 16, borderRadius: 8 }}>
                  <div className="ai-lbl" style={{ color: "var(--purple)", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
                    ✦ Groq · Kesimpulan Analisis Sentimen Berita — {code}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.8 }}>
                    {overallAiBusy
                      ? "Menganalisis seluruh hasil sentimen BERT dan LLM..."
                      : (overallAi || `Klik "✦ Analisis Kesimpulan Groq" untuk mendapatkan ringkasan AI menyeluruh dari hasil sentimen model BERT dan LLM terhadap berita ${code}.`)}
                  </div>
                </div>

              </div>
            </div>
          )
        })()}

      </div>
    </>
  )
}

