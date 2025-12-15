import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useDropzone } from 'react-dropzone'

export default function AccountsPayable() {
    const [expenses, setExpenses] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showPayModal, setShowPayModal] = useState(false)

    // State for Payment Confirmation
    const [selectedExpenseId, setSelectedExpenseId] = useState(null)
    const [payData, setPayData] = useState({
        payment_date: new Date().toISOString().split('T')[0],
        invoice_url: '' // Will store "Number/Link" of NF
    })

    const [formData, setFormData] = useState({
        description: '',
        category: 'outros',
        amount: '',
        due_date: '',
        status: 'pendente',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'pix'
    })

    const [uploadedProof, setUploadedProof] = useState(null)
    const [uploading, setUploading] = useState(false)

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

        // Validação: Se status = 'pago', exige NF
        if (formData.status === 'pago' && !uploadedProof) {
            alert('⚠️ OBRIGATÓRIO: Anexe a Nota Fiscal ou Comprovante para registrar como pago!')
            return
        }

        setUploading(true)
        try {
            let proofUrl = null

            // Upload da NF se status = 'pago'
            if (formData.status === 'pago' && uploadedProof) {
                const fileExt = uploadedProof.name.split('.').pop()
                const fileName = `${Math.random()}.${fileExt}`
                const filePath = `payment_proofs/${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('documents')
                    .upload(filePath, uploadedProof)

                if (uploadError) throw uploadError

                const { data } = supabase.storage.from('documents').getPublicUrl(filePath)
                proofUrl = data.publicUrl
            }

            // Preparar dados para inserção
            const dataToInsert = {
                description: formData.description,
                category: formData.category,
                amount: parseFloat(formData.amount),
                due_date: formData.due_date,
                status: formData.status
            }

            // Se pago, adicionar dados de pagamento
            if (formData.status === 'pago') {
                dataToInsert.payment_date = formData.payment_date
                dataToInsert.payment_method = formData.payment_method
                dataToInsert.invoice_url = proofUrl || uploadedProof.name
            }

            const { error } = await supabase
                .from('accounts_payable')
                .insert([dataToInsert])

            if (error) throw error

            setShowModal(false)
            setFormData({
                description: '',
                category: 'outros',
                amount: '',
                due_date: '',
                status: 'pendente',
                payment_date: new Date().toISOString().split('T')[0],
                payment_method: 'pix'
            })
            setUploadedProof(null)
            fetchExpenses()
            alert(formData.status === 'pago' ? '✅ Conta registrada como PAGA com sucesso!' : '✅ Conta registrada com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro ao salvar conta: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    // Dropzone para NF
    const onDropProof = useCallback(acceptedFiles => {
        if (acceptedFiles?.length > 0) {
            setUploadedProof(acceptedFiles[0])
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: onDropProof,
        multiple: false,
        accept: { 'image/*': [], 'application/pdf': [] }
    })

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    // New Function to Open Pay Modal
    const openPayModal = (id) => {
        setSelectedExpenseId(id)
        setPayData({
            payment_date: new Date().toISOString().split('T')[0],
            invoice_url: ''
        })
        setShowPayModal(true)
    }

    const confirmPayment = async (e) => {
        e.preventDefault()
        if (!payData.invoice_url) {
            alert('Erro: O número da Nota Fiscal ou Comprovante é obrigatório para compliance.')
            return
        }

        try {
            const { error } = await supabase
                .from('accounts_payable')
                .update({
                    status: 'pago',
                    payment_date: payData.payment_date,
                    invoice_url: payData.invoice_url
                })
                .eq('id', selectedExpenseId)

            if (error) throw error

            setShowPayModal(false)
            fetchExpenses()
            alert('Pagamento registrado com sucesso!')
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
                    <p className="page-subtitle">Gestão de despesas e compliance</p>
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
                                        <td className="font-medium">
                                            {expense.description}
                                            {expense.invoice_url && (
                                                <div className="text-xs text-gray truncate max-w-[150px]" title={expense.invoice_url}>
                                                    NF/Doc: {expense.invoice_url}
                                                </div>
                                            )}
                                        </td>
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
                                                    onClick={() => openPayModal(expense.id)}
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
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            {/* ... (Existing Form Fields keep logic same) ... */}
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
                                            <option key={cat.value} value={cat.value}>{cat.label}</option>
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
                                        className="input"
                                        value={formData.status}
                                        onChange={handleChange}
                                    >
                                        <option value="pendente">Pendente</option>
                                        <option value="pago">Pago (Lançamento Retroativo)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Campos adicionais se status = 'pago' */}
                            {formData.status === 'pago' && (
                                <div className="bg-blue-50 border-l-4 border-primary p-md mb-md">
                                    <p className="font-bold mb-sm">📋 Dados do Pagamento</p>

                                    <div className="grid grid-cols-2 gap-md mb-md">
                                        <div className="input-group">
                                            <label className="input-label">Data do Pagamento</label>
                                            <input
                                                type="date"
                                                name="payment_date"
                                                className="input"
                                                value={formData.payment_date}
                                                onChange={handleChange}
                                                required
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Forma de Pagamento</label>
                                            <select
                                                name="payment_method"
                                                className="input"
                                                value={formData.payment_method}
                                                onChange={handleChange}
                                            >
                                                <option value="pix">PIX</option>
                                                <option value="transferencia">Transferência</option>
                                                <option value="boleto">Boleto</option>
                                                <option value="dinheiro">Dinheiro</option>
                                                <option value="cheque">Cheque</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label text-danger font-bold">📄 Nota Fiscal / Comprovante (OBRIGATÓRIO)</label>
                                        <div
                                            {...getRootProps()}
                                            className={`border-2 border-dashed rounded p-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-success bg-green-50' : uploadedProof ? 'border-success bg-green-50' : 'border-danger bg-red-50'
                                                }`}
                                        >
                                            <input {...getInputProps()} />
                                            {uploadedProof ? (
                                                <div className="text-success font-medium">
                                                    ✅ {uploadedProof.name}
                                                    <p className="text-xs mt-xs">Clique ou arraste outro para substituir</p>
                                                </div>
                                            ) : (
                                                <div className={isDragActive ? 'text-success' : 'text-danger'}>
                                                    <p className="font-bold mb-xs">⚠️ Anexe a NF ou Comprovante</p>
                                                    <p className="text-sm">Arraste o arquivo ou clique aqui</p>
                                                    <p className="text-xs text-gray mt-xs">PDF ou Imagem</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-center gap-md mt-lg">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setShowModal(false)}
                                    disabled={uploading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={uploading}
                                >
                                    {uploading ? 'Salvando...' : 'Registrar Conta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* NEW Modal Confirm Payment with Invoice */}
            {showPayModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Confirmar Pagamento</h2>
                            <button className="modal-close" onClick={() => setShowPayModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={confirmPayment}>
                            <div className="p-md bg-blue-50 border border-blue-100 rounded mb-lg">
                                <p className="text-sm text-primary">
                                    ℹ️ Por questões de compliance, é obrigatório informar o número da Nota Fiscal ou Recibo para efetivar a baixa.
                                </p>
                            </div>

                            <div className="input-group">
                                <label className="input-label required">Data do Pagamento</label>
                                <input
                                    type="date"
                                    required
                                    className="input"
                                    value={payData.payment_date}
                                    onChange={(e) => setPayData({ ...payData, payment_date: e.target.value })}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label required">Nº Nota Fiscal / Recibo</label>
                                <input
                                    type="text"
                                    required
                                    className="input"
                                    placeholder="Ex: NF-e 12345 ou Recibo 987"
                                    value={payData.invoice_url}
                                    onChange={(e) => setPayData({ ...payData, invoice_url: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-end gap-sm mt-lg">
                                <button type="button" className="btn btn-outline" onClick={() => setShowPayModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-success">Confirmar Pagamento</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
