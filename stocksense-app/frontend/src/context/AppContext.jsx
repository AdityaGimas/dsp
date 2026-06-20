import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { api } from "../api/client.js"

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
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
