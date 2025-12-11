import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './Dashboard.css'

export default function Dashboard() {
    const [stats, setStats] = useState({
        currentBalance: 0,
        monthlyRevenue: 0,
        monthlyExpenses: 0,
        defaultRate: 0,
    })

    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadDashboardData()
    }, [])

    const loadDashboardData = async () => {
        try {
            const today = new Date()
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString()

            // Carregar Residents count
            const { count: residentsCount } = await supabase
                .from('residents')
                .select('*', { count: 'exact', head: true })

            // Carregar Contas a Pagar (Despesas)
            const { data: payables } = await supabase
                .from('accounts_payable')
                .select('*')

            // Carregar Contas a Receber (Receitas)
            const { data: receivables } = await supabase
                .from('accounts_receivable')
                .select('*')

            // Calcular Métricas
            const expenses = payables || []
            const receipts = receivables || []

            // Receitas do Mês (Pagos no mês atual)
            const monthlyRevenue = receipts
                .filter(r => r.status === 'pago' && r.payment_date >= firstDayOfMonth && r.payment_date <= lastDayOfMonth)
                .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0)

            // Despesas do Mês (Pagos ou Vencidos no mês atual? Geralmente regime de caixa = pagos)
            // Vamos considerar regime de competência para dashboard de gestão, ou caixa?
            // Para "Saldo", caixa. Para "Despesas do Mês", geralmente competência (vencimento) ou caixa (pagamento).
            // Vamos usar CAIXA (Pagos no mês) para alinhar com fluxo de caixa
            const monthlyExpenses = expenses
                .filter(e => e.status === 'pago' && e.payment_date >= firstDayOfMonth && e.payment_date <= lastDayOfMonth)
                .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)

            // Saldo Atual (Total Recebido - Total Pago de sempre)
            const totalReceived = receipts
                .filter(r => r.status === 'pago')
                .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0)

            const totalPaid = expenses
                .filter(e => e.status === 'pago')
                .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)

            const currentBalance = totalReceived - totalPaid

            // Taxa de Inadimplência
            // (Moradores com contas 'atrasado' / Total Moradores) * 100
            const uniqueDefaulters = new Set(
                receipts.filter(r => r.status === 'atrasado').map(r => r.resident_id)
            ).size

            const defaultRate = residentsCount > 0
                ? ((uniqueDefaulters / residentsCount) * 100).toFixed(1)
                : 0

            setStats({
                currentBalance,
                monthlyRevenue,
                monthlyExpenses,
                defaultRate
            })
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error)
        } finally {
            setLoading(false)
        }
    }

    // Dados de demonstração para gráficos
    const cashFlowData = [
        { month: 'Jun', receitas: 42000, despesas: 35000 },
        { month: 'Jul', receitas: 45000, despesas: 32000 },
        { month: 'Ago', receitas: 43500, despesas: 34500 },
        { month: 'Set', receitas: 46000, despesas: 31000 },
        { month: 'Out', receitas: 44500, despesas: 33500 },
        { month: 'Nov', receitas: 45200, despesas: 32150 },
    ]

    const expensesByCategory = [
        { name: 'Água', value: 8500, color: '#3b82f6' },
        { name: 'Luz', value: 6200, color: '#f59e0b' },
        { name: 'Salários', value: 12000, color: '#10b981' },
        { name: 'Manutenção', value: 3450, color: '#ef4444' },
        { name: 'Limpeza', value: 2000, color: '#8b5cf6' },
    ]

    const defaultersData = [
        { month: 'Jun', taxa: 15.2 },
        { month: 'Jul', taxa: 14.8 },
        { month: 'Ago', taxa: 13.5 },
        { month: 'Set', taxa: 13.0 },
        { month: 'Out', taxa: 12.8 },
        { month: 'Nov', taxa: 12.5 },
    ]

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading" style={{ width: '40px', height: '40px' }}></div>
            </div>
        )
    }

    return (
        <div className="dashboard">
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Visão geral do condomínio</p>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card stat-primary">
                    <div className="stat-icon">💰</div>
                    <div className="stat-content">
                        <p className="stat-label">Saldo Atual</p>
                        <h3 className="stat-value">{formatCurrency(stats.currentBalance)}</h3>
                        <p className="stat-change positive">+8.2% vs mês anterior</p>
                    </div>
                </div>

                <div className="stat-card stat-success">
                    <div className="stat-icon">📈</div>
                    <div className="stat-content">
                        <p className="stat-label">Receitas do Mês</p>
                        <h3 className="stat-value">{formatCurrency(stats.monthlyRevenue)}</h3>
                        <p className="stat-change positive">+3.5% vs mês anterior</p>
                    </div>
                </div>

                <div className="stat-card stat-warning">
                    <div className="stat-icon">📉</div>
                    <div className="stat-content">
                        <p className="stat-label">Despesas do Mês</p>
                        <h3 className="stat-value">{formatCurrency(stats.monthlyExpenses)}</h3>
                        <p className="stat-change negative">-2.1% vs mês anterior</p>
                    </div>
                </div>

                <div className="stat-card stat-danger">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-content">
                        <p className="stat-label">Taxa de Inadimplência</p>
                        <h3 className="stat-value">{stats.defaultRate}%</h3>
                        <p className="stat-change positive">-1.3% vs mês anterior</p>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="charts-grid">
                {/* Fluxo de Caixa */}
                <div className="card chart-card">
                    <div className="card-header">
                        <h3 className="card-title">Fluxo de Caixa</h3>
                        <p className="text-sm text-gray">Últimos 6 meses</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={cashFlowData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" stroke="#64748b" />
                            <YAxis stroke="#64748b" />
                            <Tooltip
                                contentStyle={{
                                    background: '#fff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px'
                                }}
                                formatter={(value) => formatCurrency(value)}
                            />
                            <Legend />
                            <Bar dataKey="receitas" fill="#10b981" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="despesas" fill="#ef4444" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Despesas por Categoria */}
                <div className="card chart-card">
                    <div className="card-header">
                        <h3 className="card-title">Despesas por Categoria</h3>
                        <p className="text-sm text-gray">Mês atual</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={expensesByCategory}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {expensesByCategory.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Evolução da Inadimplência */}
                <div className="card chart-card chart-full">
                    <div className="card-header">
                        <h3 className="card-title">Evolução da Inadimplência</h3>
                        <p className="text-sm text-gray">Últimos 6 meses</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={defaultersData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" stroke="#64748b" />
                            <YAxis stroke="#64748b" />
                            <Tooltip
                                contentStyle={{
                                    background: '#fff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px'
                                }}
                                formatter={(value) => `${value}%`}
                            />
                            <Line
                                type="monotone"
                                dataKey="taxa"
                                stroke="#ef4444"
                                strokeWidth={3}
                                dot={{ fill: '#ef4444', r: 6 }}
                                activeDot={{ r: 8 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Alertas e Ações Rápidas */}
            <div className="alerts-grid">
                <div className="card alert-card alert-warning-card">
                    <div className="alert-header">
                        <span className="alert-icon">⏰</span>
                        <h4 className="alert-title">Contas a Vencer</h4>
                    </div>
                    <p className="alert-message">5 contas vencem nos próximos 7 dias</p>
                    <p className="alert-value">{formatCurrency(12450.00)}</p>
                    <a href="/contas-pagar" className="alert-link">Ver detalhes →</a>
                </div>

                <div className="card alert-card alert-danger-card">
                    <div className="alert-header">
                        <span className="alert-icon">🔴</span>
                        <h4 className="alert-title">Inadimplentes Críticos</h4>
                    </div>
                    <p className="alert-message">8 moradores com +90 dias de atraso</p>
                    <p className="alert-value">{formatCurrency(28350.00)}</p>
                    <a href="/cobrancas" className="alert-link">Gerenciar →</a>
                </div>

                <div className="card alert-card alert-info-card">
                    <div className="alert-header">
                        <span className="alert-icon">⚖️</span>
                        <h4 className="alert-title">Protestos em Andamento</h4>
                    </div>
                    <p className="alert-message">2 processos aguardando prazo legal</p>
                    <p className="alert-value">2 moradores</p>
                    <a href="/cobrancas" className="alert-link">Acompanhar →</a>
                </div>
            </div>
        </div>
    )
}
