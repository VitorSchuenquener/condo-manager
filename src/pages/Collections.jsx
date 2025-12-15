import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Collections() {
    // State for Defaulters Monitor
    const [defaulters, setDefaulters] = useState([])

    // State for Protest Processes
    const [processes, setProcesses] = useState([])

    const [loading, setLoading] = useState(true)
    const [showProcessModal, setShowProcessModal] = useState(false)
    const [showChecklistModal, setShowChecklistModal] = useState(false)
    const [selectedDefaulter, setSelectedDefaulter] = useState(null)
    const [selectedProcess, setSelectedProcess] = useState(null)
    const [newProcessNote, setNewProcessNote] = useState('')

    // Checklist de Protesto
    const [checklist, setChecklist] = useState({
        carta_enviada: false,
        prazo_cumprido: false,
        documentos_anexados: false,
        valor_calculado: true // Sempre true pois calculamos automaticamente
    })

    useEffect(() => {
        fetchData()
    }, [])

    // Dicionário de Status com Explicações
    const statusInfo = {
        'notificado': {
            label: 'Notificado',
            color: 'warning',
            icon: '📧',
            description: 'Morador foi avisado por escrito sobre a dívida (carta com AR)',
            nextStep: 'Aguardar 10 dias úteis para pagamento voluntário'
        },
        'aguardando_prazo': {
            label: 'Aguardando Prazo',
            color: 'info',
            icon: '⏳',
            description: 'Aguardando 10 dias úteis para pagamento após notificação',
            nextStep: 'Se não pagar, enviar ao cartório de protesto'
        },
        'enviado_cartorio': {
            label: 'Enviado ao Cartório',
            color: 'primary',
            icon: '📤',
            description: 'Documentação enviada ao cartório de protesto de títulos',
            nextStep: 'Cartório irá protestar o título em 3-5 dias úteis'
        },
        'protestado': {
            label: 'Protestado',
            color: 'danger',
            icon: '⚖️',
            description: 'Nome incluído no cadastro de inadimplentes (Serasa/SPC)',
            nextStep: 'Aguardar pagamento ou iniciar ação judicial'
        },
        'quitado': {
            label: 'Quitado',
            color: 'success',
            icon: '✅',
            description: 'Dívida paga e processo encerrado',
            nextStep: 'Solicitar baixa do protesto no cartório'
        }
    }

    const calculatePenalty = (bill) => {
        const dueDate = new Date(bill.due_date)
        dueDate.setHours(23, 59, 59, 999)

        const today = new Date()
        const diffTime = today - dueDate
        const daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (daysLate <= 0) {
            return {
                original: bill.amount,
                fine: 0,
                interest: 0,
                days: 0,
                total: bill.amount
            }
        }

        // Regra Brasileira: Multa 2% + Juros 1% ao mês (0.033% ao dia)
        const originalAmount = bill.amount
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

    const fetchData = async () => {
        setLoading(true)
        try {
            // 1. Buscar TODAS as contas pendentes (não pagas)
            const { data: overdueData } = await supabase
                .from('accounts_receivable')
                .select(`
                    id,
                    amount,
                    due_date,
                    description,
                    resident_id,
                    residents (id, name, unit_number, block, phone, email)
                `)
                .eq('status', 'pendente')

            // 2. Filtrar apenas as que estão REALMENTE atrasadas
            const today = new Date()
            const overdueOnly = overdueData?.filter(bill => {
                const dueDate = new Date(bill.due_date)
                return today > dueDate
            }) || []

            // 3. Agrupar por morador e calcular juros
            const groupedDefaulters = {}
            overdueOnly.forEach(bill => {
                const rid = bill.resident_id
                const calculations = calculatePenalty(bill)

                if (!groupedDefaulters[rid]) {
                    groupedDefaulters[rid] = {
                        resident: bill.residents,
                        bills: [],
                        totalOriginal: 0,
                        totalFine: 0,
                        totalInterest: 0,
                        totalDebt: 0
                    }
                }

                groupedDefaulters[rid].bills.push({ ...bill, ...calculations })
                groupedDefaulters[rid].totalOriginal += calculations.original
                groupedDefaulters[rid].totalFine += calculations.fine
                groupedDefaulters[rid].totalInterest += calculations.interest
                groupedDefaulters[rid].totalDebt += calculations.total
            })

            setDefaulters(Object.values(groupedDefaulters))

            // 2. Fetch Active Protests
            const { data: protestsData } = await supabase
                .from('protests')
                .select(`
                    *,
                    residents (name, unit_number, block)
                `)
                .order('created_at', { ascending: false })

            setProcesses(protestsData || [])

        } catch (error) {
            console.error('Error fetching collections data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateProcess = (defaulter) => {
        setSelectedDefaulter(defaulter)
        setChecklist({
            carta_enviada: false,
            prazo_cumprido: false,
            documentos_anexados: false,
            valor_calculado: true
        })
        setShowChecklistModal(true)
    }

    const proceedToCreateProcess = () => {
        setShowChecklistModal(false)
        setShowProcessModal(true)
    }

    const confirmCreateProcess = async () => {
        if (!selectedDefaulter) return

        try {
            const { error } = await supabase
                .from('protests')
                .insert([{
                    resident_id: selectedDefaulter.resident.id,
                    total_debt: selectedDefaulter.totalDebt, // Valor Já com Juros
                    status: 'notificado',
                    notification_date: new Date().toISOString(),
                    notes: newProcessNote + `\n\nCálculo na data: Valor Original: ${formatCurrency(selectedDefaulter.totalOriginal)} | Multa: ${formatCurrency(selectedDefaulter.totalFine)} | Juros: ${formatCurrency(selectedDefaulter.totalInterest)}`
                }])

            if (error) throw error

            alert('Processo de cobrança iniciado com sucesso!')
            setShowProcessModal(false)
            setNewProcessNote('')
            fetchData() // Refresh lists
        } catch (error) {
            console.error('Error creating protest:', error)
            alert('Erro ao iniciar processo.')
        }
    }

    const updateProcessStatus = async (processId, newStatus) => {
        try {
            const updates = { status: newStatus }
            if (newStatus === 'protestado') updates.protest_date = new Date().toISOString()
            if (newStatus === 'quitado') updates.settlement_date = new Date().toISOString()

            const { error } = await supabase
                .from('protests')
                .update(updates)
                .eq('id', processId)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Error updating status:', error)
            alert('Erro ao atualizar status.')
        }
    }

    const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : '-'

    if (loading) return <div className="loading-container"><div className="loading"></div></div>

    // KPIs Calculados
    const totalDefaulters = defaulters.length
    const totalDebtAmount = defaulters.reduce((sum, d) => sum + d.totalDebt, 0)
    const criticalCases = defaulters.filter(d => {
        const maxDays = Math.max(...d.bills.map(b => b.days))
        return maxDays > 30
    }).length

    return (
        <div className="collections-page">
            <div className="page-header">
                <h1 className="page-title">Cobranças e Protestos</h1>
                <p className="page-subtitle">Gestão de inadimplência e cálculo de juros</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-md mb-lg">
                <div className="card p-md flex items-center justify-between border-l-4 border-warning">
                    <div>
                        <p className="text-gray text-sm font-medium">Inadimplentes</p>
                        <p className="text-2xl font-bold text-dark">{totalDefaulters}</p>
                    </div>
                    <div className="text-3xl">🚨</div>
                </div>
                <div className="card p-md flex items-center justify-between border-l-4 border-danger">
                    <div>
                        <p className="text-gray text-sm font-medium">Total em Atraso</p>
                        <p className="text-2xl font-bold text-danger">{formatCurrency(totalDebtAmount)}</p>
                    </div>
                    <div className="text-3xl">💰</div>
                </div>
                <div className="card p-md flex items-center justify-between border-l-4 border-dark">
                    <div>
                        <p className="text-gray text-sm font-medium">Críticos (&gt;30 dias)</p>
                        <p className="text-2xl font-bold text-dark">{criticalCases}</p>
                    </div>
                    <div className="text-3xl">⚖️</div>
                </div>
            </div>

            {/* Section 1: Defaulters Monitor */}
            <div className="section mb-xl">
                <h2 className="text-lg font-bold mb-md flex items-center gap-sm">
                    <span className="text-xl">🚨</span> Monitor de Inadimplência
                </h2>

                {defaulters.length === 0 ? (
                    <div className="card p-lg text-center text-success bg-green-50 border-green-100">
                        <p className="font-bold">Nenhum morador com pagamentos atrasados!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
                        {defaulters.map((item) => (
                            <div key={item.resident.id} className="card border-l-4 border-l-danger">
                                <div className="flex justify-between items-start mb-sm">
                                    <div>
                                        <h3 className="font-bold text-lg">{item.resident.name}</h3>
                                        <p className="text-sm text-gray">
                                            Apto {item.resident.unit_number} {item.resident.block && `- Bloco ${item.resident.block}`}
                                        </p>
                                    </div>
                                    <span className="badge badge-danger">{item.bills.length} boletos</span>
                                </div>

                                <div className="mb-md py-sm border-t border-b border-gray-light">
                                    <div className="flex justify-between text-sm mb-xs">
                                        <span className="text-gray">Valor Original:</span>
                                        <span>{formatCurrency(item.totalOriginal)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mb-xs text-danger">
                                        <span>+ Multa (2%):</span>
                                        <span>{formatCurrency(item.totalFine)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mb-xs text-danger">
                                        <span>+ Juros (1% a.m):</span>
                                        <span>{formatCurrency(item.totalInterest)}</span>
                                    </div>
                                </div>

                                <div className="mb-md text-right">
                                    <p className="text-xs text-gray uppercase">Total Atualizado</p>
                                    <p className="text-2xl font-bold text-danger">{formatCurrency(item.totalDebt)}</p>
                                </div>

                                <div className="flex gap-sm">
                                    <button
                                        className="btn btn-sm btn-outline w-full"
                                        onClick={() => window.alert(`Telefone: ${item.resident.phone}\nEmail: ${item.resident.email}`)}
                                    >
                                        📞 Contato
                                    </button>
                                    <button
                                        className="btn btn-sm btn-primary w-full"
                                        onClick={() => handleCreateProcess(item)}
                                    >
                                        ⚖️ Protestar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Section 2: Active Processes */}
            <div className="section">
                <h2 className="text-lg font-bold mb-md flex items-center gap-sm">
                    <span className="text-xl">⚖️</span> Processos em Andamento
                </h2>

                <div className="card">
                    {processes.length === 0 ? (
                        <div className="p-lg text-center text-gray">Nenhum processo administrativo ou judicial aberto.</div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Morador</th>
                                        <th>Dt. Notificação</th>
                                        <th>Valor Protestado</th>
                                        <th>Status Atual</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processes.map(proc => {
                                        const info = statusInfo[proc.status] || statusInfo['notificado']
                                        return (
                                            <tr key={proc.id}>
                                                <td>
                                                    <div className="font-medium">{proc.residents?.name}</div>
                                                    <div className="text-xs text-gray">
                                                        Casa {proc.residents?.unit_number}
                                                    </div>
                                                </td>
                                                <td>{formatDate(proc.notification_date)}</td>
                                                <td className="font-bold">{formatCurrency(proc.total_debt)}</td>
                                                <td>
                                                    <div
                                                        className={`badge badge-${info.color}`}
                                                        title={`${info.description}\n\nPróximo passo: ${info.nextStep}`}
                                                        style={{ cursor: 'help' }}
                                                    >
                                                        {info.icon} {info.label}
                                                    </div>
                                                    <div className="text-xs text-gray mt-xs">
                                                        {info.nextStep}
                                                    </div>
                                                </td>
                                                <td>
                                                    <select
                                                        className="input text-xs py-1"
                                                        value={proc.status}
                                                        onChange={(e) => updateProcessStatus(proc.id, e.target.value)}
                                                    >
                                                        <option value="notificado">📧 Notificado</option>
                                                        <option value="aguardando_prazo">⏳ Aguardando Prazo</option>
                                                        <option value="enviado_cartorio">📤 Enviado Cartório</option>
                                                        <option value="protestado">⚖️ Protestado</option>
                                                        <option value="quitado">✅ Quitado</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Checklist */}
            {showChecklistModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">⚖️ Checklist de Protesto</h2>
                            <button className="modal-close" onClick={() => setShowChecklistModal(false)}>&times;</button>
                        </div>
                        <div className="p-md">
                            <div className="bg-blue-50 border-l-4 border-primary p-md mb-md">
                                <p className="text-sm">
                                    <strong>Morador:</strong> {selectedDefaulter?.resident.name}<br />
                                    <strong>Valor Total:</strong> {formatCurrency(selectedDefaulter?.totalDebt)}<br />
                                    <strong>Dias de Atraso:</strong> {Math.max(...(selectedDefaulter?.bills.map(b => b.days) || [0]))} dias
                                </p>
                            </div>

                            <div className="space-y-sm mb-md">
                                <label className="flex items-start gap-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={checklist.carta_enviada}
                                        onChange={(e) => setChecklist({ ...checklist, carta_enviada: e.target.checked })}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-bold">📧 Carta de Cobrança (AR)</div>
                                    </div>
                                </label>

                                <label className="flex items-start gap-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={checklist.prazo_cumprido}
                                        onChange={(e) => setChecklist({ ...checklist, prazo_cumprido: e.target.checked })}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-bold">⏳ Prazo de 10 Dias Úteis</div>
                                    </div>
                                </label>

                                <label className="flex items-start gap-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={checklist.documentos_anexados}
                                        onChange={(e) => setChecklist({ ...checklist, documentos_anexados: e.target.checked })}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-bold">📄 Documentação Completa</div>
                                    </div>
                                </label>

                                <label className="flex items-start gap-sm opacity-50">
                                    <input
                                        type="checkbox"
                                        checked={checklist.valor_calculado}
                                        disabled
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-bold">💰 Valor Atualizado</div>
                                        <div className="text-xs text-gray">✅ Calculado automaticamente</div>
                                    </div>
                                </label>
                            </div>

                            <div className="flex justify-end gap-sm">
                                <button className="btn btn-outline" onClick={() => setShowChecklistModal(false)}>Cancelar</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={proceedToCreateProcess}
                                    disabled={!checklist.carta_enviada || !checklist.prazo_cumprido || !checklist.documentos_anexados}
                                >
                                    Continuar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Create Process */}
            {showProcessModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Iniciar Processo de Cobrança</h2>
                            <button className="modal-close" onClick={() => setShowProcessModal(false)}>&times;</button>
                        </div>
                        <div className="p-md">
                            <p className="mb-md">
                                Confirmar abertura de processo para <strong>{selectedDefaulter?.resident.name}</strong>?
                            </p>
                            <div className="bg-gray-light p-md rounded mb-md text-sm">
                                <div className="flex justify-between mb-xs">
                                    <span>Principal:</span>
                                    <strong>{formatCurrency(selectedDefaulter?.totalOriginal)}</strong>
                                </div>
                                <div className="flex justify-between mb-xs text-danger">
                                    <span>Multa (2%):</span>
                                    <strong>{formatCurrency(selectedDefaulter?.totalFine)}</strong>
                                </div>
                                <div className="flex justify-between mb-xs text-danger">
                                    <span>Juros (1% a.m):</span>
                                    <strong>{formatCurrency(selectedDefaulter?.totalInterest)}</strong>
                                </div>
                                <div className="flex justify-between pt-xs border-t border-gray font-bold text-lg mt-sm">
                                    <span>Total a Protestar:</span>
                                    <span className="text-danger">{formatCurrency(selectedDefaulter?.totalDebt)}</span>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Observações Iniciais</label>
                                <textarea
                                    className="input"
                                    rows="3"
                                    value={newProcessNote}
                                    onChange={e => setNewProcessNote(e.target.value)}
                                    placeholder="Ex: Carta de notificação enviada..."
                                ></textarea>
                            </div>

                            <div className="flex justify-end gap-sm mt-lg">
                                <button className="btn btn-outline" onClick={() => setShowProcessModal(false)}>Cancelar</button>
                                <button className="btn btn-primary" onClick={confirmCreateProcess}>Confirmar Abertura</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
