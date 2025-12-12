import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './Dashboard.css'
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Dashboard() {
    const [stats, setStats] = useState({
        currentBalance: 0,
        monthlyRevenue: 0,
        monthlyExpenses: 0,
        defaultRate: 0,
    })

    const [cashFlowData, setCashFlowData] = useState([])
    const [expensesByCategory, setExpensesByCategory] = useState([])
    const [defaultersData, setDefaultersData] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadDashboardData()
    }, [])

    const loadDashboardData = async () => {
        try {
            const today = new Date()
            const startOfCurrentMonth = startOfMonth(today)
            const endOfCurrentMonth = endOfMonth(today)

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

            const expenses = payables || []
            const receipts = receivables || []

            // --- CÁLCULO DOS CARDS ---

            // Receitas do Mês (Pagos no mês atual)
            const monthlyRevenue = receipts
                .filter(r => r.status === 'pago' && r.payment_date)
                .filter(r => isWithinInterval(parseISO(r.payment_date), { start: startOfCurrentMonth, end: endOfCurrentMonth }))
                .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0)

            // Despesas do Mês (Pagos no mês atual)
            const monthlyExpenses = expenses
                .filter(e => e.status === 'pago' && e.payment_date)
                .filter(e => isWithinInterval(parseISO(e.payment_date), { start: startOfCurrentMonth, end: endOfCurrentMonth }))
                .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)

            // Saldo Atual
            const totalReceived = receipts
                .filter(r => r.status === 'pago')
                .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0)

            const totalPaid = expenses
                .filter(e => e.status === 'pago')
                .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)

            const currentBalance = totalReceived - totalPaid

            // Taxa de Inadimplência Atual
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

            // --- CÁLCULO DOS GRÁFICOS ---

            // 1. Fluxo de Caixa (Últimos 6 meses)
            const last6Months = Array.from({ length: 6 }, (_, i) => {
                const date = subMonths(today, 5 - i)
                return {
                    month: format(date, 'MMM', { locale: ptBR }),
                    monthStart: startOfMonth(date),
                    monthEnd: endOfMonth(date),
                    receitas: 0,
                    despesas: 0
                }
            })

            const chartData = last6Months.map(period => {
                const periodRevenue = receipts
                    .filter(r => r.status === 'pago' && r.payment_date)
                    .filter(r => isWithinInterval(parseISO(r.payment_date), { start: period.monthStart, end: period.monthEnd }))
                    .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0)

                const periodExpenses = expenses
                    .filter(e => e.status === 'pago' && e.payment_date)
                    .filter(e => isWithinInterval(parseISO(e.payment_date), { start: period.monthStart, end: period.monthEnd }))
                    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)

                return {
                    month: period.month, // Capitalizar primeira letra se quiser
                    receitas: periodRevenue,
                    despesas: periodExpenses
                }
            })
            setCashFlowData(chartData)

            // 2. Despesas por Categoria (Mês Atual)
            const categoryMap = {}
            expenses
                .filter(e => e.status === 'pago' && e.payment_date) // Apenas pagas? Ou todas vencidas no mês? Vamos usar pagas.
                .filter(e => isWithinInterval(parseISO(e.payment_date), { start: startOfCurrentMonth, end: endOfCurrentMonth }))
                .forEach(e => {
                    const cat = e.category || 'outros'
                    categoryMap[cat] = (categoryMap[cat] || 0) + Number(e.amount)
                })

            const categoryColors = {
                'agua': '#3b82f6',
                'luz': '#f59e0b',
                'salarios': '#10b981',
                'manutencao': '#ef4444',
                'limpeza': '#8b5cf6',
                'outros': '#64748b'
            }

            const categoryChartData = Object.keys(categoryMap).map(cat => ({
                name: cat.charAt(0).toUpperCase() + cat.slice(1),
                value: categoryMap[cat],
                color: categoryColors[cat] || '#64748b'
            }))

            // Se vazio, adicione um placeholder invisible ou mostre mensagem? Melhor array vazio.
            setExpensesByCategory(categoryChartData)

            // 3. Evolução da Inadimplência (Mockado com dados atuais para o mês corrente, 0 para anteriores se não tiver histórico)
            // Como não temos tabela de histórico, vamos mostrar apenas o mês atual no gráfico ou zerado.
            // Para não ficar feio, vamos mostrar zerado nos anteriores e o atual real.
            const defaultersChartData = last6Months.map((period, index) => {
                // Se for o mês atual, usa o dado real. Se passado, 0 (já que não temos histórico).
                const isCurrentMonth = index === 5 // Último do array
                return {
                    month: period.month,
                    taxa: isCurrentMonth ? Number(defaultRate) : 0
                }
            })
            setDefaultersData(defaultersChartData)

        } catch (error) {
            console.error('Erro ao carregar dashboard:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="loading"></div>
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
                        <p className="stat-change text-gray text-sm font-normal mt-xs">acumulado total</p>
                    </div>
                </div>

                <div className="stat-card stat-success">
                    <div className="stat-icon">📈</div>
                    <div className="stat-content">
                        <p className="stat-label">Receitas do Mês</p>
                        <h3 className="stat-value">{formatCurrency(stats.monthlyRevenue)}</h3>
                        <p className="stat-change text-gray text-sm font-normal mt-xs">pagamentos recebidos</p>
                    </div>
                </div>

                <div className="stat-card stat-warning">
                    <div className="stat-icon">📉</div>
                    <div className="stat-content">
                        <p className="stat-label">Despesas do Mês</p>
                        <h3 className="stat-value">{formatCurrency(stats.monthlyExpenses)}</h3>
                        <p className="stat-change text-gray text-sm font-normal mt-xs">contas pagas</p>
                    </div>
                </div>

                <div className="stat-card stat-danger">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-content">
                        <p className="stat-label">Taxa de Inadimplência</p>
                        <h3 className="stat-value">{stats.defaultRate}%</h3>
                        <p className="stat-change text-gray text-sm font-normal mt-xs">moradores em atraso</p>
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
                        {cashFlowData.length > 0 ? (
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
                                <Bar dataKey="receitas" fill="#10b981" name="Receitas" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="despesas" fill="#ef4444" name="Despesas" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        ) : (
                            <div className="flex justify-center items-center h-full text-gray">
                                Sem dados para exibir
                            </div>
                        )}
                    </ResponsiveContainer>
                </div>

                {/* Despesas por Categoria */}
                <div className="card chart-card">
                    <div className="card-header">
                        <h3 className="card-title">Despesas por Categoria</h3>
                        <p className="text-sm text-gray">Mês atual</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        {expensesByCategory.length > 0 ? (
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
                        ) : (
                            <div className="flex justify-center items-center h-full text-gray">
                                Nenhuma despesa paga este mês
                            </div>
                        )}
                    </ResponsiveContainer>
                </div>

                {/* Evolução da Inadimplência */}
                <div className="card chart-card chart-full">
                    <div className="card-header">
                        <h3 className="card-title">Evolução da Inadimplência</h3>
                        <p className="text-sm text-gray">Últimos 6 meses (Simulado)</p>
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

            {/* Alertas e Ações Rápidas - MANTIDOS ESTÁTICOS POR ENQUANTO PARA NÃO DEIXAR A TELA DEMAIS DE VAZIA, MAS PODERIAM SER DINÂMICOS */}
            <div className="alerts-grid">
                <div className="card alert-card alert-warning-card">
                    <div className="alert-header">
                        <span className="alert-icon">⏰</span>
                        <h4 className="alert-title">Contas a Vencer</h4>
                    </div>
                    <p className="alert-message">Acesse o módulo de contas para ver detalhes</p>
                    <a href="/contas-pagar" className="alert-link">Ver detalhes →</a>
                </div>

                <div className="card alert-card alert-danger-card">
                    <div className="alert-header">
                        <span className="alert-icon">🔴</span>
                        <h4 className="alert-title">Inadimplentes</h4>
                    </div>
                    <p className="alert-message">Acompanhe os moradores em atraso</p>
                    <a href="/cobrancas" className="alert-link">Gerenciar →</a>
                </div>
            </div>
        </div>
    )
}
