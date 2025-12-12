import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AccountsReceivable() {
    const [receivables, setReceivables] = useState([])
    const [residents, setResidents] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [formData, setFormData] = useState({
        resident_id: '',
        description: '',
        amount: '',
        due_date: '',
        status: 'pendente'
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            // Buscar contas e dados do morador relacionado
            const { data: receivablesData, error: receivablesError } = await supabase
                .from('accounts_receivable')
                .select(`
                    *,
                    residents (name, unit_number, block)
                `)
                .order('due_date', { ascending: true })

            if (receivablesError) throw receivablesError

            // Buscar lista de moradores para o select formulário
            const { data: residentsData, error: residentsError } = await supabase
                .from('residents')
                .select('id, name, unit_number, block')
                .order('name')

            if (residentsError) throw residentsError

            setReceivables(receivablesData || [])
            setResidents(residentsData || [])
        } catch (error) {
            console.error('Erro ao buscar dados:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            const { error } = await supabase
                .from('accounts_receivable')
                .insert([{
                    ...formData,
                    resident_id: formData.resident_id || null,
                    amount: parseFloat(formData.amount.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()),
                    total_amount: parseFloat(formData.amount.replace("R$", "").replace(/\./g, "").replace(",", ".").trim())
                }])

            if (error) throw error

            setShowModal(false)
            setFormData({
                resident_id: '',
                description: '',
                amount: '',
                due_date: '',
                status: 'pendente'
            })
            fetchData()
            alert('Receita lançada com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro ao salvar receita: ' + error.message)
        }
    }

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const handleCurrencyChange = (e) => {
        let value = e.target.value.replace(/\D/g, "")
        value = (Number(value) / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        })
        setFormData({ ...formData, amount: value })
    }

    const markAsReceived = async (id) => {
        if (!confirm('Confirmar recebimento desta conta?')) return

        try {
            const { error } = await supabase
                .from('accounts_receivable')
                .update({
                    status: 'pago',
                    payment_date: new Date().toISOString()
                })
                .eq('id', id)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Erro ao processar recebimento:', error)
            alert('Erro ao processar recebimento')
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        return new Date(dateString).toLocaleDateString('pt-BR') // Ajustado para não usar timezone UTC se gravado como date
    }

    // Função auxiliar para parse de data string local para exibição correta
    const displayDate = (dateStr) => {
        if (!dateStr) return '-'
        // Assumindo formato YYYY-MM-DD do banco
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="loading"></div>
            </div>
        )
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-lg">
                <div>
                    <h1 className="page-title">Contas a Receber</h1>
                    <p className="page-subtitle">Gestão de receitas e cobranças</p>
                </div>
                <button
                    className="btn btn-success"
                    onClick={() => setShowModal(true)}
                >
                    + Nova Receita
                </button>
            </div>

            <div className="card">
                {receivables.length === 0 ? (
                    <div className="text-center p-xl text-gray">
                        Nenhuma conta a receber registrada.
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Descrição</th>
                                    <th>Morador</th>
                                    <th>Vencimento</th>
                                    <th>Valor</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receivables.map((item) => (
                                    <tr key={item.id}>
                                        <td className="font-medium">{item.description}</td>
                                        <td>
                                            {item.residents ? (
                                                <div className="text-sm">
                                                    <div className="font-medium">{item.residents.name}</div>
                                                    <div className="text-gray">
                                                        Apto {item.residents.unit_number}
                                                        {item.residents.block && ` - Bloco ${item.residents.block}`}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="badge badge-info">Receita Diversa / Avulsa</span>
                                            )}
                                        </td>
                                        <td>{displayDate(item.due_date)}</td>
                                        <td className="font-medium">{formatCurrency(item.total_amount)}</td>
                                        <td>
                                            <span className={`badge ${item.status === 'pago' ? 'badge-success' :
                                                item.status === 'atrasado' ? 'badge-danger' : 'badge-warning'
                                                }`}>
                                                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                            </span>
                                        </td>
                                        <td>
                                            {item.status !== 'pago' && (
                                                <button
                                                    className="btn btn-sm btn-outline btn-success"
                                                    onClick={() => markAsReceived(item.id)}
                                                >
                                                    Receber
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Cadastro */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Nova Receita</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowModal(false)}
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <select
                                    name="resident_id"
                                    className="select"
                                    value={formData.resident_id}
                                    onChange={handleChange}
                                >
                                    <option value="">-- Receita Avulsa / Saldo Inicial --</option>
                                    {residents.map(resident => (
                                        <option key={resident.id} value={resident.id}>
                                            {resident.name} - Apto {resident.unit_number} {resident.block ? `(${resident.block})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray mt-xs">Deixe em branco para receitas gerais (ex: Saldo Inicial, Aluguel Salão)</p>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Descrição</label>
                                <input
                                    type="text"
                                    name="description"
                                    required
                                    className="input"
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder="Ex: Condomínio Julho/2024"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-md">
                                <div className="input-group">
                                    <label className="input-label">Valor (R$)</label>
                                    <input
                                        type="text"
                                        name="amount"
                                        required
                                        className="input"
                                        value={formData.amount}
                                        onChange={handleCurrencyChange}
                                        placeholder="R$ 0,00"
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Data de Vencimento</label>
                                    <input
                                        type="date"
                                        name="due_date"
                                        required
                                        className="input"
                                        value={formData.due_date}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Status Inicial</label>
                                <select
                                    name="status"
                                    className="select"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    <option value="pendente">Pendente</option>
                                    <option value="pago">Pago (Recebido)</option>
                                    <option value="atrasado">Atrasado</option>
                                </select>
                            </div>

                            <div className="flex justify-center gap-md mt-lg">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-success">
                                    Gerar Cobrança
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
