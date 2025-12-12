import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AccountsPayable from './pages/AccountsPayable'
import AccountsReceivable from './pages/AccountsReceivable'
import Residents from './pages/Residents'
import Collections from './pages/Collections'
import Reports from './pages/Reports'
import Payroll from './pages/Payroll'
import AdminUsers from './pages/AdminUsers'

// Layout
import Layout from './components/layout/Layout'

function App() {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }}>
                <div className="loading" style={{ width: '40px', height: '40px' }}></div>
            </div>
        )
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

                <Route
                    path="/"
                    element={user ? <Layout user={user} /> : <Navigate to="/login" />}
                >
                    <Route index element={<Dashboard />} />
                    <Route path="contas-pagar" element={<AccountsPayable />} />
                    <Route path="contas-receber" element={<AccountsReceivable />} />
                    <Route path="moradores" element={<Residents />} />
                    <Route path="cobrancas" element={<Collections />} />
                    <Route path="folha-pagamento" element={<Payroll />} />
                    <Route path="relatorios" element={<Reports />} />
                    <Route path="usuarios" element={<AdminUsers />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
