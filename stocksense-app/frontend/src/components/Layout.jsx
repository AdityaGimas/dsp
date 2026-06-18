import { Outlet } from "react-router-dom"
import Topbar from "./Topbar.jsx"
import Sidebar from "./Sidebar.jsx"

export default function Layout() {
  return (
    <>
      <Topbar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  )
}
