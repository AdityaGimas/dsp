import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/Layout.jsx"
import LandingPage from "./pages/LandingPage.jsx"
import Overview from "./pages/Overview.jsx"
import Forecasting from "./pages/Forecasting.jsx"
import BeritaSentimen from "./pages/BeritaSentimen.jsx"
import IndikatorTeknikal from "./pages/IndikatorTeknikal.jsx"
import MakroEkonomi from "./pages/MakroEkonomi.jsx"
import { useApp } from "./context/AppContext.jsx"

function ProtectedRoute({ children }) {
  const { hasSelectedTicker } = useApp()
  if (!hasSelectedTicker) return <Navigate to="/landing" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Overview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/forecasting"
          element={
            <ProtectedRoute>
              <Forecasting />
            </ProtectedRoute>
          }
        />
        <Route
          path="/berita"
          element={
            <ProtectedRoute>
              <BeritaSentimen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/indikator"
          element={
            <ProtectedRoute>
              <IndikatorTeknikal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/makro"
          element={
            <ProtectedRoute>
              <MakroEkonomi />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/landing" replace />} />
      </Route>
    </Routes>
  )
}
