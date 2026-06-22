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

// Dummy 7-hari tren sentimen — akan diganti ketika backend menyimpan histori
const TREND_LABELS = ["H-7","H-6","H-5","H-4","H-3","H-2","H-1"]
const TREND_DATA   = [52, 55, 51, 58, 60, 57, 62]

export default function BeritaSentimen() {
  const { currentTicker } = useApp()
  const code = currentTicker.replace(".JK", "")

  const [news,      setNews]      = useState(null)
  const [aiSummary, setAiSummary] = useState("")
  const [busy,      setBusy]      = useState(false)
  const [err,       setErr]       = useState("")
  const [filter,    setFilter]    = useState("all")

  // ─── Fetch pipeline ──────────────────────────────────────────────────────
  async function fetchNews() {
    setBusy(true)
    setErr("")
    try {
      // 1. Ambil berita + konten dari backend
      const newsData = await api.getNews(currentTicker, 50)
      if (!newsData.articles || !newsData.articles.length)
        throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.")

      // 2. Kirim ke sentiment dengan category dari news pipeline
      const sentData = await api.predictSentiment(
        currentTicker,
        newsData.articles.map((a) => ({
          title:    a.title,
          content:  a.content || "",
          category: a.category || "market",   // ← kategori dari backend news
        })),
      )

      // 3. Merge hasil sentimen ke artikel
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

      // 4. Ringkasan Groq (fire & forget)
      setAiSummary("Membuat ringkasan AI...")
      api.groqNewsSummary({
        ticker:            currentTicker,
        articles:          merged.map((a) => ({ source: a.source, title: a.title })),
        sentiment_summary: sentData.summary,
      })
        .then((r) => setAiSummary(r.summary || r.main_theme || "Groq tidak memberikan ringkasan."))
        .catch((e) => setAiSummary("Gagal ringkasan Groq: " + e.message))

    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Guard: cegah fetch ganda. React StrictMode (dev) memanggil effect 2x, dan
  // tiap auto-fetch ini memicu sentiment + 2 panggilan Groq yang mahal & boros
  // limit API. Tombol "Ambil Berita" manual tetap memanggil fetchNews langsung.
  const lastFetched = useRef(null)
  useEffect(() => {
    if (!currentTicker) return
    if (lastFetched.current === currentTicker) return
    lastFetched.current = currentTicker
    setNews(null); setAiSummary(""); setErr("")
    fetchNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker])

  // ─── Derived state ────────────────────────────────────────────────────────
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

  const posPct       = summary?.positive_pct ?? 0
  const neuPct       = summary?.neutral_pct  ?? 0
  const negPct       = summary?.negative_pct ?? 0
  const score        = summary?.score        ?? 0
  const overallLabel = summary?.overall_label || "—"

  // ─── Trend chart ─────────────────────────────────────────────────────────
  const trendData = {
    labels: TREND_LABELS,
    datasets: [{
      data:            TREND_DATA,
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

  // ─── Render ───────────────────────────────────────────────────────────────
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

          {/* Left col: AI summary + article list */}
          <div className="col-gap14">
            <div className="ai-summary">
              <div className="ai-tag">✦ Ringkasan AI · Groq</div>
              <div className="ai-text">{aiSummary || (busy ? "Memuat..." : "Tekan 'Ambil Berita' untuk memulai.")}</div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">📰 Berita Terkini — {code}</div>
                <span className="analysis-time">{news ? news.total_articles + " artikel" : ""}</span>
              </div>
              <div className="card-body">

                {/* Filter chips */}
                <div className="nf-bar">
                  {[
                    { key: "all",         label: "Semua" },
                    { key: "market",      label: "Pasar" },
                    { key: "macro",       label: "Makro Ekonomi" },
                    { key: "geopolitics", label: "Geopolitik" },
                  ].map(({ key, label }) => (
                    <span
                      key={key}
                      className={"nf-chip nf-" + key + (filter === key ? " active" : "")}
                      onClick={() => setFilter(key)}
                    >{label}</span>
                  ))}
                </div>

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
              <div className="card-header"><div className="card-title">📈 Tren Sentimen 7 Hari (ilustrasi)</div></div>
              <div className="card-body">
                <div className="chart-wrap" style={St.chart200}>
                  <Line data={trendData} options={trendOpts} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
