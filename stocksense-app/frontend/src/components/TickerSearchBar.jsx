import { useState, useEffect } from "react"
import { useApp } from "../context/AppContext.jsx"

// Shared search bar: ticker input + watchlist quick chips.
export default function TickerSearchBar({ label = "Pilih Saham", children }) {
  const { currentTicker, setCurrentTicker, watchlist, removeFromWatchlist } = useApp()
  const [input, setInput] = useState(currentTicker)

  useEffect(() => setInput(currentTicker), [currentTicker])

  function submit(e) {
    if (e.key !== "Enter") return
    let v = input.trim().toUpperCase()
    if (!v.endsWith(".JK")) v += ".JK"
    setCurrentTicker(v)
  }

  const emptyChip = {
    fontSize: 11,
    color: "var(--text-muted)",
    fontStyle: "italic",
    alignSelf: "center",
  }

  // Slot aksi di sisi kanan search bar (mis. tombol Refresh / Ambil Berita).
  const actions = { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }

  return (
    <div className="search-bar">
      <span className="search-label">{label}</span>
      <div className="search-input-wrap">
        <span className="search-dot" />
        <input
          value={input}
          placeholder="BBCA.JK"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={submit}
        />
      </div>
      <div className="quick-chips">
        {watchlist.length === 0 ? (
          <span style={emptyChip}>Tambahkan saham ke watchlist ☆</span>
        ) : (
          watchlist.map((t) => {
            const code = t.replace(".JK", "")
            return (
              <span
                key={t}
                className={`chip-wrap ${t === currentTicker ? "active-chip" : ""}`}
                onClick={() => setCurrentTicker(t)}
              >
                {code}
                <span
                  className="chip-x"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFromWatchlist(t)
                  }}
                >
                  ×
                </span>
              </span>
            )
          })
        )}
      </div>
      {children ? (
        <div className="search-actions" style={actions}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
