import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// --- ÍCONES SVG PARA UM TOQUE PREMIUM ---
const Icons = {
    Revenue: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#059669' }}>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
            <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
    ),
    Expense: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#dc2626' }}>
            <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
            <polyline points="17 18 23 18 23 12"></polyline>
        </svg>
    ),
    Balance: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2563eb' }}>
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
        </svg>
    ),
    Alert: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#d97706' }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
    ),
    Print: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
    )
}

// Utilitários de Formatação
const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value || 0)
}

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

            // 1. Receitas do Mês
            const { data: receipts } = await supabase
                .from('accounts_receivable')
                .select('*, residents(name, unit_number)')
                .eq('status', 'pago')
                .gte('payment_date', startDate.toISOString())
                .lte('payment_date', endDate.toISOString())

            // 2. Despesas do Mês
            const { data: expenses } = await supabase
                .from('accounts_payable')
                .select('*')
                .eq('status', 'pago')
                .gte('payment_date', startDate.toISOString())
                .lte('payment_date', endDate.toISOString())

            // 3. Saldo Anterior (Acumulado Histórico)
            const { data: prevReceipts } = await supabase
                .from('accounts_receivable')
                .select('total_amount')
                .eq('status', 'pago')
                .lt('payment_date', startDate.toISOString())

            const { data: prevExpenses } = await supabase
                .from('accounts_payable')
                .select('amount')
                .eq('status', 'pago')
                .lt('payment_date', startDate.toISOString())

            const totalPrevRevenue = prevReceipts?.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0) || 0
            const totalPrevExpenses = prevExpenses?.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) || 0
            const previousBalance = totalPrevRevenue - totalPrevExpenses

            // 4. Inadimplência
            const todayStr = new Date().toISOString().split('T')[0]
            const { data: defaulters } = await supabase
                .from('accounts_receivable')
                .select('*, residents(name, unit_number, block)')
                .lt('due_date', todayStr)
                .neq('status', 'pago')
                .order('due_date')

            const totalRevenue = receipts?.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0) || 0
            const totalExpenses = expenses?.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) || 0

            const processedDefaulters = (defaulters || []).map(bill => {
                const amount = Number(bill.total_amount) || 0
                const dueDate = new Date(bill.due_date)
                const now = new Date()
                const daysLate = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))

                if (daysLate <= 0) return { ...bill, calculatedTotal: amount, daysLate: 0 }

                const fine = amount * 0.02
                const interest = amount * (0.000333 * daysLate)
                return {
                    ...bill,
                    calculatedTotal: amount + fine + interest,
                    daysLate
                }
            })

            const totalDefaults = processedDefaulters.reduce((acc, curr) => acc + curr.calculatedTotal, 0)
            const currentBalance = previousBalance + totalRevenue - totalExpenses

            setReportData({
                receipts: receipts || [],
                expenses: expenses || [],
                defaulters: processedDefaulters,
                summary: {
                    revenue: totalRevenue,
                    expenses: totalExpenses,
                    balance: currentBalance,
                    defaults: totalDefaults
                }
            })

        } catch (error) {
            console.error('Erro no relatório:', error)
            toast.error('Erro na geração do relatório.')
        } finally {
            setLoading(false)
        }
    }

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    const [y, m] = referenceMonth.split('-')
    const monthLabel = `${monthNames[parseInt(m) - 1]} de ${y}`

    return (
        <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', padding: '40px 20px', fontFamily: "'Inter', sans-serif" }}>

            {/* BARRA DE CONTROLE (Não Imprime) */}
            <div className="no-print" style={{
                maxWidth: '210mm',
                margin: '0 auto 24px auto',
                backgroundColor: 'white',
                padding: '16px 24px',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>📅 Período de Referência:</div>
                    <input
                        type="month"
                        value={referenceMonth}
                        onChange={e => setReferenceMonth(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', color: '#1f2937', outline: 'none' }}
                    />
                </div>
                <button
                    onClick={() => window.print()}
                    style={{
                        backgroundColor: '#111827',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'opacity 0.2s'
                    }}
                >
                    <Icons.Print /> Imprimir / PDF
                </button>
            </div>

            {/* FOLHA A4 DO RELATÓRIO */}
            <div className="report-sheet" style={{
                maxWidth: '210mm',
                minHeight: '297mm', // Altura A4
                margin: '0 auto',
                backgroundColor: 'white',
                padding: '40px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                position: 'relative'
            }}>

                {loading || !reportData ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: '#9ca3af' }}>
                        Processando Auditoria...
                    </div>
                ) : (
                    <>
                        {/* CABEÇALHO PREMIUM */}
                        <div style={{ borderBottom: '2px solid #111827', paddingBottom: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px', color: '#111827' }}>CONDOMÍNIO RESIDENCIAL</h1>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic' }}>Relatório de Gestão Financeira & Compliance</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: '600', letterSpacing: '1px' }}>Referência</div>
                                <div style={{ fontSize: '18px', fontWeight: '600', color: '#374151' }}>{monthLabel}</div>
                            </div>
                        </div>

                        {/* CARDS DE KPI MINIMALISTAS */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '40px' }}>
                            {/* Receitas */}
                            <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', borderTop: '4px solid #059669', backgroundColor: '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Receitas</span>
                                    <Icons.Revenue />
                                </div>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: '#064e3b', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(reportData.summary.revenue)}
                                </div>
                            </div>

                            {/* Despesas */}
                            <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', borderTop: '4px solid #dc2626', backgroundColor: '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Despesas</span>
                                    <Icons.Expense />
                                </div>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: '#7f1d1d', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(reportData.summary.expenses)}
                                </div>
                            </div>

                            {/* Saldo */}
                            <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', borderTop: '4px solid #2563eb', backgroundColor: '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Saldo Atual</span>
                                    <Icons.Balance />
                                </div>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: reportData.summary.balance >= 0 ? '#1e3a8a' : '#991b1b', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(reportData.summary.balance)}
                                </div>
                            </div>

                            {/* Inadimplência */}
                            <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', borderTop: '4px solid #d97706', backgroundColor: '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Inadimplência</span>
                                    <Icons.Alert />
                                </div>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: '#92400e', letterSpacing: '-0.5px' }}>
                                    {formatCurrency(reportData.summary.defaults)}
                                </div>
                            </div>
                        </div>

                        {/* TABELAS LADO A LADO */}
                        <div style={{ display: 'flex', gap: '32px', marginBottom: '40px' }}>
                            {/* Receitas */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#059669', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px', borderBottom: '1px solid #d1fae5', paddingBottom: '8px' }}>
                                    Detalhamento de Entradas
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {reportData.receipts.map((r, i) => (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '8px 0', fontSize: '13px', color: '#374151', width: '20%' }}>{formatDate(r.payment_date)}</td>
                                                <td style={{ padding: '8px 0', fontSize: '13px', color: '#111827', fontWeight: '500' }}>
                                                    {r.description}
                                                    <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'normal' }}>{r.residents?.unit_number} - {r.residents?.name}</div>
                                                </td>
                                                <td style={{ padding: '8px 0', fontSize: '13px', color: '#374151', textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {formatCurrency(r.total_amount)}
                                                </td>
                                            </tr>
                                        ))}
                                        {reportData.receipts.length === 0 && (
                                            <tr><td colSpan="3" style={{ padding: '12px 0', fontSize: '13px', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>Nenhum registro no período.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Despesas */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px', borderBottom: '1px solid #fee2e2', paddingBottom: '8px' }}>
                                    Detalhamento de Saídas
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {reportData.expenses.map((e, i) => (
                                            <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '8px 0', fontSize: '13px', color: '#374151', width: '20%' }}>{formatDate(e.payment_date)}</td>
                                                <td style={{ padding: '8px 0', fontSize: '13px', color: '#111827', fontWeight: '500' }}>
                                                    {e.description}
                                                    <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'normal' }}>{e.category}</div>
                                                </td>
                                                <td style={{ padding: '8px 0', fontSize: '13px', color: '#374151', textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {formatCurrency(e.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                        {reportData.expenses.length === 0 && (
                                            <tr><td colSpan="3" style={{ padding: '12px 0', fontSize: '13px', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>Nenhum registro no período.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* INADIMPLÊNCIA SECTION */}
                        <div style={{ marginTop: '48px', pageBreakInside: 'avoid' }}>
                            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', padding: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ backgroundColor: '#d97706', borderRadius: '50%', width: '8px', height: '8px' }}></div>
                                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#92400e', textTransform: 'uppercase' }}>Inadimplência Acumulada</h3>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#b45309', backgroundColor: '#ffedd5', padding: '4px 12px', borderRadius: '12px' }}>
                                        Atualizado com Juros & Multa
                                    </div>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                                    <thead style={{ fontSize: '11px', color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        <tr>
                                            <th style={{ textAlign: 'left', paddingBottom: '12px' }}>Unidade</th>
                                            <th style={{ textAlign: 'left', paddingBottom: '12px' }}>Responsável</th>
                                            <th style={{ textAlign: 'left', paddingBottom: '12px' }}>Vencimento</th>
                                            <th style={{ textAlign: 'right', paddingBottom: '12px' }}>Valor Atualizado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.defaulters.map(d => (
                                            <tr key={d.id}>
                                                <td style={{ borderBottom: '1px solid #FED7AA', padding: '12px 0', fontSize: '13px', fontWeight: '700', color: '#92400e' }}>{d.residents?.unit_number}</td>
                                                <td style={{ borderBottom: '1px solid #FED7AA', padding: '12px 0', fontSize: '13px', color: '#431407' }}>{d.residents?.name}</td>
                                                <td style={{ borderBottom: '1px solid #FED7AA', padding: '12px 0', fontSize: '13px', color: '#c2410c' }}>
                                                    {formatDate(d.due_date)}
                                                    <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '6px' }}>({d.daysLate}d)</span>
                                                </td>
                                                <td style={{ borderBottom: '1px solid #FED7AA', padding: '12px 0', fontSize: '13px', fontWeight: '700', color: '#7c2d12', textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {formatCurrency(d.calculatedTotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* RODAPÉ DO DOCUMENTO */}
                        <div style={{ position: 'absolute', bottom: '40px', left: '40px', right: '40px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>Sistema de Gestão CondoManager</div>
                            <div style={{ fontSize: '10px', color: '#d1d5db' }}>Página 1 de 1</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>Emitido em: {new Date().toLocaleDateString()}</div>
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @media print {
                    @page { margin: 0; size: A4; }
                    body { background: white; margin: 0; padding: 0; }
                    .no-print { display: none !important; }
                    .report-sheet { 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                        padding: 15mm !important; /* Margem segura para impressão */
                        width: 100% !important;
                        max-width: none !important;
                        min-height: 100vh !important;
                    }
                    /* Força a impressão exata das cores de fundo */
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
        </div>
    )
}
