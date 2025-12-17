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

            // Construção manual das datas para evitar problemas de fuso horário (UTC vs Local)
            const startDateStr = `${year}-${month}-01`

            // Cálculo do último dia do mês para a string final
            const lastDay = new Date(year, month, 0).getDate()
            const endDateStr = `${year}-${month}-${lastDay} 23:59:59`

            // Buscando dados do mês atual (RECEITAS e DESPESAS)
            // Usamos strings diretas que o Supabase entende sem converter timezone
            // Buscando TODOS os pagamentos para filtrar no JS (estratégia mais robusta para corrigir erros de lançamento de data)
            const { data: allReceipts } = await supabase
                .from('accounts_receivable')
                .select('total_amount, payment_date, due_date, description, status')
                .eq('status', 'pago')

            const { data: allExpenses } = await supabase
                .from('accounts_payable')
                .select('amount, payment_date, due_date, description, status')
                .eq('status', 'pago')

            // --- LÓGICA INTELIGENTE DE CAIXA ---
            // Processa o Saldo Anterior considerando:
            // 1. Pagamento Realizado ANTES do dia 01 (Regime de Caixa Oficial)
            // 2. OU Itens de "SALDO" corrigidos (Se a descrição for SALDO e o Vencimento for Antigo, consideramos como anterior mesmo que o usuário tenha errado a data de pagamento para hoje)

            const calculatePreviousBalance = (allItems, isExpense) => {
                return (allItems || []).reduce((acc, item) => {
                    const payDate = item.payment_date ? item.payment_date.slice(0, 10) : ''
                    const dueDate = item.due_date ? item.due_date.slice(0, 10) : ''
                    const amount = Number(isExpense ? item.amount : item.total_amount) || 0

                    // Regra 1: Pagamento foi mês passado?
                    if (payDate < startDateStr) return acc + amount

                    // Regra 2: Correção para "SALDO INICIAL" lançado errado
                    // Se o usuário lançou "Saldo" com vencimento mês passado, mas deu baixa hoje, consideramos mês passado.
                    const isBalanceItem = item.description?.toUpperCase().includes('SALDO')
                    if (isBalanceItem && dueDate < startDateStr) return acc + amount

                    return acc
                }, 0)
            }

            const totalPrevRevenue = calculatePreviousBalance(allReceipts, false)
            const totalPrevExpenses = calculatePreviousBalance(allExpenses, true)

            // --- CÁLCULO DO MÊS ATUAL ---
            // Somente o que cai estritamente dentro deste mês (e que não foi capturado como Saldo Anterior)
            const calculateCurrentMonth = (allItems, isExpense) => {
                return (allItems || []).reduce((acc, item) => {
                    const payDate = item.payment_date ? item.payment_date.slice(0, 10) : ''
                    const dueDate = item.due_date ? item.due_date.slice(0, 10) : ''
                    const amount = Number(isExpense ? item.amount : item.total_amount) || 0

                    // Se já foi contado como saldo anterior pela lógica acima, ignoramos aqui para não duplicar
                    const isBalanceItem = item.description?.toUpperCase().includes('SALDO')
                    if (payDate < startDateStr) return acc; // Já é passado
                    if (isBalanceItem && dueDate < startDateStr) return acc; // Já contado como passado

                    // Se está dentro do range do mês atual
                    if (payDate >= startDateStr && payDate <= endDateStr.slice(0, 10)) return acc + amount

                    return acc
                }, 0)
            }

            const totalRevenue = calculateCurrentMonth(allReceipts, false)
            const totalExpenses = calculateCurrentMonth(allExpenses, true)

            // Re-filtrar listas para exibição nas tabelas (apenas itens do mês)
            const currentReceiptsDisplay = (allReceipts || []).filter(item => {
                const payDate = item.payment_date ? item.payment_date.slice(0, 10) : ''
                const dueDate = item.due_date ? item.due_date.slice(0, 10) : ''
                const isBalanceItem = item.description?.toUpperCase().includes('SALDO')
                if (payDate < startDateStr) return false
                if (isBalanceItem && dueDate < startDateStr) return false
                return payDate >= startDateStr && payDate <= endDateStr.slice(0, 10)
            })

            const currentExpensesDisplay = (allExpenses || []).filter(item => {
                const payDate = item.payment_date ? item.payment_date.slice(0, 10) : ''
                const dueDate = item.due_date ? item.due_date.slice(0, 10) : ''
                const isBalanceItem = item.description?.toUpperCase().includes('SALDO')
                if (payDate < startDateStr) return false
                if (isBalanceItem && dueDate < startDateStr) return false
                return payDate >= startDateStr && payDate <= endDateStr.slice(0, 10)
            })

            // Precisamos dos dados completos (residents) para a tabela de exibição
            // Como fiz select simplificado acima, vou buscar o completo dos itens filtrados ou usar a lógica anterior apenas para exibição
            // Para simplificar e não quebrar o layout, farei a busca completa normal para a renderização da TABELA, 
            // mas usarei os TOTAIS calculados acima para o Card de Saldo.

            // BUSCA PARA TABELAS (Apenas mês atual, sem a logica de Saldo)
            const { data: displayReceipts } = await supabase.from('accounts_receivable').select('*, residents(name, unit_number)').eq('status', 'pago').gte('payment_date', startDateStr).lte('payment_date', endDateStr)
            const { data: displayExpenses } = await supabase.from('accounts_payable').select('*').eq('status', 'pago').gte('payment_date', startDateStr).lte('payment_date', endDateStr)

            // CORREÇÃO: Remover "SALDO" das tabelas de Entradas se ele foi jogado pro passado
            const finalDisplayReceipts = (displayReceipts || []).filter(r => {
                const isBalance = r.description?.toUpperCase().includes('SALDO')
                const dueOld = r.due_date < startDateStr
                return !(isBalance && dueOld) // Oculta da lista do mês se for saldo antigo
            })
            const previousBalance = totalPrevRevenue - totalPrevExpenses

            const todayStr = new Date().toISOString().split('T')[0]
            const { data: defaulters } = await supabase.from('accounts_receivable').select('*, residents(name, unit_number, block)').lt('due_date', todayStr).neq('status', 'pago').order('due_date')

            // Totais já foram calculados nas funções acima (calculateCurrentMonth), então usamos eles direto.
            const currentBalance = previousBalance + totalRevenue - totalExpenses

            const processedDefaulters = (defaulters || []).map(bill => {
                const amount = Number(bill.total_amount) || 0
                const dueDate = new Date(bill.due_date)
                const now = new Date()
                const daysLate = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))

                if (daysLate <= 0) return {
                    ...bill,
                    original: amount,
                    fine: 0,
                    interest: 0,
                    calculatedTotal: amount,
                    daysLate: 0
                }

                // Cálculo Analítico
                const fine = amount * 0.02 // Multa 2%
                const interestRate = 0.000333 // Aprox 1% ao mês / 30 dias
                const interest = amount * (interestRate * daysLate) // Juros compostos simples p/ dias corridos
                const total = amount + fine + interest

                return {
                    ...bill,
                    original: amount,
                    fine: fine,
                    interest: interest,
                    calculatedTotal: total,
                    daysLate
                }
            })

            const totalDefaults = processedDefaulters.reduce((acc, curr) => acc + curr.calculatedTotal, 0)

            setReportData({
                receipts: finalDisplayReceipts || [], // Usando a lista filtrada (sem saldo "falso")
                expenses: displayExpenses || [],
                defaulters: processedDefaulters,
                summary: {
                    revenue: totalRevenue,
                    expenses: totalExpenses,
                    balance: currentBalance,
                    defaults: totalDefaults
                }
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
                                            <th style={{ padding: '10px 4px', textAlign: 'left' }}>Data</th>
                                            <th style={{ padding: '10px 4px', textAlign: 'left' }}>Descrição</th>
                                            <th style={{ padding: '10px 4px', textAlign: 'right' }}>Valor</th>
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
                                            <td colSpan="2" style={{ paddingTop: '16px', textAlign: 'right', paddingRight: '16px', fontWeight: 'bold', color: '#111827', fontSize: '13px', textTransform: 'uppercase' }}>Total Entradas</td>
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
                                            <th style={{ padding: '10px 4px', textAlign: 'left' }}>Data</th>
                                            <th style={{ padding: '10px 4px', textAlign: 'left' }}>Descrição</th>
                                            <th style={{ padding: '10px 4px', textAlign: 'right' }}>Valor</th>
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
                                            <td colSpan="2" style={{ paddingTop: '16px', textAlign: 'right', paddingRight: '16px', fontWeight: 'bold', color: '#111827', fontSize: '13px', textTransform: 'uppercase' }}>Total Saídas</td>
                                            <td style={{ paddingTop: '16px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: '14px' }}>{formatCurrency(reportData.summary.expenses)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* INADIMPLÊNCIA ACUMULADA ANALÍTICA */}
                        <div style={{ marginTop: '40px', pageBreakInside: 'avoid' }}>
                            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', padding: '0 0 0 0', overflow: 'hidden' }}>
                                {/* Header da Inadimplência */}
                                <div style={{ padding: '24px 32px' }}>
                                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#9a3412', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        ⚠️ DEMONSTRATIVO ANALÍTICO DE DÉBITOS
                                    </h3>
                                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                                        Correção Monetária: Multa de 2% sobre o valor original + Juros de mora de 1% a.m (0,033% a.dia)
                                    </div>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead style={{ backgroundColor: '#ffedd5', color: '#9a3412', borderBottom: '2px solid #fdba74' }}>
                                        <tr>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', width: '8%', textTransform: 'uppercase', fontSize: '11px' }}>Unidade</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'left', width: '22%', textTransform: 'uppercase', fontSize: '11px' }}>Morador / Bloco</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'center', width: '12%', textTransform: 'uppercase', fontSize: '11px' }}>Vencimento</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'right', width: '14%', textTransform: 'uppercase', fontSize: '11px', borderRight: '1px solid #ffd8a8' }}>Valor Original</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'right', width: '12%', textTransform: 'uppercase', fontSize: '11px', color: '#c2410c' }}>Multa (2%)</th>
                                            <th style={{ padding: '12px 12px', textAlign: 'right', width: '12%', textTransform: 'uppercase', fontSize: '11px', color: '#c2410c', borderRight: '1px solid #ffd8a8' }}>Juros Mora</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right', width: '20%', textTransform: 'uppercase', fontSize: '11px' }}>Total Classificado</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ backgroundColor: 'white' }}>
                                        {reportData.defaulters.map((d, index) => (
                                            <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: index % 2 === 0 ? 'white' : '#fffaf0' }}>
                                                <td style={{ padding: '10px 16px', fontWeight: 'bold', color: '#1f2937' }}>{d.residents?.unit_number}</td>
                                                <td style={{ padding: '10px 12px', color: '#374151' }}>
                                                    <div style={{ fontWeight: '600' }}>{d.residents?.name}</div>
                                                    <div style={{ fontSize: '10px', color: '#6b7280' }}>{d.residents?.block ? `Bloco ${d.residents.block}` : ''}</div>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                    <div style={{ color: '#dc2626', fontWeight: '500' }}>{formatDate(d.due_date)}</div>
                                                    <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#ef4444', marginTop: '2px', backgroundColor: '#fee2e2', display: 'inline-block', padding: '1px 6px', borderRadius: '4px' }}>
                                                        {d.daysLate} DIAS
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#4b5563', fontFamily: 'monospace', fontSize: '13px', fontWeight: '500', borderRight: '1px solid #f3f4f6' }}>
                                                    {formatCurrency(d.original)}
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706', fontFamily: 'monospace', fontSize: '13px' }}>
                                                    {formatCurrency(d.fine)}
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706', fontFamily: 'monospace', fontSize: '13px', borderRight: '1px solid #f3f4f6' }}>
                                                    {formatCurrency(d.interest)}
                                                </td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', color: '#9a3412', fontSize: '14px', fontFamily: 'monospace' }}>
                                                    {formatCurrency(d.calculatedTotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {/* FOOTER BARRA CORRIDA */}
                                    <tfoot style={{ backgroundColor: '#ffedd5', borderTop: '2px solid #fdba74' }}>
                                        <tr>
                                            <td colSpan="3" style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 'bold', color: '#9a3412', textTransform: 'uppercase', fontSize: '11px' }}>
                                                TOTAIS GERAIS ACUMULADOS
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 'bold', color: '#4b5563', fontFamily: 'monospace', borderRight: '1px solid #ffd8a8' }}>
                                                {formatCurrency(reportData.defaulters.reduce((acc, d) => acc + d.original, 0))}
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 'bold', color: '#d97706', fontFamily: 'monospace' }}>
                                                {formatCurrency(reportData.defaulters.reduce((acc, d) => acc + d.fine, 0))}
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 'bold', color: '#d97706', fontFamily: 'monospace', borderRight: '1px solid #ffd8a8' }}>
                                                {formatCurrency(reportData.defaulters.reduce((acc, d) => acc + d.interest, 0))}
                                            </td>
                                            <td style={{ padding: '16px 16px', textAlign: 'right', fontWeight: '800', color: '#c2410c', fontSize: '15px', fontFamily: 'monospace' }}>
                                                {formatCurrency(reportData.summary.defaults)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* QUADRO DE RESUMO CONTÁBIL (CONCILIAÇÃO) */}
                        <div style={{ marginTop: '32px', pageBreakInside: 'avoid', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '24px', backgroundColor: '#f9fafb' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                📊 Resumo Contábil & Conciliação
                            </h3>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                <div style={{ textAlign: 'center', flex: 1 }}>
                                    <div style={{ color: '#6b7280', marginBottom: '4px', fontWeight: '500' }}>SALDO ANTERIOR</div>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151' }}>{formatCurrency(reportData.summary.balance - reportData.summary.revenue + reportData.summary.expenses)}</div>
                                </div>
                                <div style={{ color: '#9ca3af', fontWeight: 'bold', fontSize: '18px' }}>+</div>
                                <div style={{ textAlign: 'center', flex: 1 }}>
                                    <div style={{ color: '#166534', marginBottom: '4px', fontWeight: '500' }}>TOTAL ENTRADAS</div>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#16a34a' }}>{formatCurrency(reportData.summary.revenue)}</div>
                                </div>
                                <div style={{ color: '#9ca3af', fontWeight: 'bold', fontSize: '18px' }}>-</div>
                                <div style={{ textAlign: 'center', flex: 1 }}>
                                    <div style={{ color: '#991b1b', marginBottom: '4px', fontWeight: '500' }}>TOTAL SAÍDAS</div>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>{formatCurrency(reportData.summary.expenses)}</div>
                                </div>
                                <div style={{ color: '#374151', fontWeight: 'bold', fontSize: '18px' }}>=</div>
                                <div style={{ textAlign: 'center', flex: 1, backgroundColor: '#eff6ff', padding: '12px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                    <div style={{ color: '#1e40af', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11px' }}>SALDO ATUAL TRANSPORTADO</div>
                                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#1e3a8a' }}>{formatCurrency(reportData.summary.balance)}</div>
                                </div>
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
