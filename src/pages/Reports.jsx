import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Ícones minimalistas para cabeçalhos
const Icons = {
    Revenue: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>,
    Expense: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>,
    Balance: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>,
    Default: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    Print: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
}

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
    const [referenceMonth, setReferenceMonth] = useState(new Date().toISOString().slice(0, 7))
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

            const { data: receipts } = await supabase.from('accounts_receivable').select('*, residents(name, unit_number)').eq('status', 'pago').gte('payment_date', startDate.toISOString()).lte('payment_date', endDate.toISOString())
            const { data: expenses } = await supabase.from('accounts_payable').select('*').eq('status', 'pago').gte('payment_date', startDate.toISOString()).lte('payment_date', endDate.toISOString())

            const { data: prevReceipts } = await supabase.from('accounts_receivable').select('total_amount').eq('status', 'pago').lt('payment_date', startDate.toISOString())
            const { data: prevExpenses } = await supabase.from('accounts_payable').select('amount').eq('status', 'pago').lt('payment_date', startDate.toISOString())

            const totalPrevRevenue = prevReceipts?.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0) || 0
            const totalPrevExpenses = prevExpenses?.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) || 0
            const previousBalance = totalPrevRevenue - totalPrevExpenses

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
        <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', padding: '20px', fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>

            {/* Controles */}
            <div className="no-print" style={{ maxWidth: '1280px', margin: '0 auto 24px auto', backgroundColor: 'white', padding: '16px 24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <strong style={{ color: '#4b5563', fontSize: '14px' }}>REFERÊNCIA:</strong>
                    <input type="month" value={referenceMonth} onChange={e => setReferenceMonth(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', outline: 'none', color: '#374151' }} />
                </div>
                <button onClick={() => window.print()} style={{ backgroundColor: '#111827', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                    <Icons.Print /> IMPRIMIR PDF
                </button>
            </div>

            {/* DOCUMENTO WIDESCREEN */}
            <div className="report-sheet" style={{
                maxWidth: '1280px',
                width: '100%',
                minHeight: '297mm',
                margin: '0 auto',
                backgroundColor: 'white',
                padding: '40px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
                {loading || !reportData ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>Processando dados financeiros...</div>
                ) : (
                    <>
                        {/* CABEÇALHO */}
                        <div style={{ borderBottom: '2px solid #111827', paddingBottom: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
                            <div>
                                <h1 style={{ margin: '0', fontSize: '24px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Condomínio Residencial</h1>
                                <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px', letterSpacing: '0.5px' }}>DEMONSTRATIVO FINANCEIRO E DE COMPLIANCE</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Período de Referência</div>
                                <div style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginTop: '2px' }}>{monthLabel}</div>
                            </div>
                        </div>

                        {/* CARDS KPI */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '40px' }}>
                            <div style={{ backgroundColor: '#f0fdf4', padding: '24px', borderRadius: '8px', borderLeft: '4px solid #16a34a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#166534', letterSpacing: '0.5px' }}>Total Receitas</span>
                                    <span style={{ color: '#16a34a' }}><Icons.Revenue /></span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#14532d', fontFamily: 'monospace' }}>{formatCurrency(reportData.summary.revenue)}</div>
                            </div>
                            <div style={{ backgroundColor: '#fef2f2', padding: '24px', borderRadius: '8px', borderLeft: '4px solid #dc2626' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#991b1b', letterSpacing: '0.5px' }}>Total Despesas</span>
                                    <span style={{ color: '#dc2626' }}><Icons.Expense /></span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#7f1d1d', fontFamily: 'monospace' }}>{formatCurrency(reportData.summary.expenses)}</div>
                            </div>
                            <div style={{ backgroundColor: '#eff6ff', padding: '24px', borderRadius: '8px', borderLeft: '4px solid #2563eb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#1e40af', letterSpacing: '0.5px' }}>Saldo Caixa</span>
                                    <span style={{ color: '#2563eb' }}><Icons.Balance /></span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: reportData.summary.balance >= 0 ? '#1e3a8a' : '#991b1b', fontFamily: 'monospace' }}>
                                    {formatCurrency(reportData.summary.balance)}
                                </div>
                            </div>
                            <div style={{ backgroundColor: '#fff7ed', padding: '24px', borderRadius: '8px', borderLeft: '4px solid #d97706' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#9a3412', letterSpacing: '0.5px' }}>Inadimplência</span>
                                    <span style={{ color: '#d97706' }}><Icons.Default /></span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#7c2d12', fontFamily: 'monospace' }}>{formatCurrency(reportData.summary.defaults)}</div>
                            </div>
                        </div>

                        {/* COLUNAS LADO A LADO */}
                        <div style={{ display: 'flex', gap: '48px', marginBottom: '40px' }}>
                            {/* Receitas */}
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #22c55e', paddingBottom: '12px', marginBottom: '20px' }}>
                                    ENTRADAS (RECEITAS)
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                                            <th style={{ padding: '8px 4px', textAlign: 'left' }}>Data</th>
                                            <th style={{ padding: '8px 4px', textAlign: 'left' }}>Descrição</th>
                                            <th style={{ padding: '8px 4px', textAlign: 'right' }}>Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.receipts.map((r) => (
                                            <tr key={r.id}>
                                                <td style={{ padding: '12px 4px', color: '#475569' }}>{formatDate(r.payment_date)}</td>
                                                <td style={{ padding: '12px 4px' }}>
                                                    <div style={{ fontWeight: '500', color: '#1e293b' }}>{r.description}</div>
                                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{r.residents?.unit_number} - {r.residents?.name}</div>
                                                </td>
                                                <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: '500', color: '#334155' }}>
                                                    {formatCurrency(r.total_amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan="2" style={{ paddingTop: '16px', fontWeight: 'bold', color: '#111827', fontSize: '13px' }}>Total Entradas</td>
                                            <td style={{ paddingTop: '16px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '14px' }}>{formatCurrency(reportData.summary.revenue)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Despesas */}
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #ef4444', paddingBottom: '12px', marginBottom: '20px' }}>
                                    SAÍDAS (DESPESAS)
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                                            <th style={{ padding: '8px 4px', textAlign: 'left' }}>Data</th>
                                            <th style={{ padding: '8px 4px', textAlign: 'left' }}>Descrição</th>
                                            <th style={{ padding: '8px 4px', textAlign: 'right' }}>Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.expenses.map((e) => (
                                            <tr key={e.id}>
                                                <td style={{ padding: '12px 4px', color: '#475569' }}>{formatDate(e.payment_date)}</td>
                                                <td style={{ padding: '12px 4px' }}>
                                                    <div style={{ fontWeight: '500', color: '#1e293b' }}>{e.description}</div>
                                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{e.category}</div>
                                                </td>
                                                <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: '500', color: '#334155' }}>
                                                    {formatCurrency(e.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan="2" style={{ paddingTop: '16px', fontWeight: 'bold', color: '#111827', fontSize: '13px' }}>Total Saídas</td>
                                            <td style={{ paddingTop: '16px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: '14px' }}>{formatCurrency(reportData.summary.expenses)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* INADIMPLÊNCIA ACUMULADA */}
                        <div style={{ marginTop: '40px', pageBreakInside: 'avoid' }}>
                            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', padding: '0 0 0 0', overflow: 'hidden' }}>
                                {/* Header da Inadimplência */}
                                <div style={{ padding: '24px 32px' }}>
                                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#9a3412', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        ⚠️ DEMONSTRATIVO DE INADIMPLÊNCIA ACUMULADA
                                    </h3>
                                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                                        Relação de unidades em aberto até a data de emissão deste documento.
                                    </div>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead style={{ backgroundColor: '#ffedd5', color: '#9a3412' }}>
                                        <tr>
                                            <th style={{ padding: '12px 32px', textAlign: 'left', width: '15%' }}>Unidade</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'left', width: '35%' }}>Morador</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'left', width: '25%' }}>Vencimento</th>
                                            <th style={{ padding: '12px 32px', textAlign: 'right', width: '25%' }}>Valor Pendente</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ backgroundColor: 'white' }}>
                                        {reportData.defaulters.map(d => (
                                            <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '16px 32px', fontWeight: 'bold', color: '#1f2937' }}>{d.residents?.unit_number}</td>
                                                <td style={{ padding: '16px 12px', color: '#374151' }}>{d.residents?.name}</td>
                                                <td style={{ padding: '16px 12px', color: '#dc2626' }}>
                                                    {formatDate(d.due_date)}
                                                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>({d.daysLate} dias)</span>
                                                </td>
                                                <td style={{ padding: '16px 32px', textAlign: 'right', fontWeight: 'bold', color: '#1f2937' }}>
                                                    {formatCurrency(d.calculatedTotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {/* FOOTER BARRA CORRIDA EXATAMENTE COMO NA IMAGEM */}
                                    <tfoot style={{ backgroundColor: '#fff7ed' }}>
                                        <tr>
                                            <td colSpan="4" style={{ padding: '16px 32px', textAlign: 'right' }}>
                                                <span style={{ fontWeight: 'bold', color: '#9a3412', marginRight: '8px' }}>Total Inadimplência:</span>
                                                <span style={{ fontWeight: 'bold', color: '#c2410c', fontSize: '14px' }}>{formatCurrency(reportData.summary.defaults)}</span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Technical Footer */}
                        <div style={{ marginTop: '40px', borderTop: '1px solid #e5e7eb', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
                            <div>CONDOMANAGER SYSTEM VER. 2.0</div>
                            <div>RELATÓRIO GERADO AUTOMATICAMENTE EM {new Date().toLocaleDateString()} ÁS {new Date().toLocaleTimeString()}</div>
                            <div>DOCUMENTO DE AUDITORIA INTERNA</div>
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .report-sheet { 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                        width: 100% !important; 
                        max-width: none !important; 
                        padding: 0 !important; 
                    }
                }
            `}</style>
        </div>
    )
}
