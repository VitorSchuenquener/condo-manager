import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// --- ÍCONES (Mantidos pois dão o toque profissional) ---
const Icons = {
    Revenue: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>,
    Expense: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>,
    Balance: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>,
    Alert: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    Print: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
}

// Utilitários
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    const userTimezoneOffset = date.getTimezoneOffset() * 60000
    const adjustedDate = new Date(date.getTime() + userTimezoneOffset)
    return new Intl.DateTimeFormat('pt-BR').format(adjustedDate)
}

export default function Reports() {
    const [loading, setLoading] = useState(false)
    const [referenceMonth, setReferenceMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
    const [reportData, setReportData] = useState(null)

    useEffect(() => {
        fetchReportData()
    }, [referenceMonth])

    const fetchReportData = async () => {
        setLoading(true)
        try {
            const [year, month] = referenceMonth.split('-')

            const startDate = new Date(year, month - 1, 1)
            const endDate = new Date(year, month, 0, 23, 59, 59)

            // Receitas
            const { data: receipts } = await supabase.from('accounts_receivable').select('*, residents(name, unit_number)').eq('status', 'pago').gte('payment_date', startDate.toISOString()).lte('payment_date', endDate.toISOString())

            // Despesas
            const { data: expenses } = await supabase.from('accounts_payable').select('*').eq('status', 'pago').gte('payment_date', startDate.toISOString()).lte('payment_date', endDate.toISOString())

            // Saldo Anterior
            const { data: prevReceipts } = await supabase.from('accounts_receivable').select('total_amount').eq('status', 'pago').lt('payment_date', startDate.toISOString())
            const { data: prevExpenses } = await supabase.from('accounts_payable').select('amount').eq('status', 'pago').lt('payment_date', startDate.toISOString())

            const totalPrevRevenue = prevReceipts?.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0) || 0
            const totalPrevExpenses = prevExpenses?.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) || 0
            const previousBalance = totalPrevRevenue - totalPrevExpenses

            // Inadimplência
            const todayStr = new Date().toISOString().split('T')[0]
            const { data: defaulters } = await supabase.from('accounts_receivable').select('*, residents(name, unit_number, block)').lt('due_date', todayStr).neq('status', 'pago').order('due_date')

            const totalRevenue = receipts?.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0) || 0
            const totalExpenses = expenses?.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) || 0
            const currentBalance = previousBalance + totalRevenue - totalExpenses

            const processedDefaulters = (defaulters || []).map(bill => {
                const amount = Number(bill.total_amount) || 0
                const dueDate = new Date(bill.due_date)
                const now = new Date()
                const daysLate = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))
                if (daysLate <= 0) return { ...bill, calculatedTotal: amount, daysLate: 0 }
                return { ...bill, calculatedTotal: amount + (amount * 0.02) + (amount * (0.000333 * daysLate)), daysLate }
            })

            const totalDefaults = processedDefaulters.reduce((acc, curr) => acc + curr.calculatedTotal, 0)

            setReportData({
                receipts: receipts || [],
                expenses: expenses || [],
                defaulters: processedDefaulters,
                summary: { revenue: totalRevenue, expenses: totalExpenses, balance: currentBalance, defaults: totalDefaults }
            })
        } catch (error) {
            console.error(error)
            toast.error('Erro ao gerar relatório')
        } finally {
            setLoading(false)
        }
    }

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    const [y, m] = referenceMonth.split('-')
    const monthLabel = `${monthNames[parseInt(m) - 1]} de ${y}`

    return (
        <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', padding: '40px 20px', fontFamily: "'Segoe UI', Roboto, sans-serif" }}>

            {/* CONTROLES (Não Imprime) */}
            <div className="no-print" style={{ maxWidth: '210mm', margin: '0 auto 24px auto', backgroundColor: 'white', padding: '16px 24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <strong>Mês de Referência:</strong>
                    <input type="month" value={referenceMonth} onChange={e => setReferenceMonth(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                <button onClick={() => window.print()} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icons.Print /> Imprimir Oficial
                </button>
            </div>

            {/* PAPEL (Relatório) */}
            <div className="report-sheet" style={{
                maxWidth: '210mm',
                minHeight: '297mm',
                margin: '0 auto',
                backgroundColor: 'white',
                padding: '40px', // Padding generoso
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
                {loading || !reportData ? (
                    <div style={{ padding: '50px', textAlign: 'center', color: '#666' }}>Carregando dados...</div>
                ) : (
                    <>
                        {/* CABEÇALHO CLÁSSICO E LIMPO */}
                        <div style={{ textAlign: 'center', borderBottom: '2px solid #e5e7eb', paddingBottom: '20px', marginBottom: '30px' }}>
                            <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#111827', textTransform: 'uppercase' }}>Condomínio Residencial</h1>
                            <div style={{ fontSize: '16px', color: '#374151' }}>Relatório Financeiro Analítico</div>
                            <div style={{ marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>Referência: <strong>{monthLabel}</strong></div>
                        </div>

                        {/* CARDS ESTILO "ANTIGO" (Coloridos e Espaçosos) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>

                            {/* Receitas (Verde) */}
                            <div style={{ backgroundColor: '#ecfdf5', padding: '20px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Receitas</span>
                                    <Icons.Revenue />
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#065f46' }}>{formatCurrency(reportData.summary.revenue)}</div>
                            </div>

                            {/* Despesas (Vermelho) */}
                            <div style={{ backgroundColor: '#fef2f2', padding: '20px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Despesas</span>
                                    <Icons.Expense />
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#991b1b' }}>{formatCurrency(reportData.summary.expenses)}</div>
                            </div>

                            {/* Saldo (Azul) */}
                            <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1d4ed8', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Saldo Caixa</span>
                                    <Icons.Balance />
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: reportData.summary.balance >= 0 ? '#1e40af' : '#b91c1c' }}>{formatCurrency(reportData.summary.balance)}</div>
                            </div>

                            {/* Inadimplência (Laranja) */}
                            <div style={{ backgroundColor: '#fff7ed', padding: '20px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c2410c', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Inadimplência</span>
                                    <Icons.Alert />
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#9a3412' }}>{formatCurrency(reportData.summary.defaults)}</div>
                            </div>
                        </div>

                        {/* TABELAS ESPAÇOSAS */}
                        <div style={{ display: 'flex', gap: '40px', marginBottom: '40px' }}>
                            {/* Tabela Receitas */}
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#059669', borderBottom: '2px solid #059669', paddingBottom: '10px', marginBottom: '15px' }}>
                                    ENTRADAS (RECEITAS)
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {reportData.receipts.map((r, i) => (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                {/* PADDING AUMENTADO AQUI (12px) */}
                                                <td style={{ padding: '12px 4px', color: '#374151' }}>{formatDate(r.payment_date)}</td>
                                                <td style={{ padding: '12px 4px' }}>
                                                    <div style={{ color: '#111827', fontWeight: '500' }}>{r.description}</div>
                                                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{r.residents?.unit_number} - {r.residents?.name}</div>
                                                </td>
                                                <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: '500', color: '#374151' }}>{formatCurrency(r.total_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Tabela Despesas */}
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626', borderBottom: '2px solid #dc2626', paddingBottom: '10px', marginBottom: '15px' }}>
                                    SAÍDAS (DESPESAS)
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {reportData.expenses.map((e, i) => (
                                            <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                {/* PADDING AUMENTADO AQUI (12px) */}
                                                <td style={{ padding: '12px 4px', color: '#374151' }}>{formatDate(e.payment_date)}</td>
                                                <td style={{ padding: '12px 4px' }}>
                                                    <div style={{ color: '#111827', fontWeight: '500' }}>{e.description}</div>
                                                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{e.category}</div>
                                                </td>
                                                <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: '500', color: '#374151' }}>{formatCurrency(e.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* SEÇÃO INADIMPLÊNCIA DESTACADA E ESPAÇOSA */}
                        <div style={{ marginTop: '40px', pageBreakInside: 'avoid' }}>
                            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '12px', padding: '30px' }}>
                                <h3 style={{ marginTop: 0, color: '#9a3412', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    ⚠️ RELATÓRIO DE INADIMPLÊNCIA ACUMULADA
                                    <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#c2410c', backgroundColor: '#ffedd5', padding: '4px 8px', borderRadius: '4px' }}>Valores com Multa e Juros</span>
                                </h3>

                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px', marginTop: '16px' }}>
                                    <thead>
                                        <tr style={{ color: '#9a3412', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left' }}>
                                            <th style={{ padding: '0 8px' }}>Unidade</th>
                                            <th style={{ padding: '0 8px' }}>Morador</th>
                                            <th style={{ padding: '0 8px' }}>Vencimento</th>
                                            <th style={{ padding: '0 8px', textAlign: 'right' }}>Valor Corrigido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.defaulters.map(d => (
                                            <tr key={d.id} style={{ backgroundColor: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                {/* CÉLULAS BEM ESPAÇADAS (Padding 16px) */}
                                                <td style={{ padding: '16px 8px', borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px', fontWeight: 'bold', color: '#7c2d12' }}>{d.residents?.unit_number}</td>
                                                <td style={{ padding: '16px 8px', color: '#374151' }}>{d.residents?.name}</td>
                                                <td style={{ padding: '16px 8px', color: '#ea580c' }}>
                                                    {formatDate(d.due_date)} <span style={{ color: '#9ca3af', fontSize: '12px' }}>({d.daysLate} dias)</span>
                                                </td>
                                                <td style={{ padding: '16px 8px', borderTopRightRadius: '6px', borderBottomRightRadius: '6px', textAlign: 'right', fontWeight: 'bold', color: '#c2410c' }}>
                                                    {formatCurrency(d.calculatedTotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </>
                )}
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .report-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: none !important; padding: 0 !important; }
                }
            `}</style>
        </div>
    )
}
