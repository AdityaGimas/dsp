import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { api } from "../api/client.js"
import { loadCache, saveCache } from "../utils/format.js"

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

// Used if /api/stocks/list is unreachable (same fallback as original script.js)
const FALLBACK_STOCKS = [
  { ticker: "BBCA.JK", code: "BBCA", name: "Bank Central Asia" },
  { ticker: "BBRI.JK", code: "BBRI", name: "Bank Rakyat Indonesia" },
  { ticker: "BMRI.JK", code: "BMRI", name: "Bank Mandiri" },
  { ticker: "TLKM.JK", code: "TLKM", name: "Telkom Indonesia" },
  { ticker: "ASII.JK", code: "ASII", name: "Astra International" },
  { ticker: "GOTO.JK", code: "GOTO", name: "GoTo Gojek Tokopedia" },
  { ticker: "BBNI.JK", code: "BBNI", name: "Bank Negara Indonesia" },
  { ticker: "UNVR.JK", code: "UNVR", name: "Unilever Indonesia" },
  { ticker: "KLBF.JK", code: "KLBF", name: "Kalbe Farma" },
  { ticker: "ANTM.JK", code: "ANTM", name: "Aneka Tambang" },
  { ticker: "PTBA.JK", code: "PTBA", name: "Bukit Asam" },
  { ticker: "ADRO.JK", code: "ADRO", name: "Adaro Energy" },
  { ticker: "INDF.JK", code: "INDF", name: "Indofood Sukses Makmur" },
  { ticker: "SMGR.JK", code: "SMGR", name: "Semen Indonesia" },
  { ticker: "PGAS.JK", code: "PGAS", name: "Perusahaan Gas Negara" },
  { ticker: "MEDC.JK", code: "MEDC", name: "Medco Energi" },
  { ticker: "INCO.JK", code: "INCO", name: "Vale Indonesia" },
  { ticker: "MDKA.JK", code: "MDKA", name: "Merdeka Copper Gold" },
  { ticker: "ICBP.JK", code: "ICBP", name: "Indofood CBP" },
  { ticker: "UNTR.JK", code: "UNTR", name: "United Tractors" },
]

