import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/Layout.jsx"
import Overview from "./pages/Overview.jsx"
import Forecasting from "./pages/Forecasting.jsx"
import BeritaSentimen from "./pages/BeritaSentimen.jsx"
import IndikatorTeknikal from "./pages/IndikatorTeknikal.jsx"
import MakroEkonomi from "./pages/MakroEkonomi.jsx"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/forecasting" element={<Forecasting />} />
        <Route path="/berita" element={<BeritaSentimen />} />
        <Route path="/indikator" element={<IndikatorTeknikal />} />
        <Route path="/makro" element={<MakroEkonomi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
