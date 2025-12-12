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
import PendingApproval from './pages/PendingApproval' // Nova página

// Layout
import Layout from './components/layout/Layout'

function App() {
    const [user, setUser] = useState(null)
    const [isApproved, setIsApproved] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                checkProfile(session.user)
            } else {
                setUser(null)
                setIsApproved(false)
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            await checkProfile(session.user)
        } else {
            setLoading(false)
        }
    }

    const checkProfile = async (currentUser) => {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_approved')
                .eq('id', currentUser.id)
                .single()

            setUser(currentUser)
            // Se não tiver perfil (erro de banco), assume falso
            setIsApproved(profile ? profile.is_approved : false)
        } catch (err) {
            console.error(err)
            setIsApproved(false)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="loading"></div>
            </div>
        )
    }

    // Se logado mas NÃO aprovado:
    if (user && !isApproved) {
        return <PendingApproval />
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