export function AppProvider({ children }) {
  const [allStocks, setAllStocks] = useState([])
  const [currentTicker, setCurrentTicker] = useState(null)
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("wl_stocksense") || '[]')
    } catch (e) {
      return []
    }
  })

  const [llmProvider, setLlmProvider] = useState(() => localStorage.getItem("llm_provider") || "groq")

  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const triggerRefresh = useCallback(() => setRefreshTrigger((t) => t + 1), [])

  useEffect(() => {
    localStorage.setItem("llm_provider", llmProvider)
  }, [llmProvider])

  // ── Shared news+sentiment cache (in-memory, per ticker) ──────────────────
  // Struktur: { [ticker]: { data: {...}, busy: false, err: "", aiSummary: "" } }
  const [newsCache, setNewsCache] = useState({})
  // Ref untuk mencegah double-fetch (StrictMode / concurrent calls)
  const fetchingRef = useRef({})

  /**
   * Ambil berita + sentimen untuk ticker tertentu.
   * - Jika sudah ada di newsCache (sesi ini) DAN force=false → skip, gunakan cache.
   * - Jika belum ada atau force=true → fetch ulang, simpan ke newsCache & localStorage.
   */
  const fetchNewsForTicker = useCallback(async (ticker, force = false) => {
    // Sudah ada di memory cache dan tidak diminta force refresh
    if (!force && newsCache[ticker]?.data) return

    // Sedang dalam proses fetch → jangan dobel
    if (fetchingRef.current[ticker]) return
    fetchingRef.current[ticker] = true

    // Set busy
    setNewsCache(prev => ({
      ...prev,
      [ticker]: { ...prev[ticker], busy: true, err: "" },
    }))

    try {
      // 1. Coba ambil dari localStorage dulu (hanya jika tidak force)
      if (!force) {
        const cached = loadCache(ticker)
        if (cached?.news) {
          const ln = cached.news.d
          const aiSummary = cached.groqNewsSummary?.d || ""
          setNewsCache(prev => ({
            ...prev,
            [ticker]: { data: ln, busy: false, err: "", aiSummary, ts: cached.news.ts },
          }))
          fetchingRef.current[ticker] = false
          return
        }
      }

      // 2. Fetch berita dari backend
      const newsData = await api.getNews(ticker, 50)
      if (!newsData.articles || !newsData.articles.length)
        throw new Error("Tidak ada berita ditemukan. Coba lagi nanti.")

      // 3. Inferensi sentimen (BERT + LLM)
      const sentData = await api.predictSentiment(
        ticker,
        newsData.articles.map((a) => ({
          title: a.title,
          content: a.content || "",
          category: a.category || "market",
        })),
        llmProvider
      )

      // 4. Merge
      const merged = newsData.articles.map((a, i) => ({
        ...a,
        category: sentData.results[i]?.category || a.category || "market",
        sentiment: sentData.results[i]?.sentiment || "neutral",
        sentiment_label: sentData.results[i]?.label || "Netral",
        score: sentData.results[i]?.score ?? 0,
        llm_sentiment: sentData.results[i]?.llm_sentiment || "neutral",
        llm_label: sentData.results[i]?.llm_label || "Netral",
        llm_score: sentData.results[i]?.llm_score ?? 0,
        llm2_sentiment: sentData.results[i]?.llm2_sentiment || "neutral",
        llm2_label: sentData.results[i]?.llm2_label || "Netral",
        llm2_score: sentData.results[i]?.llm2_score ?? 0,
      }))

      const ln = {
        total_articles: sentData.total_articles,
        articles: merged,
        sentiment_summary: sentData.summary,
      }

      const ts = Date.now()
      saveCache(ticker, "news", ln)

      setNewsCache(prev => ({
        ...prev,
        [ticker]: { data: ln, busy: false, err: "", aiSummary: prev[ticker]?.aiSummary || "", ts },
      }))

      // 5. Groq AI summary (async, tidak blokir)
      api
        .groqNewsSummary({
          ticker,
          articles: merged.map((a) => ({ source: a.source, title: a.title })),
          sentiment_summary: sentData.summary,
          llm_provider: llmProvider
        })
        .then((r) => {
          const txt = r.summary || r.main_theme || "Groq tidak memberikan ringkasan."
          saveCache(ticker, "groqNewsSummary", txt)
          setNewsCache(prev => ({
            ...prev,
            [ticker]: { ...prev[ticker], aiSummary: txt },
          }))
        })
        .catch((e) => {
          setNewsCache(prev => ({
            ...prev,
            [ticker]: { ...prev[ticker], aiSummary: "Gagal ringkasan Groq: " + e.message },
          }))
        })
    } catch (e) {
      setNewsCache(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], busy: false, err: e.message },
      }))
    } finally {
      fetchingRef.current[ticker] = false
    }
  }, [newsCache, llmProvider])

  useEffect(() => {
    api
      .getStockList()
      .then((d) => setAllStocks(d.stocks && d.stocks.length ? d.stocks : FALLBACK_STOCKS))
      .catch(() => setAllStocks(FALLBACK_STOCKS))
  }, [])

  useEffect(() => {
    localStorage.setItem("wl_stocksense", JSON.stringify(watchlist))
  }, [watchlist])

  const addToWatchlist = useCallback(
    (t) => setWatchlist((w) => (w.includes(t) ? w : [...w, t])),
    [],
  )
  const removeFromWatchlist = useCallback(
    (t) => setWatchlist((w) => w.filter((x) => x !== t)),
    [],
  )
  const isWatchlisted = useCallback((t) => watchlist.includes(t), [watchlist])

  const value = {
    allStocks,
    currentTicker,
    setCurrentTicker,
    hasSelectedTicker: currentTicker !== null,
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isWatchlisted,
    refreshTrigger,
    isRefreshing,
    setIsRefreshing,
    triggerRefresh,
    // News/sentiment shared cache
    newsCache,
    fetchNewsForTicker,
    llmProvider,
    setLlmProvider,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
