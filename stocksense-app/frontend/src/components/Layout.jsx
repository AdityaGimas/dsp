import { Outlet } from "react-router-dom"
import Topbar from "./Topbar.jsx"
import Sidebar from "./Sidebar.jsx"
import GroqModal from "./GroqModal.jsx"

export default function Layout() {
  return (
    <>
      <Topbar />
      <GroqModal />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  )
}
