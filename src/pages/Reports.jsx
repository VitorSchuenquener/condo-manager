import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, parseISO, differenceInDays, isBefore, isAfter, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function Reports() {
    const [loading, setLoading] = useState(false)
    const [reportType, setReportType] = useState('monthly_balance') // monthly_balance, defaulters
    const [referenceDate, setReferenceDate] = useState(format(new Date(), 'yyyy-MM'))
    const [reportData, setReportData] = useState(null)

    // Removido useEffect automático para evitar loops ou travamentos silenciosos.
    // O usuário agora clica explicitamente em "Gerar".

    // Função auxiliar para cálculo de Juros/Multa
    const calculatePenalty = (bill) => {
        if (!bill.due_date) return { original: 0, fine: 0, interest: 0, days: 0, total: 0 };

        const dueDate = new Date(bill.due_date)
        dueDate.setHours(23, 59, 59, 999)

        const today = new Date()
        const diffTime = today - dueDate
        const daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        const originalAmount = Number(bill.total_amount) || 0

        if (daysLate <= 0) {
            return {
                original: originalAmount,
                fine: 0,
                interest: 0,
                days: 0,
                total: originalAmount
            }
        }

        const fine = originalAmount * 0.02
        const interest = originalAmount * (0.000333 * daysLate)
        const total = originalAmount + fine + interest

        return {
            original: originalAmount,
            fine: fine,
            interest: interest,
            days: daysLate,
            total: total
        }
    }

    const handleGenerateClick = async () => {
        setLoading(true)
        setReportData(null)
        try {
            if (reportType === 'monthly_balance') {
                await generateMonthlyBalance()
            } else if (reportType === 'defaulters') {
                await generateDefaultersReport()
            }
            toast.success("Relatório gerado com sucesso!")
        } catch (error) {
            console.error('Erro ao gerar relatório:', error)
            toast.error("Erro ao gerar relatório. Verifique o console.")
        } finally {
            setLoading(false)
        }
    }

    const generateMonthlyBalance = async () => {
        // Datas de Referência (Inicio e Fim do Mês Selecionado)
        const refDate = parseISO(referenceDate + '-01')
        const startDate = startOfMonth(refDate)
        const endDate = endOfMonth(refDate)

        // Ajuste para garantir comparação até o final do dia
        endDate.setHours(23, 59, 59, 999)
        startDate.setHours(0, 0, 0, 0)

        // 1. Carregar TUDO (Estratégia segura para Saldo Anterior)
        const { data: allReceipts, error: rError } = await supabase
            .from('accounts_receivable')
            .select('*, residents(name, unit_number)')
            .eq('status', 'pago')
            .order('payment_date')

        if (rError) throw rError;

        const { data: allExpenses, error: eError } = await supabase
            .from('accounts_payable')
            .select('*')
            .eq('status', 'pago')
            .order('payment_date')

        if (eError) throw eError;

        const { data: openInvoices, error: iError } = await supabase
            .from('accounts_receivable')
            .select('*, residents(name, unit_number, block)')
            .lt('due_date', new Date().toISOString().split('T')[0])
            .neq('status', 'pago')
            .order('due_date')

        if (iError) throw iError;

        // --- PROCESSAMENTO NA MEMÓRIA (DATE-FNS) ---

        let prevReceiptsTotal = 0
        let prevExpensesTotal = 0

        const currentReceipts = []
        const currentExpenses = []

            // Processar Receitas
            (allReceipts || []).forEach(r => {
                if (!r.payment_date) return;
                // Parse da data do pagamento (trazida do banco)
                const pDate = parseISO(r.payment_date);
                // Resetar horas para garantir comparação justa de data
                pDate.setHours(12, 0, 0, 0);

                if (isBefore(pDate, startDate)) {
                    prevReceiptsTotal += Number(r.total_amount)
                } else if ((isAfter(pDate, startDate) || isSameDay(pDate, startDate)) && (isBefore(pDate, endDate) || isSameDay(pDate, endDate))) {
                    currentReceipts.push(r)
                }
            });

        // Processar Despesas
        (allExpenses || []).forEach(e => {
            if (!e.payment_date) return;
            const pDate = parseISO(e.payment_date);
            pDate.setHours(12, 0, 0, 0);

            if (isBefore(pDate, startDate)) {
                prevExpensesTotal += Number(e.amount)
            } else if ((isAfter(pDate, startDate) || isSameDay(pDate, startDate)) && (isBefore(pDate, endDate) || isSameDay(pDate, endDate))) {
                currentExpenses.push(e)
            }
        });

        const previousBalance = prevReceiptsTotal - prevExpensesTotal

        const totalRevenue = currentReceipts.reduce((acc, curr) => acc + Number(curr.total_amount), 0)
        const totalExpenses = currentExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0)

        const processedDefaulters = (openInvoices || []).map(bill => {
            const calculated = calculatePenalty(bill)
            return { ...bill, calculatedTotal: calculated.total, daysLate: calculated.days }
        })
        const totalDefaultersWithInterest = processedDefaulters.reduce((acc, curr) => acc + Number(curr.calculatedTotal), 0)

        const currentBalance = previousBalance + totalRevenue - totalExpenses

        setReportData({
            type: 'monthly_balance',
            period: format(refDate, 'MMMM yyyy', { locale: ptBR }),
            receipts: currentReceipts,
            expenses: currentExpenses,
            defaulters: processedDefaulters,
            summary: {
                previousBalance: previousBalance,
                revenue: totalRevenue,
                expenses: totalExpenses,
                balance: currentBalance,
                monthResult: totalRevenue - totalExpenses,
                totalDefault: totalDefaultersWithInterest
            }
        })
    }

    const generateDefaultersReport = async () => {
        const { data: defaulters } = await supabase
            .from('accounts_receivable')
            .select('*, residents(name, unit_number, block, phone, email)')
            .lt('due_date', new Date().toISOString().split('T')[0])
            .neq('status', 'pago')
            .order('due_date')

        const processedDefaulters = (defaulters || []).map(bill => {
            const calculated = calculatePenalty(bill)
            return { ...bill, calculatedTotal: calculated.total, daysLate: calculated.days }
        })

        const totalDebt = processedDefaulters.reduce((acc, curr) => acc + Number(curr.calculatedTotal), 0)

        setReportData({
            type: 'defaulters',
            date: format(new Date(), 'dd/MM/yyyy'),
            items: processedDefaulters,
            totalDebt
        })
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }

    const handlePrint = () => {
        window.print()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header da Página (Não sai na impressão) */}
            <div className="no-print" style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Relatórios Contábeis</h1>
                <p style={{ color: '#64748b' }}>Geração de demonstrativos financeiros e documentos para auditoria.</p>
            </div>

            {/* Controles do Relatório (Não sai na impressão) */}
            <div className="no-print" style={{
                backgroundColor: 'white',
                padding: '24px',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                marginBottom: '32px',
                border: '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#475569' }}>Tipo de Relatório</label>
                        <select
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value)}
                        >
                            <option value="monthly_balance">Balancete Mensal Completo</option>
                            <option value="defaulters">Lista Simples de Inadimplência</option>
                        </select>
                    </div>

                    {reportType === 'monthly_balance' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#475569' }}>Mês de Referência</label>
                            <input
                                type="month"
                                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                value={referenceDate}
                                onChange={(e) => setReferenceDate(e.target.value)}
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={handleGenerateClick}
                            disabled={loading}
                            style={{
                                flex: 2,
                                padding: '10px 24px',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                opacity: loading ? 0.7 : 1
                            }}
                        >
                            {loading ? 'Gerando...' : '📄 Gerar Relatório'}
                        </button>

                        <button
                            onClick={handlePrint}
                            disabled={!reportData}
                            style={{
                                flex: 1,
                                padding: '10px 24px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                opacity: !reportData ? 0.7 : 1
                            }}
                        >
                            🖨️ Imprimir
                        </button>
                    </div>
                </div>
            </div>

            {/* Área do Relatório (Papel A4 Digital) */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                    <div className="spinner" style={{ marginBottom: '16px', fontSize: '24px' }}>🔄</div>
                    Carregando dados financeiros e calculando saldos...
                </div>
            ) : reportData ? (
                <div>
                    <div className="report-paper" style={{
                        backgroundColor: 'white',
                        padding: '40px',
                        borderRadius: '0',
                        boxShadow: '0 0 20px rgba(0,0,0,0.05)',
                        minHeight: '800px',
                        position: 'relative',
                        marginBottom: '40px'
                    }}>

                        {/* Cabeçalho Oficial do Documento */}
                        <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: '24px', marginBottom: '32px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', color: '#0f172a', letterSpacing: '1px', marginBottom: '8px' }}>Condomínio Residencial</h2>
                            <h3 style={{ fontSize: '18px', fontWeight: 'normal', color: '#334155' }}>
                                {reportData.type === 'monthly_balance' ? 'Demonstrativo Financeiro & Inadimplência' : 'Relatório Analítico de Inadimplência'}
                            </h3>
                            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>
                                {reportData.type === 'monthly_balance' ? `Referência: ${reportData.period}` : `Data de Emissão: ${reportData.date}`}
                            </p>
                        </div>

                        {/* Conteúdo: Balancete */}
                        {reportData.type === 'monthly_balance' && (
                            <div>
                                {/* Cards de Resumo Executivo */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '32px' }}>

                                    {/* SALDO ANTERIOR (Novo Card) */}
                                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 'bold' }}>Saldo Anterior</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: '#334155' }}>
                                            {formatCurrency(reportData.summary.previousBalance)}
                                        </p>
                                    </div>

                                    <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#166534', fontWeight: 'bold' }}>Total Receitas</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: '#15803d' }}>
                                            {formatCurrency(reportData.summary.revenue)}
                                        </p>
                                    </div>

                                    <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>Total Despesas</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: '#b91c1c' }}>
                                            {formatCurrency(reportData.summary.expenses)}
                                        </p>
                                    </div>

                                    {/* SALDO EM CAIXA ATUAL (Acumulado) */}
                                    <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #dbeafe' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#1e40af', fontWeight: 'bold' }}>Saldo Disponível</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: reportData.summary.balance >= 0 ? '#1e3a8a' : '#ef4444' }}>
                                            {formatCurrency(reportData.summary.balance)}
                                        </p>
                                    </div>
                                </div>

                                {/* Resultado do Mês (Destaque pequeno) */}
                                <div style={{ textAlign: 'center', marginBottom: '32px', fontSize: '13px', color: '#64748b', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '8px' }}>
                                    Resultado do Período (Receitas - Despesas): <strong style={{ color: reportData.summary.monthResult >= 0 ? '#15803d' : '#b91c1c' }}>{formatCurrency(reportData.summary.monthResult)}</strong>
                                </div>

                                {/* Colunas Lado a Lado: Entradas e Saídas */}
                                <div style={{ display: 'flex', gap: '32px', marginBottom: '48px' }}>
                                    {/* Coluna Receitas */}
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '2px solid #22c55e', paddingBottom: '8px', marginBottom: '12px', color: '#15803d', textTransform: 'uppercase' }}>
                                            Entradas (Receitas)
                                        </h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                                    <th style={{ padding: '6px 4px' }}>Data</th>
                                                    <th style={{ padding: '6px 4px' }}>Descrição</th>
                                                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportData.receipts.length > 0 ? reportData.receipts.map((r, i) => (
                                                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                                                        <td style={{ padding: '6px 4px' }}>{format(parseISO(r.payment_date), 'dd/MM')}</td>
                                                        <td style={{ padding: '6px 4px' }}>
                                                            <div style={{ fontWeight: '500' }}>{r.description}</div>
                                                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                                                                {r.residents ? `${r.residents.unit_number} - ${r.residents.name}`.substring(0, 20) : 'Avulso'}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatCurrency(r.total_amount)}</td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan="3" style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>Nenhuma entrada.</td></tr>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #cbd5e1' }}>
                                                    <td colSpan="2" style={{ padding: '8px 4px', fontWeight: 'bold' }}>Total Entradas</td>
                                                    <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 'bold', color: '#15803d' }}>{formatCurrency(reportData.summary.revenue)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* Coluna Despesas */}
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '2px solid #ef4444', paddingBottom: '8px', marginBottom: '12px', color: '#b91c1c', textTransform: 'uppercase' }}>
                                            Saídas (Despesas)
                                        </h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                                    <th style={{ padding: '6px 4px' }}>Data</th>
                                                    <th style={{ padding: '6px 4px' }}>Descrição</th>
                                                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportData.expenses.length > 0 ? reportData.expenses.map((e, i) => (
                                                    <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? 'white' : '#fff1f2' }}>
                                                        <td style={{ padding: '6px 4px' }}>{format(parseISO(e.payment_date), 'dd/MM')}</td>
                                                        <td style={{ padding: '6px 4px' }}>
                                                            <div style={{ fontWeight: '500' }}>{e.description}</div>
                                                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{e.category}</div>
                                                        </td>
                                                        <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatCurrency(e.amount)}</td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan="3" style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>Nenhuma saída.</td></tr>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #cbd5e1' }}>
                                                    <td colSpan="2" style={{ padding: '8px 4px', fontWeight: 'bold' }}>Total Saídas</td>
                                                    <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>{formatCurrency(reportData.summary.expenses)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>

                                {/* SEÇÃO NOVA: INADIMPLÊNCIA COM JUROS */}
                                <div style={{ pageBreakInside: 'avoid', borderTop: '2px dashed #cbd5e1', paddingTop: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div>
                                            <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#9a3412', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                                ⚠️ Demonstrativo de Inadimplência
                                            </h4>
                                            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
                                                Valores atualizados com multa (2%) e juros (1% a.m).
                                            </p>
                                        </div>
                                        <div style={{ textAlign: 'right', backgroundColor: '#fff7ed', padding: '8px 16px', borderRadius: '4px', border: '1px solid #ffedd5' }}>
                                            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#9a3412', fontWeight: 'bold' }}>Total a Receber</div>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ea580c' }}>{formatCurrency(reportData.summary.totalDefault)}</div>
                                        </div>
                                    </div>

                                    {reportData.defaulters && reportData.defaulters.length > 0 ? (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#fff7ed', borderBottom: '1px solid #ffedd5', color: '#9a3412', textAlign: 'left' }}>
                                                    <th style={{ padding: '8px', width: '15%' }}>Unidade</th>
                                                    <th style={{ padding: '8px', width: '30%' }}>Morador</th>
                                                    <th style={{ padding: '8px', width: '20%' }}>Vencimento</th>
                                                    <th style={{ padding: '8px', width: '20%', textAlign: 'right' }}>Valor Original</th>
                                                    <th style={{ padding: '8px', width: '15%', textAlign: 'right' }}>Valor Atualizado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportData.defaulters.map((d, i) => (
                                                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{d.residents?.unit_number} {d.residents?.block}</td>
                                                        <td style={{ padding: '8px' }}>{d.residents?.name}</td>
                                                        <td style={{ padding: '8px', color: '#dc2626' }}>
                                                            {format(parseISO(d.due_date), 'dd/MM/yyyy')}
                                                            <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>
                                                                ({d.daysLate} dias)
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>{formatCurrency(d.total_amount)}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#ea580c' }}>{formatCurrency(d.calculatedTotal)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div style={{ padding: '16px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '6px', textAlign: 'center', color: '#166534' }}>
                                            ✅ Não há registros de inadimplência no momento.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Conteúdo: Lista Simples de Inadimplentes */}
                        {reportData.type === 'defaulters' && (
                            <div>
                                <div style={{ backgroundColor: '#fef2f2', padding: '24px', borderRadius: '8px', border: '1px solid #fee2e2', marginBottom: '32px', textAlign: 'center' }}>
                                    <p style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>Total Pendente Atualizado</p>
                                    <p style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 'bold', color: '#b91c1c' }}>{formatCurrency(reportData.totalDebt)}</p>
                                    <p style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '4px' }}>Inclui multa e juros proporcionais</p>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '12px', fontWeight: '600' }}>Unidade</th>
                                            <th style={{ padding: '12px', fontWeight: '600' }}>Morador</th>
                                            <th style={{ padding: '12px', fontWeight: '600' }}>Vencimento</th>
                                            <th style={{ padding: '12px', fontWeight: '600', textAlign: 'right' }}>Original</th>
                                            <th style={{ padding: '12px', fontWeight: '600', textAlign: 'right' }}>Atualizado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.items.map((item, i) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                                <td style={{ padding: '12px', fontWeight: 'bold', color: '#1e293b' }}>
                                                    {item.residents?.unit_number} <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b' }}>{item.residents?.block}</span>
                                                </td>
                                                <td style={{ padding: '12px', color: '#334155' }}>
                                                    {item.residents?.name}
                                                </td>
                                                <td style={{ padding: '12px', color: '#dc2626', fontWeight: '500' }}>
                                                    {format(parseISO(item.due_date), 'dd/MM/yyyy')}
                                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{item.daysLate} dias atraso</div>
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>{formatCurrency(item.total_amount)}</td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>{formatCurrency(item.calculatedTotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Footer de Impressão */}
                        <div className="show-on-print" style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '0',
                            right: '0',
                            textAlign: 'center',
                            fontSize: '10px',
                            color: '#94a3b8',
                            borderTop: '1px solid #f1f5f9',
                            paddingTop: '8px'
                        }}>
                            Documento gerado eletronicamente em {format(new Date(), 'dd/MM/yyyy HH:mm')} pelo Sistema CondoManager
                        </div>

                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '64px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                    <p>Selecione os parâmetros acima e <strong>clique em Gerar Relatório</strong> para visualizar.</p>
                </div>
            )}

            {/* Estilos Específicos de Impressão */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .report-paper { 
                        box-shadow: none !important; 
                        padding: 0 !important; 
                        margin: 0 !important;
                        min-height: auto !important;
                    }
                    /* Força fundo colorido na impressão */
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    
                    /* Quebra de página inteligente */
                    tr { page-break-inside: avoid; }
                    h4 { page-break-after: avoid; }
                }
            `}</style>
        </div>
    )
}
