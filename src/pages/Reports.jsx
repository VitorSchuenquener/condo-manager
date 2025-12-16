import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Função simples de formatação de moeda
const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value || 0)
}

// Função simples de formatação de data (DD/MM/YYYY)
const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    // Ajuste de fuso horário simples (adiciona minutos do timezone)
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

            // Datas limites para filtrar o MÊS ATUAL
            const startDate = new Date(year, month - 1, 1)
            const endDate = new Date(year, month, 0, 23, 59, 59) // Último dia do mês

            // 1. Buscar Receitas do Mês (Pagas)
            const { data: receipts, error: rError } = await supabase
                .from('accounts_receivable')
                .select('*, residents(name, unit_number)')
                .eq('status', 'pago')
                .gte('payment_date', startDate.toISOString())
                .lte('payment_date', endDate.toISOString())

            if (rError) throw rError

            // 2. Buscar Despesas do Mês (Pagas)
            const { data: expenses, error: eError } = await supabase
                .from('accounts_payable')
                .select('*')
                .eq('status', 'pago')
                .gte('payment_date', startDate.toISOString())
                .lte('payment_date', endDate.toISOString())

            if (eError) throw eError

            // 3. RECUPERAR SALDO ANTERIOR (O Segredo do Valor Correto)
            // Busca tudo que foi pago ANTES do inicio deste mes para somar o caixa acumulado
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

            // 4. Inadimplência TOTAL (Acumulada até hoje)
            const todayStr = new Date().toISOString().split('T')[0]
            const { data: defaulters, error: dError } = await supabase
                .from('accounts_receivable')
                .select('*, residents(name, unit_number, block)')
                .lt('due_date', todayStr)
                .neq('status', 'pago')
                .order('due_date')

            if (dError) throw dError

            // Processar valores
            const totalRevenue = receipts?.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0) || 0
            const totalExpenses = expenses?.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) || 0

            // Processar inadimplência com multa e juros
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

            // O Saldo Caixa deve ser o Acumulado (Anterior + Receitas Mês - Despesas Mês)
            const currentBalance = previousBalance + totalRevenue - totalExpenses

            setReportData({
                receipts: receipts || [],
                expenses: expenses || [],
                defaulters: processedDefaulters,
                summary: {
                    revenue: totalRevenue,
                    expenses: totalExpenses,
                    // Aqui decidimos: Queremos mostrar o saldo SÓ DO MÊS ou ACUMULADO?
                    // Pela imagem "Saldo Caixa", infere-se acumulado ou fluxo.
                    // Se o usuário reclamou de "zero", ele quer ver dinheiro na conta.
                    balance: currentBalance,
                    defaults: totalDefaults
                }
            })

        } catch (error) {
            console.error('Erro no relatório:', error)
            toast.error('Erro ao carregar dados. Tente recarregar.')
        } finally {
            setLoading(false)
        }
    }

    const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    const [y, m] = referenceMonth.split('-')
    const monthLabel = `${monthNames[parseInt(m) - 1]} de ${y}`

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
                <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', textTransform: 'uppercase', color: '#111827' }}>
                    Condomínio Residencial
                </h1>
                <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'normal', color: '#4b5563' }}>
                    Demonstrativo Financeiro & Inadimplência
                </h2>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    Referência: <strong>{monthLabel}</strong>
                </div>
            </div>

            {/* Configuração (Não Impressão) */}
            <div className="no-print" style={{ marginBottom: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#6b7280', marginBottom: '4px' }}>Mês de Referência</label>
                    <input
                        type="month"
                        value={referenceMonth}
                        onChange={e => setReferenceMonth(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                    />
                </div>
                <button
                    onClick={() => window.print()}
                    style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    🖨️ Imprimir Oficial (PDF)
                </button>
            </div>

            {loading || !reportData ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Carregando balancete...</div>
            ) : (
                <>
                    {/* Cards KPIs (Layout Imagem 2) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>

                        {/* 1. Receitas */}
                        <div style={{ backgroundColor: '#f0fdf4', padding: '20px', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#15803d', marginBottom: '4px' }}>Total Receitas</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#166534' }}>
                                {formatCurrency(reportData.summary.revenue)}
                            </div>
                        </div>

                        {/* 2. Despesas */}
                        <div style={{ backgroundColor: '#fef2f2', padding: '20px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#b91c1c', marginBottom: '4px' }}>Total Despesas</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#991b1b' }}>
                                {formatCurrency(reportData.summary.expenses)}
                            </div>
                        </div>

                        {/* 3. Saldo Caixa (Azul) */}
                        <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '4px', border: '1px solid #dbeafe' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#1d4ed8', marginBottom: '4px' }}>Saldo Caixa</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: reportData.summary.balance >= 0 ? '#1e40af' : '#dc2626' }}>
                                {formatCurrency(reportData.summary.balance)}
                            </div>
                        </div>

                        {/* 4. Inadimplência (Laranja) */}
                        <div style={{ backgroundColor: '#fff7ed', padding: '20px', borderRadius: '4px', border: '1px solid #ffedd5' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#c2410c', marginBottom: '4px' }}>Inadimplência</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ea580c' }}>
                                {formatCurrency(reportData.summary.defaults)}
                            </div>
                        </div>
                    </div>

                    {/* Tabelas Lado a Lado */}
                    <div style={{ display: 'flex', gap: '40px', marginBottom: '40px' }}>
                        {/* Tabela Receitas */}
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '14px', color: '#166534', borderBottom: '2px solid #22c55e', paddingBottom: '8px', marginBottom: '16px', textTransform: 'uppercase' }}>
                                Entradas (Receitas)
                            </h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ color: '#6b7280', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                        <th style={{ padding: '8px 4px' }}>Data</th>
                                        <th style={{ padding: '8px 4px' }}>Descrição</th>
                                        <th style={{ padding: '8px 4px', textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.receipts.map(r => (
                                        <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '8px 4px' }}>{formatDate(r.payment_date)}</td>
                                            <td style={{ padding: '8px 4px' }}>
                                                <div style={{ fontWeight: '500' }}>{r.description}</div>
                                                <div style={{ fontSize: '10px', color: '#9ca3af' }}>{r.residents?.unit_number} - {r.residents?.name}</div>
                                            </td>
                                            <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(r.total_amount)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                                        <td colSpan={2} style={{ padding: '12px 4px', fontWeight: 'bold' }}>Total Entradas</td>
                                        <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: 'bold', color: '#166534' }}>{formatCurrency(reportData.summary.revenue)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Tabela Despesas */}
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '14px', color: '#991b1b', borderBottom: '2px solid #ef4444', paddingBottom: '8px', marginBottom: '16px', textTransform: 'uppercase' }}>
                                Saídas (Despesas)
                            </h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ color: '#6b7280', fontSize: '11px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                        <th style={{ padding: '8px 4px' }}>Data</th>
                                        <th style={{ padding: '8px 4px' }}>Descrição</th>
                                        <th style={{ padding: '8px 4px', textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.expenses.map(e => (
                                        <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '8px 4px' }}>{formatDate(e.payment_date)}</td>
                                            <td style={{ padding: '8px 4px' }}>
                                                <div style={{ fontWeight: '500' }}>{e.description}</div>
                                                <div style={{ fontSize: '10px', color: '#9ca3af' }}>{e.category}</div>
                                            </td>
                                            <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(e.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                                        <td colSpan={2} style={{ padding: '12px 4px', fontWeight: 'bold' }}>Total Saídas</td>
                                        <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: 'bold', color: '#991b1b' }}>{formatCurrency(reportData.summary.expenses)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Lista Inadimplência */}
                    <div style={{ marginTop: '40px', pageBreakInside: 'avoid' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px dotted #ea580c', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', color: '#c2410c', textTransform: 'uppercase' }}>
                                ⚠️ Demonstrativo de Inadimplência Acumulada
                            </h3>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Valores atualizados com juros/multa</div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#fff7ed', color: '#c2410c', textAlign: 'left', borderBottom: '1px solid #ffedd5' }}>
                                    <th style={{ padding: '10px' }}>Unidade</th>
                                    <th style={{ padding: '10px' }}>Morador</th>
                                    <th style={{ padding: '10px' }}>Vencimento</th>
                                    <th style={{ padding: '10px', textAlign: 'right' }}>Valor Pendente</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.defaulters.map(d => (
                                    <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{d.residents?.unit_number}</td>
                                        <td style={{ padding: '10px', color: '#374151' }}>{d.residents?.name}</td>
                                        <td style={{ padding: '10px', color: '#dc2626' }}>
                                            {formatDate(d.due_date)}
                                            <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '5px' }}>({d.daysLate} dias)</span>
                                        </td>
                                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#ea580c' }}>
                                            {formatCurrency(d.calculatedTotal)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ backgroundColor: '#fff7ed' }}>
                                    <td colSpan={3} style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#c2410c' }}>Total Inadimplência:</td>
                                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#ea580c' }}>{formatCurrency(reportData.summary.defaults)}</td>
                                </tr>
                            </tfoot>
                        </table>

                        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '10px', color: '#9ca3af' }}>
                            Documento gerado eletronicamente em {new Date().toLocaleDateString()} pelo Sistema CondoManager
                        </div>
                    </div>
                </>
            )}

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    /* Garante cores na impressão */
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
        </div>
    )
}
