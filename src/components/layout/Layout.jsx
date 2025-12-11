import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './Layout.css'

export default function Layout({ user }) {
    const navigate = useNavigate()
    const location = useLocation()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/login')
    }

    const menuItems = [
        { path: '/', label: 'Dashboard', icon: '📊' },
        { path: '/contas-pagar', label: 'Contas a Pagar', icon: '💸' },
        { path: '/contas-receber', label: 'Contas a Receber', icon: '💰' },
        { path: '/moradores', label: 'Moradores', icon: '👥' },
        { path: '/cobrancas', label: 'Cobranças', icon: '⚖️' },
        { path: '/folha-pagamento', label: 'Folha de Pagamento', icon: '👔' },
        { path: '/relatorios', label: 'Relatórios', icon: '📈' },
    ]

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
                            <p className="user-name">{user?.email?.split('@')[0] || 'Usuário'}</p>
                            <p className="user-role">Administrador</p>
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
