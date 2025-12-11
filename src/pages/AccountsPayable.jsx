import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AccountsPayable() {
    const [expenses, setExpenses] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [formData, setFormData] = useState({
        description: '',
        category: 'outros',
        amount: '',
        due_date: '',
        status: 'pendente'
    })

    const categories = [
        { value: 'agua', label: 'Água' },
        { value: 'luz', label: 'Energia Elétrica' },
        { value: 'salarios', label: 'Salários' },
        { value: 'manutencao', label: 'Manutenção' },
        { value: 'limpeza', label: 'Limpeza' },
        { value: 'outros', label: 'Outros' }
    ]

    useEffect(() => {
        fetchExpenses()
    }, [])

    const fetchExpenses = async () => {
        try {
            const { data, error } = await supabase
                .from('accounts_payable')
                .select('*')
                .order('due_date', { ascending: true })

            if (error) throw error
            setExpenses(data || [])
        } catch (error) {
            console.error('Erro ao buscar contas:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            const { error } = await supabase
                .from('accounts_payable')
                .insert([formData])

            if (error) throw error

            setShowModal(false)
            setFormData({
                description: '',
                category: 'outros',
                amount: '',
                due_date: '',
                status: 'pendente'
            })
            fetchExpenses()
            alert('Conta registrada com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro ao salvar conta: ' + error.message)
        }
    }

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const markAsPaid = async (id) => {
        if (!confirm('Confirmar pagamento desta conta?')) return

        try {
            const { error } = await supabase
                .from('accounts_payable')
                .update({
                    status: 'pago',
                    payment_date: new Date().toISOString()
                })
                .eq('id', id)

            if (error) throw error
            fetchExpenses()
        } catch (error) {
            console.error('Erro ao processar pagamento:', error)
            alert('Erro ao processar pagamento')
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
        return new Date(dateString).toLocaleDateString('pt-BR')
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
                    <h1 className="page-title">Contas a Pagar</h1>
                    <p className="page-subtitle">Gestão de despesas e fornecedores</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowModal(true)}
                >
                    + Nova Conta
                </button>
            </div>

            <div className="card">
                {expenses.length === 0 ? (
                    <div className="text-center p-xl text-gray">
                        Nenhuma conta registrada. Clique em "Nova Conta" para começar.
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Descrição</th>
                                    <th>Categoria</th>
                                    <th>Vencimento</th>
                                    <th>Valor</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map((expense) => (
                                    <tr key={expense.id}>
                                        <td className="font-medium">{expense.description}</td>
                                        <td>
                                            {categories.find(c => c.value === expense.category)?.label || expense.category}
                                        </td>
                                        <td>{formatDate(expense.due_date)}</td>
                                        <td className="font-medium">{formatCurrency(expense.amount)}</td>
                                        <td>
                                            <span className={`badge ${expense.status === 'pago' ? 'badge-success' :
                                                    expense.status === 'atrasado' ? 'badge-danger' : 'badge-warning'
                                                }`}>
                                                {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
                                            </span>
                                        </td>
                                        <td>
                                            {expense.status !== 'pago' && (
                                                <button
                                                    className="btn btn-sm btn-outline btn-success"
                                                    onClick={() => markAsPaid(expense.id)}
                                                >
                                                    Pagar
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
                            <h2 className="modal-title">Nova Despesa</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowModal(false)}
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label className="input-label">Descrição</label>
                                <input
                                    type="text"
                                    name="description"
                                    required
                                    className="input"
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder="Ex: Conta de Luz Referente Março"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-md">
                                <div className="input-group">
                                    <label className="input-label">Categoria</label>
                                    <select
                                        name="category"
                                        className="select"
                                        value={formData.category}
                                        onChange={handleChange}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat.value} value={cat.value}>
                                                {cat.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Valor (R$)</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        required
                                        step="0.01"
                                        className="input"
                                        value={formData.amount}
                                        onChange={handleChange}
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

                                <div className="input-group">
                                    <label className="input-label">Status Inicial</label>
                                    <select
                                        name="status"
                                        className="select"
                                        value={formData.status}
                                        onChange={handleChange}
                                    >
                                        <option value="pendente">Pendente</option>
                                        <option value="pago">Pago</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-center gap-md mt-lg">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Registrar Conta
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
