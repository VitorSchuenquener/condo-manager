import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Collections() {
    // State for Defaulters Monitor
    const [defaulters, setDefaulters] = useState([])

    // State for Protest Processes
    const [processes, setProcesses] = useState([])

    const [loading, setLoading] = useState(true)
    const [showProcessModal, setShowProcessModal] = useState(false)
    const [selectedDefaulter, setSelectedDefaulter] = useState(null)
    const [newProcessNote, setNewProcessNote] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            // 1. Fetch Overdue Accounts
            const { data: overdueData } = await supabase
                .from('accounts_receivable')
                .select(`
                    id,
                    amount,
                    total_amount,
                    due_date,
                    resident_id,
                    residents (id, name, unit_number, block, phone, email)
                `)
                .eq('status', 'atrasado')

            // Group by Resident
            const groupedDefaulters = {}
            overdueData?.forEach(bill => {
                const rid = bill.resident_id
                if (!groupedDefaulters[rid]) {
                    groupedDefaulters[rid] = {
                        resident: bill.residents,
                        bills: [],
                        totalDebt: 0
                    }
                }
                groupedDefaulters[rid].bills.push(bill)
                groupedDefaulters[rid].totalDebt += Number(bill.total_amount)
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
        setShowProcessModal(true)
    }

    const confirmCreateProcess = async () => {
        if (!selectedDefaulter) return

        try {
            const { error } = await supabase
                .from('protests')
                .insert([{
                    resident_id: selectedDefaulter.resident.id,
                    total_debt: selectedDefaulter.totalDebt,
                    status: 'notificado',
                    notification_date: new Date().toISOString(),
                    notes: newProcessNote
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

    return (
        <div className="collections-page">
            <div className="page-header">
                <h1 className="page-title">Cobranças e Protestos</h1>
                <p className="page-subtitle">Gestão de inadimplência e processos jurídicos</p>
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

                                <div className="mb-md">
                                    <p className="text-sm text-gray">Dívida Total</p>
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
                                        ⚖️ Processar
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
                                    {processes.map(proc => (
                                        <tr key={proc.id}>
                                            <td>
                                                <div className="font-medium">{proc.residents?.name}</div>
                                                <div className="text-xs text-gray">
                                                    Unid. {proc.residents?.unit_number}
                                                </div>
                                            </td>
                                            <td>{formatDate(proc.notification_date)}</td>
                                            <td className="font-bold">{formatCurrency(proc.total_debt)}</td>
                                            <td>
                                                <span className={`badge badge-${proc.status === 'quitado' ? 'success' : proc.status === 'protestado' ? 'danger' : 'warning'}`}>
                                                    {proc.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <select
                                                    className="select text-xs py-1"
                                                    value={proc.status}
                                                    onChange={(e) => updateProcessStatus(proc.id, e.target.value)}
                                                >
                                                    <option value="notificado">Notificado</option>
                                                    <option value="aguardando_prazo">Aguardando Prazo</option>
                                                    <option value="enviado_cartorio">Enviado Cartório</option>
                                                    <option value="protestado">Protestado</option>
                                                    <option value="quitado">Quitado</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

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
                            <p className="mb-md">
                                Valor Total da Dívida: <strong className="text-danger">{formatCurrency(selectedDefaulter?.totalDebt)}</strong>
                            </p>

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
