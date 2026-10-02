import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Tienda from './pages/Tienda'
import Checkout from './pages/Checkout'
import WebpayRetorno from './pages/WebpayRetorno'
import CuentaLogin from './pages/CuentaLogin'
import MisPedidos from './pages/MisPedidos'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminRoute from './components/AdminRoute'
import { AuthProvider } from './context/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Tienda />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/webpay-retorno" element={<WebpayRetorno />} />
            <Route path="/login" element={<CuentaLogin />} />
            <Route path="/mis-pedidos" element={<MisPedidos />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route
              path="/admin/*"
              element={
                <AdminRoute>
                  <Routes>
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
                  </Routes>
                </AdminRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  )
}
