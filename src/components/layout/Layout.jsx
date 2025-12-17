import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './Layout.css'

export default function Layout({ user }) {
    const navigate = useNavigate()
    const location = useLocation()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/login')
    }

    const [userRole, setUserRole] = useState(null)
    const [userName, setUserName] = useState('')

    useEffect(() => {
        if (user) {
            supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', user.id)
                .single()
                .then(({ data }) => {
                    if (data) {
                        setUserRole(data.role)
                        setUserName(data.full_name)
                    }
                })
        }
    }, [user])

    const menuItems = [
        { path: '/', label: 'Dashboard', icon: '📊' },
        { path: '/contas-pagar', label: 'Contas a Pagar', icon: '💸' },
        { path: '/contas-receber', label: 'Contas a Receber', icon: '💰' },
        { path: '/moradores', label: 'Moradores', icon: '👥' },
        { path: '/cobrancas', label: 'Cobranças', icon: '⚖️' },
        { path: '/relatorios', label: 'Relatórios', icon: '📈' },
    ]

    if (userRole === 'admin') {
        menuItems.push({ path: '/usuarios', label: 'Usuários (Admin)', icon: '🛡️' })
    }

    return (
        <div className="layout">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h2 className="sidebar-title">🏢 CondoManager</h2>
                    <p className="sidebar-subtitle">Sistema de Gestão</p>
                </div>

                <nav className="sidebar-nav">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="user-details">
                            <p className="user-name">{userName || user?.email?.split('@')[0]}</p>
                            <p className="user-role">
                                {userRole ? (
                                    {
                                        admin: 'Administrador',
                                        sindico: 'Síndico',
                                        contador: 'Contador'
                                    }[userRole] || userRole.toUpperCase()
                                ) : 'Carregando...'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="btn-logout">
                        🚪 Sair
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    )
}
