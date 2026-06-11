import { useEffect, useState } from "react"
import { useApp } from "../context/AppContext.jsx"

const hintStyle = { fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }

export default function GroqModal() {
  const { groqKey, setGroqKey, grokModalOpen, setGrokModalOpen } = useApp()
  const [val, setVal] = useState(groqKey)

  useEffect(() => {
    if (grokModalOpen) setVal(groqKey)
  }, [grokModalOpen, groqKey])

  function save() {
    setGroqKey(val.trim())
    setGrokModalOpen(false)
  }

  return (
    <div className={`modal-overlay ${grokModalOpen ? "open" : ""}`}>
      <div className="modal-box">
        <div className="modal-title">✦ Groq API Key</div>
        <div className="modal-sub">
          Masukkan API key dari <strong>console.groq.com</strong> untuk
          mengaktifkan analisis teknikal dan ringkasan berita oleh Groq LLM.
          <br />
          Key dikirim ke backend kamu sebagai proxy, dan disimpan di browser
          (localStorage).
        </div>
        <input
          className="modal-input"
          type="password"
          placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <div style={hintStyle}>
          Kosongkan dan simpan untuk menghapus key yang tersimpan.
        </div>
        <div className="modal-row">
          <button className="btn btn-primary" onClick={save}>
            Simpan &amp; Aktifkan
          </button>
          <button className="btn btn-ghost" onClick={() => setGrokModalOpen(false)}>
            Batal
          </button>
        </div>
      </div>
    </div>
  )
}
