import { useEffect, useMemo, useRef, useState } from "react"
import { useApp } from "../context/AppContext.jsx"
import { api } from "../api/client.js"
import TickerSearchBar from "../components/TickerSearchBar.jsx"

const St = {
  monoGreen: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--green)" },
  monoRed: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--red)" },
  monoBlue: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--blue)" },
  monoAmber: { fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--amber)" },
  emptyNote: { fontSize: 12, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" },
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

const CAT_KEYS = ["all", "market", "macro", "geopolitics"]
const CAT_FILTER_LABELS = {
  all: "Semua",
  market: "Pasar",
  macro: "Makro Ekonomi",
  geopolitics: "Geopolitik",
}

const NEWS_COUNT_OPTIONS = [10, 20, 30, 40, 50]

// ─── Helper functions (module-level, not inside component) ────────────────────
function clrO(o) { return o === "positive" ? "var(--green)" : o === "negative" ? "var(--red)" : "var(--amber)" }
function lblO(o) { return o === "positive" ? "Positif" : o === "negative" ? "Negatif" : "Netral" }
function bgClrO(o) { return o === "positive" ? "rgba(45,212,160,0.1)" : o === "negative" ? "rgba(245,94,94,0.1)" : "rgba(245,183,49,0.1)" }

function CompareRow({ label, pct1, pct2, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>BERT: {pct1}% &nbsp;|&nbsp; LLM: {pct2}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 8, width: 28, color: "var(--text-muted)", fontWeight: 600 }}>BERT</span>
        <div className="sbar-track" style={{ flex: 1, height: 4 }}>
          <div className="sbar-fill" style={{ width: pct1 + "%", background: color }} />
        </div>
        <span style={{ fontSize: 10, width: 32, textAlign: "right", color }}>{pct1}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 8, width: 28, color: "var(--text-muted)", fontWeight: 600 }}>LLM</span>
        <div className="sbar-track" style={{ flex: 1, height: 4, opacity: 0.7 }}>
          <div className="sbar-fill" style={{ width: pct2 + "%", background: color }} />
        </div>
        <span style={{ fontSize: 10, width: 32, textAlign: "right", color }}>{pct2}%</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BeritaSentimen() {
  const { currentTicker, newsCache, fetchNewsForTicker } = useApp()
  const code = currentTicker.replace(".JK", "")

  const nc = newsCache[currentTicker] || {}
  const news = nc.data || null
  const busy = nc.busy || false
  const err = nc.err || ""

  const [filter, setFilter] = useState("all")
  const [sectorAi, setSectorAi] = useState({})
  const [sectorAiBusy, setSectorAiBusy] = useState({})
  const [overallAi, setOverallAi] = useState("")
  const [overallAiBusy, setOverallAiBusy] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [newsCountLimit, setNewsCountLimit] = useState(20)
  const [activeModel, setActiveModel] = useState("both") // "bert", "llm", "both"
  const [distModel, setDistModel] = useState("bert") // "bert", "llm"

  // ─── Per-sector AI ──────────────────────────────────────────────────────────
  async function runSectorAi(sector, articlesForSector) {
    if (!articlesForSector.length) return
    setSectorAiBusy(prev => ({ ...prev, [sector]: true }))
    try {
      const res = await api.groqNewsSummary({
        ticker: currentTicker,
        articles: articlesForSector.map((a) => ({ source: a.source, title: a.title, content: a.content || "" })),
        sentiment_summary: news?.summary,
        sector_filter: sector,
      })
      setSectorAi(prev => ({ ...prev, [sector]: res.summary || res.main_theme || "Groq tidak memberikan ringkasan." }))
    } catch (e) {
      setSectorAi(prev => ({ ...prev, [sector]: "Gagal analisis sektor: " + e.message }))
    } finally {
      setSectorAiBusy(prev => ({ ...prev, [sector]: false }))
    }
  }

  // ─── Overall AI (Groq) ──────────────────────────────────────────────────────
  async function runOverallAi() {
    if (!articles.length) return
    setOverallAiBusy(true)
    try {
      const total = articles.length || 1
      const bertPos = articles.filter(a => a.sentiment === "positive").length
      const bertNeg = articles.filter(a => a.sentiment === "negative").length
      const bertNeu = articles.filter(a => a.sentiment === "neutral").length
      const llmPos = articles.filter(a => a.llm_sentiment === "positive").length
      const llmNeg = articles.filter(a => a.llm_sentiment === "negative").length
      const llmNeu = articles.filter(a => a.llm_sentiment === "neutral").length

      const bert_summary = {
        positive_pct: Math.round(bertPos / total * 100),
        neutral_pct: Math.round(bertNeu / total * 100),
        negative_pct: Math.round(bertNeg / total * 100),
        score: Math.round(articles.reduce((s, a) => s + (a.score || 0), 0) / total * 100),
      }
      const llm_summary = {
        positive_pct: Math.round(llmPos / total * 100),
        neutral_pct: Math.round(llmNeu / total * 100),
        negative_pct: Math.round(llmNeg / total * 100),
        score: Math.round(articles.reduce((s, a) => s + (a.llm_score || 0), 0) / total * 100),
      }

      const res = await api.groqNewsSummary({
        ticker: currentTicker,
        articles: articles.map((a) => ({ source: a.source, title: a.title, content: a.content || "" })),
        sentiment_summary: news?.summary,
        bert_summary,
        llm_summary,
        sector_filter: "all",
      })
      setOverallAi(res.summary || res.main_theme || "Groq tidak memberikan ringkasan.")
    } catch (e) {
      setOverallAi("Gagal analisis keseluruhan: " + e.message)
    } finally {
      setOverallAiBusy(false)
    }
  }

  // ─── Auto-fetch on ticker change ─────────────────────────────────────────────
  useEffect(() => {
    if (currentTicker) {
      setSectorAi({})
      setOverallAi("")
      fetchNewsForTicker(currentTicker)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTicker])

  // ─── Derived state ────────────────────────────────────────────────────────
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
  const filteredLimited = filtered.slice(0, newsCountLimit)

  const articlesBySector = useMemo(() => {
    const r = {}
    for (const k of ["all", "market", "macro", "geopolitics"]) {
      r[k] = k === "all" ? articles : articles.filter(a => (a.category || "market") === k)
    }
    return r
  }, [articles])

  // ─── BERT & LLM stats ────────────────────────────────────────────────────────
  const { bertStats, llmStats } = useMemo(() => {
    const total = articles.length || 1
    const bertPos = articles.filter(a => a.sentiment === "positive").length
    const bertNeu = articles.filter(a => a.sentiment === "neutral").length
    const bertNeg = articles.filter(a => a.sentiment === "negative").length
    const bertScore = Math.round(articles.reduce((s, a) => s + (a.score || 0), 0) / total * 100)
    const bertOverall = bertPos >= bertNeg && bertPos >= bertNeu ? "positive" : bertNeg >= bertPos && bertNeg >= bertNeu ? "negative" : "neutral"

    const llmPos = articles.filter(a => a.llm_sentiment === "positive").length
    const llmNeu = articles.filter(a => a.llm_sentiment === "neutral").length
    const llmNeg = articles.filter(a => a.llm_sentiment === "negative").length
    const llmScore = Math.round(articles.reduce((s, a) => s + (a.llm_score || 0), 0) / total * 100)
    const llmOverall = llmPos >= llmNeg && llmPos >= llmNeu ? "positive" : llmNeg >= llmPos && llmNeg >= llmNeu ? "negative" : "neutral"

    return {
      bertStats: { posPct: Math.round(bertPos / total * 100), neuPct: Math.round(bertNeu / total * 100), negPct: Math.round(bertNeg / total * 100), score: bertScore, overall: bertOverall },
      llmStats: { posPct: Math.round(llmPos / total * 100), neuPct: Math.round(llmNeu / total * 100), negPct: Math.round(llmNeg / total * 100), score: llmScore, overall: llmOverall },
    }
  }, [articles])

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <TickerSearchBar label="Berita &amp; Sentimen">
        <button className={"fetch-news-btn " + (busy ? "loading" : "")} onClick={() => { setSectorAi({}); setOverallAi(""); fetchNewsForTicker(currentTicker, true); }} disabled={busy}>
          <span className="spin-sm" />
          <span className="btn-txt">{busy ? "Memuat berita..." : "↻ Ambil Berita"}</span>
        </button>
      </TickerSearchBar>

      <div className="content">
        {err && <div className="error-msg">{err}</div>}

        {/* Model Toggle Selector */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div className="fc-model-toggle" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {[
              { id: "bert", label: "Model BERT" },
              { id: "llm",  label: "Model LLM" },
              { id: "both", label: "Keduanya" },
            ].map((m) => (
              <button
                key={m.id}
                className={"fc-mtog " + (activeModel === m.id ? "fc-mtog-active" : "")}
                onClick={() => setActiveModel(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 4 KPI Cards (BERT & LLM centered) ── */}
        <div className="sent-hero">
          {[
            { label: "Sentimen Positif", cls: "sh-green", styleMono: St.monoGreen, pct1: bertStats.posPct, pct2: llmStats.posPct },
            { label: "Sentimen Netral", cls: "sh-amber", styleMono: St.monoAmber, pct1: bertStats.neuPct, pct2: llmStats.neuPct },
            { label: "Sentimen Negatif", cls: "sh-red", styleMono: St.monoRed, pct1: bertStats.negPct, pct2: llmStats.negPct },
          ].map(({ label, cls, styleMono, pct1, pct2, noPercent }) => (
            <div key={label} className={"sh-card " + cls}>
              <div className="kpi-label">{label}</div>
              {activeModel === "bert" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>BERT</div>
                  <div style={{ ...styleMono, fontSize: 26 }}>{pct1}{noPercent ? "" : "%"}</div>
                </div>
              )}
              {activeModel === "llm" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>LLM</div>
                  <div style={{ ...styleMono, fontSize: 26 }}>{pct2}{noPercent ? "" : "%"}</div>
                </div>
              )}
              {activeModel === "both" && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>BERT</div>
                    <div style={{ ...styleMono, fontSize: 21 }}>{pct1}{noPercent ? "" : "%"}</div>
                  </div>
                  <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.12)" }} />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>LLM</div>
                    <div style={{ ...styleMono, fontSize: 21 }}>{pct2}{noPercent ? "" : "%"}</div>
                  </div>
                </div>
              )}
              <div className="kpi-sub" style={{ marginTop: 8, textAlign: "center" }}>
                {noPercent ? "Skala 0-100" : `Dari ${articles.length} artikel`}
              </div>
            </div>
          ))}
        </div>

        {/* ── Perbandingan Sentimen — Collapsible Dropdown ── */}
        {news && (
          <div className="card" style={{ marginBottom: 20 }}>
            {/* Dropdown header — always visible */}
            <div
              className="card-header"
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() => setCompareOpen(o => !o)}
            >
              <div className="card-title">🤖 Perbandingan Sentimen — Model BERT &amp; LLM</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 10, color: "var(--text-muted)",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 4,
                  padding: "2px 8px",
                }}>
                  {compareOpen ? "Sembunyikan ▲" : "Lihat Detail ▼"}
                </span>
              </div>
            </div>

            {/* Collapsible body */}
            {compareOpen && (
              <div className="card-body" style={{ animation: "fadeInDown 0.2s ease" }}>
                {/* Score circles */}
                <div style={{ display: "flex", justifyContent: "space-around", gap: 10, padding: "10px 0 18px 0", borderBottom: "1px solid var(--border-light)", marginBottom: 16 }}>
                  {[
                    { stats: bertStats, label: "Model (BERT)" },
                    null, // divider
                    { stats: llmStats, label: "LLM (Groq)" },
                    null,
                    { // agreement
                      custom: true,
                      bg: bertStats.overall === llmStats.overall ? "rgba(45,212,160,0.1)" : "rgba(245,183,49,0.1)",
                      bc: bertStats.overall === llmStats.overall ? "rgba(45,212,160,0.4)" : "rgba(245,183,49,0.4)",
                      icon: bertStats.overall === llmStats.overall ? "✓" : "≈",
                      txt: bertStats.overall === llmStats.overall ? "Sepakat" : "Berbeda",
                      txtColor: bertStats.overall === llmStats.overall ? "var(--green)" : "var(--amber)",
                      sub: "Konsensus"
                    }
                  ].map((item, idx) => {
                    if (item === null) return <div key={idx} style={{ borderLeft: "1px solid var(--border-light)", height: 80, alignSelf: "center" }} />
                    if (item.custom) return (
                      <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div className="sent-circle" style={{ background: item.bg, borderColor: item.bc, width: 60, height: 60, borderWidth: 1.5 }}>
                          <span style={{ fontSize: 22 }}>{item.icon}</span>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: item.txtColor }}>{item.txt}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{item.sub}</div>
                        </div>
                      </div>
                    )
                    return (
                      <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div className="sent-circle" style={{ background: bgClrO(item.stats.overall), borderColor: clrO(item.stats.overall) + "55", width: "auto", height: "auto", padding: "5px 16px", borderRadius: 999, borderWidth: 1.5 }}>
                          <span className="sent-num" style={{ color: clrO(item.stats.overall), fontSize: 13, fontFamily: "var(--font-body)" }}>{lblO(item.stats.overall)}</span>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: clrO(item.stats.overall) }}>{null}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{item.label + " · Skor " + item.stats.score}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Progress bars */}
                <div>
                  <CompareRow label="Positif" pct1={bertStats.posPct} pct2={llmStats.posPct} color="var(--green)" />
                  <CompareRow label="Netral" pct1={bertStats.neuPct} pct2={llmStats.neuPct} color="var(--amber)" />
                  <CompareRow label="Negatif" pct1={bertStats.negPct} pct2={llmStats.negPct} color="var(--red)" />
                </div>
              </div>
            )}
          </div>
        )}

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
                {/* Filter chips + count selector */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {/* Category filter chips */}
                  <div className="nf-bar" style={{ margin: 0, flexWrap: "wrap" }}>
                    {CAT_KEYS.map((key) => (
                      <span
                        key={key}
                        className={"nf-chip nf-" + key + (filter === key ? " active" : "")}
                        onClick={() => setFilter(key)}
                      >{CAT_FILTER_LABELS[key]}</span>
                    ))}
                  </div>

                  {/* Count selector */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Tampilkan:</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {NEWS_COUNT_OPTIONS.map(n => (
                        <button
                          key={n}
                          onClick={() => setNewsCountLimit(n)}
                          style={{
                            padding: "2px 8px",
                            fontSize: 10,
                            fontWeight: newsCountLimit === n ? 700 : 400,
                            borderRadius: 4,
                            border: "1px solid",
                            borderColor: newsCountLimit === n ? "var(--blue)" : "rgba(255,255,255,0.1)",
                            background: newsCountLimit === n ? "rgba(96,165,250,0.18)" : "transparent",
                            color: newsCountLimit === n ? "var(--blue)" : "var(--text-muted)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>



                {busy && <div style={St.emptyNote}>Memuat berita...</div>}
                {!busy && !filteredLimited.length && <div style={St.emptyNote}>Tidak ada berita untuk filter ini.</div>}

                {filteredLimited.map((a, i) => {
                  const hfMeta = SENT_META[a.sentiment] || SENT_META.neutral
                  const llmMeta = SENT_META[a.llm_sentiment] || SENT_META.neutral
                  return (
                    <div className="eNews-item" key={i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 52 }}>
                        <div className={"eNews-score-badge " + hfMeta.cls}>
                          <span className="esb-lbl">{hfMeta.short}</span>
                          <span className="esb-sub">BERT <b className="esb-conf">{Math.round((a.score || 0) * 100)}</b></span>
                        </div>
                        <div className={"eNews-score-badge " + llmMeta.cls}>
                          <span className="esb-lbl">{llmMeta.short}</span>
                          <span className="esb-sub">LLM <b className="esb-conf">{Math.round((a.llm_score || 0) * 100)}</b></span>
                        </div>
                      </div>
                      <div className="eNews-body">
                        <div className="eNews-title">
                          {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> : a.title}
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

                {/* Count info */}
                {!busy && filtered.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 12, padding: "8px 0", borderTop: "1px solid var(--border-light)" }}>
                    Menampilkan {Math.min(newsCountLimit, filtered.length)} dari {filtered.length} berita
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right col: distributions */}
          <div className="col-gap14">
            {/* Sentiment distribution bar */}
            <div className="card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div className="card-title">📊 Distribusi Sentimen</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => setDistModel("bert")}
                    style={{
                      padding: "2px 8px", fontSize: 10, fontWeight: distModel === "bert" ? 700 : 400,
                      borderRadius: 4, border: "1px solid",
                      borderColor: distModel === "bert" ? "var(--blue)" : "rgba(255,255,255,0.1)",
                      background: distModel === "bert" ? "rgba(96,165,250,0.18)" : "transparent",
                      color: distModel === "bert" ? "var(--blue)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s ease",
                    }}
                  >BERT</button>
                  <button
                    onClick={() => setDistModel("llm")}
                    style={{
                      padding: "2px 8px", fontSize: 10, fontWeight: distModel === "llm" ? 700 : 400,
                      borderRadius: 4, border: "1px solid",
                      borderColor: distModel === "llm" ? "var(--purple)" : "rgba(255,255,255,0.1)",
                      background: distModel === "llm" ? "rgba(167,139,250,0.18)" : "transparent",
                      color: distModel === "llm" ? "var(--purple)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s ease",
                    }}
                  >LLM</button>
                </div>
              </div>
              <div className="card-body">
                {[
                  { label: "Positif", pct: distModel === "bert" ? bertStats.posPct : llmStats.posPct, color: "var(--green)" },
                  { label: "Netral", pct: distModel === "bert" ? bertStats.neuPct : llmStats.neuPct, color: "var(--amber)" },
                  { label: "Negatif", pct: distModel === "bert" ? bertStats.negPct : llmStats.negPct, color: "var(--red)" },
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
          </div>
        </div>

        {/* ── Analisis Ringkasan Berita — Semua Sektor ── */}
        {news && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <div className="card-title">✦ Analisis Ringkasan Berita — Semua Sektor</div>
            </div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                {[
                  { key: "all", label: "🗂️ Semua Sektor", color: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.25)" },
                  { key: "market", label: "📈 Pasar", color: "rgba(96,165,250,0.10)", border: "rgba(96,165,250,0.25)" },
                  { key: "macro", label: "🏦 Makro Ekonomi", color: "rgba(45,212,160,0.10)", border: "rgba(45,212,160,0.25)" },
                  { key: "geopolitics", label: "🌍 Geopolitik", color: "rgba(245,183,49,0.10)", border: "rgba(245,183,49,0.25)" },
                ].map(({ key, label, color, border }) => (
                  <div
                    key={key}
                    style={{
                      background: color,
                      border: `1px solid ${border}`,
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
                      <button
                        className={"fetch-news-btn " + (sectorAiBusy[key] ? "loading" : "")}
                        style={{ padding: "3px 9px", fontSize: 10, height: 24, minWidth: 110 }}
                        onClick={() => runSectorAi(key, articlesBySector[key] || [])}
                        disabled={sectorAiBusy[key] || !articlesBySector[key]?.length}
                      >
                        <span className="spin-sm" style={{ width: 8, height: 8 }} />
                        <span className="btn-txt">{sectorAiBusy[key] ? "Menganalisis..." : "▶ Analisis"}</span>
                      </button>
                    </div>
                    <div style={{
                      fontSize: 11.5,
                      color: sectorAi[key] ? "var(--text-primary)" : "var(--text-muted)",
                      lineHeight: 1.75,
                      minHeight: 48,
                    }}>
                      {sectorAiBusy[key]
                        ? "Menganalisis dengan AI..."
                        : (sectorAi[key] || `Klik "▶ Analisis" untuk mendapatkan ringkasan AI berita ${label}.`)}
                    </div>
                    {articlesBySector[key]?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
                        {articlesBySector[key].length} artikel
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Kesimpulan Analisis Groq (paling bawah) ── */}
        {news && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div className="card-title">✦ Kesimpulan Analisis Groq — BERT vs LLM</div>
              <button
                className={"fetch-news-btn " + (overallAiBusy ? "loading" : "")}
                style={{ padding: "6px 14px", fontSize: 11, minWidth: 180 }}
                onClick={runOverallAi}
                disabled={overallAiBusy || !articles.length}
              >
                {overallAiBusy && <span className="spin-sm" style={{ borderTopColor: "var(--purple)" }} />}
                <span className="btn-txt">{overallAiBusy ? "Menganalisis..." : "✦ Analisis Kesimpulan Groq"}</span>
              </button>
            </div>
            <div className="card-body">
              <div className="ai-box" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.8 }}>
                  {overallAiBusy
                    ? "Menganalisis seluruh hasil sentimen BERT dan LLM..."
                    : (overallAi || `Klik "✦ Analisis Kesimpulan Groq" untuk mendapatkan ringkasan AI menyeluruh dari hasil sentimen model BERT dan LLM terhadap berita ${code}.`)}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
