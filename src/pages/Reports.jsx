import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Reports() {
    const [loading, setLoading] = useState(false)
    const [reportType, setReportType] = useState('monthly_balance') // monthly_balance, defaulters
    const [referenceDate, setReferenceDate] = useState(format(new Date(), 'yyyy-MM'))
    const [reportData, setReportData] = useState(null)

    useEffect(() => {
        generateReport()
    }, [referenceDate, reportType])

    const generateReport = async () => {
        setLoading(true)
        setReportData(null)
        try {
            if (reportType === 'monthly_balance') {
                await generateMonthlyBalance()
            } else if (reportType === 'defaulters') {
                await generateDefaultersReport()
            }
        } catch (error) {
            console.error('Erro ao gerar relatório:', error)
            alert('Erro ao gerar relatório')
        } finally {
            setLoading(false)
        }
    }

    const generateMonthlyBalance = async () => {
        const date = parseISO(referenceDate + '-01')
        const start = startOfMonth(date).toISOString()
        const end = endOfMonth(date).toISOString()

        // Buscar receitas
        const { data: receipts } = await supabase
            .from('accounts_receivable')
            .select('*, residents(name, unit_number)')
            .eq('status', 'pago')
            .gte('payment_date', start)
            .lte('payment_date', end)
            .order('payment_date')

        // Buscar despesas
        const { data: expenses } = await supabase
            .from('accounts_payable')
            .select('*')
            .eq('status', 'pago')
            .gte('payment_date', start)
            .lte('payment_date', end)
            .order('payment_date')

        const totalRevenue = (receipts || []).reduce((acc, curr) => acc + Number(curr.total_amount), 0)
        const totalExpenses = (expenses || []).reduce((acc, curr) => acc + Number(curr.amount), 0)

        setReportData({
            type: 'monthly_balance',
            period: format(date, 'MMMM yyyy', { locale: ptBR }),
            receipts: receipts || [],
            expenses: expenses || [],
            summary: {
                revenue: totalRevenue,
                expenses: totalExpenses,
                balance: totalRevenue - totalExpenses
            }
        })
    }

    const generateDefaultersReport = async () => {
        const { data: defaulters } = await supabase
            .from('accounts_receivable')
            .select('*, residents(name, unit_number, block, phone, email)')
            .eq('status', 'atrasado')
            .order('due_date')

        const totalDebt = (defaulters || []).reduce((acc, curr) => acc + Number(curr.total_amount), 0)

        setReportData({
            type: 'defaulters',
            date: format(new Date(), 'dd/MM/yyyy'),
            items: defaulters || [],
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
        <div className="reports-page">
            <div className="page-header no-print">
                <h1 className="page-title">Relatórios Contábeis</h1>
                <p className="page-subtitle">Demonstrativos financeiros e de inadimplência</p>
            </div>

            {/* Controles do Relatório */}
            <div className="card mb-lg no-print">
                <div className="grid grid-cols-3 gap-md items-end">
                    <div className="input-group mb-0">
                        <label className="input-label">Tipo de Relatório</label>
                        <select
                            className="select"
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value)}
                        >
                            <option value="monthly_balance">Balancete Mensal (Fluxo de Caixa)</option>
                            <option value="defaulters">Relatório de Inadimplência</option>
                        </select>
                    </div>

                    {reportType === 'monthly_balance' && (
                        <div className="input-group mb-0">
                            <label className="input-label">Mês de Referência</label>
                            <input
                                type="month"
                                className="input"
                                value={referenceDate}
                                onChange={(e) => setReferenceDate(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="input-group mb-0">
                        <button
                            className="btn btn-primary w-full"
                            onClick={handlePrint}
                            disabled={!reportData}
                        >
                            🖨️ Imprimir / Salvar PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Área de Visualização do Relatório (Imprimível) */}
            {loading ? (
                <div className="flex justify-center p-xl">
                    <div className="loading"></div>
                </div>
            ) : reportData ? (
                <div className="report-preview card print-section">

                    {/* Cabeçalho do Relatório (Só aparece na impressão ou preview) */}
                    <div className="report-header text-center mb-xl border-b pb-lg">
                        <h2 className="text-xl font-bold uppercase mb-xs">Condomínio Residencial</h2>
                        <h3 className="text-lg font-medium text-gray">
                            {reportData.type === 'monthly_balance' ? 'Balancete Financeiro Mensal' : 'Relatório de Inadimplência'}
                        </h3>
                        <p className="text-sm text-gray">
                            {reportData.type === 'monthly_balance'
                                ? `Período: ${reportData.period}`
                                : `Gerado em: ${reportData.date}`}
                        </p>
                    </div>

                    {/* Conteúdo: Balancete Mensal */}
                    {reportData.type === 'monthly_balance' && (
                        <div className="report-content">
                            {/* Resumo */}
                            <div className="grid grid-cols-3 gap-md mb-xl">
                                <div className="p-md bg-green-50 rounded border border-green-100 text-center">
                                    <p className="text-sm text-gray uppercase font-bold">Total Receitas</p>
                                    <p className="text-xl font-bold text-success">{formatCurrency(reportData.summary.revenue)}</p>
                                </div>
                                <div className="p-md bg-red-50 rounded border border-red-100 text-center">
                                    <p className="text-sm text-gray uppercase font-bold">Total Despesas</p>
                                    <p className="text-xl font-bold text-danger">{formatCurrency(reportData.summary.expenses)}</p>
                                </div>
                                <div className={`p-md rounded border text-center ${reportData.summary.balance >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                    <p className="text-sm text-gray uppercase font-bold">Saldo do Período</p>
                                    <p className={`text-xl font-bold ${reportData.summary.balance >= 0 ? 'text-primary' : 'text-danger'}`}>
                                        {formatCurrency(reportData.summary.balance)}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-xl print-col-2">
                                <div>
                                    <h4 className="font-bold border-b mb-md pb-xs text-success">Entradas (Receitas)</h4>
                                    {reportData.receipts.length > 0 ? (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-gray text-xs uppercase">
                                                    <th className="pb-sm">Data</th>
                                                    <th className="pb-sm">Descrição</th>
                                                    <th className="pb-sm text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportData.receipts.map(r => (
                                                    <tr key={r.id} className="border-b border-gray-light">
                                                        <td className="py-xs">{format(parseISO(r.payment_date), 'dd/MM')}</td>
                                                        <td className="py-xs">
                                                            <div>{r.description}</div>
                                                            <div className="text-xs text-gray">{r.residents?.unit_number} - {r.residents?.name}</div>
                                                        </td>
                                                        <td className="py-xs text-right">{formatCurrency(r.total_amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-gray text-sm italic">Nenhuma receita no período.</p>
                                    )}
                                </div>

                                <div>
                                    <h4 className="font-bold border-b mb-md pb-xs text-danger">Saídas (Despesas)</h4>
                                    {reportData.expenses.length > 0 ? (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-gray text-xs uppercase">
                                                    <th className="pb-sm">Data</th>
                                                    <th className="pb-sm">Descrição</th>
                                                    <th className="pb-sm text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportData.expenses.map(e => (
                                                    <tr key={e.id} className="border-b border-gray-light">
                                                        <td className="py-xs">{format(parseISO(e.payment_date), 'dd/MM')}</td>
                                                        <td className="py-xs">{e.description}</td>
                                                        <td className="py-xs text-right">{formatCurrency(e.amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-gray text-sm italic">Nenhuma despesa no período.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Conteúdo: Lista de Inadimplentes */}
                    {reportData.type === 'defaulters' && (
                        <div className="report-content">
                            <div className="mb-lg p-md bg-red-50 border border-red-100 rounded text-center">
                                <span className="text-gray uppercase font-bold text-sm">Total em Atraso:</span>
                                <span className="text-xl font-bold text-danger ml-md">{formatCurrency(reportData.totalDebt)}</span>
                            </div>

                            {reportData.items.length > 0 ? (
                                <table className="table w-full">
                                    <thead>
                                        <tr>
                                            <th>Unidade</th>
                                            <th>Nome</th>
                                            <th>Vencimento</th>
                                            <th>Descrição</th>
                                            <th>Telefone</th>
                                            <th className="text-right">Valor Devido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.items.map(item => (
                                            <tr key={item.id}>
                                                <td className="font-bold">{item.residents?.unit_number} {item.residents?.block}</td>
                                                <td>{item.residents?.name}</td>
                                                <td className="text-danger font-medium">
                                                    {format(parseISO(item.due_date), 'dd/MM/yyyy')}
                                                </td>
                                                <td>{item.description}</td>
                                                <td className="text-sm">{item.residents?.phone || '-'}</td>
                                                <td className="text-right font-bold">{formatCurrency(item.total_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="text-center p-xl text-success bg-green-50 rounded">
                                    <h3 className="font-bold">Parabéns!</h3>
                                    <p>Não há registros de inadimplência no momento.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Rodapé da Impressão */}
                    <div className="report-footer mt-xl pt-lg border-t text-center text-xs text-gray hidden-on-screen show-on-print">
                        <p>Documento gerado automaticamente pelo Sistema CondoManager em {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                </div>
            ) : (
                <div className="text-center p-xl text-gray">
                    Selecione os parâmetros acima para gerar o relatório.
                </div>
            )}

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    .dashboard, .card, .reports-page { 
                        box-shadow: none !important; 
                        padding: 0 !important; 
                        margin: 0 !important;
                        background: white !important;
                    }
                    .print-section {
                        border: none !important;
                    }
                    .show-on-print { display: block !important; }
                    .print-col-2 {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 2rem;
                    }
                }
                .show-on-print { display: none; }
            `}</style>
        </div>
    )
}
