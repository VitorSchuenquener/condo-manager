import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'

export default function AccountsPayable() {
    const [expenses, setExpenses] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showPayModal, setShowPayModal] = useState(false)

    // State for Payment Confirmation
    const [selectedExpenseId, setSelectedExpenseId] = useState(null)
    const [payData, setPayData] = useState({
        payment_date: new Date().toISOString().split('T')[0],
        invoice_url: '' // Will store URL of uploaded proof
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
            toast.error('⚠️ OBRIGATÓRIO: Anexe a Nota Fiscal ou Comprovante para registrar como pago!', { duration: 6000 })
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
            toast.success(formData.status === 'pago' ? '✅ Conta registrada como PAGA com sucesso!' : '✅ Conta registrada com sucesso!', { duration: 5000 })
        } catch (error) {
            console.error('Erro ao salvar:', error)
            toast.error('Erro ao salvar conta: ' + error.message)
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

    // Open Pay Modal
    const openPayModal = (id) => {
        setSelectedExpenseId(id)
        setPayData({
            payment_date: new Date().toISOString().split('T')[0],
            invoice_url: ''
        })
        setUploadedProof(null) // Reset proof
        setShowPayModal(true)
    }

    // --- UPLOAD NO CONFIRM PAYMENT ---
    const confirmPayment = async (e) => {
        e.preventDefault()

        if (!uploadedProof) {
            toast.error('⚠️ OBRIGATÓRIO: Anexe a Nota Fiscal ou Comprovante!', { duration: 6000 })
            return
        }

        setUploading(true)
        try {
            // Upload do arquivo
            const fileExt = uploadedProof.name.split('.').pop()
            const fileName = `${Math.random()}.${fileExt}`
            const filePath = `payment_proofs/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, uploadedProof)

            if (uploadError) throw uploadError

            const { data } = supabase.storage.from('documents').getPublicUrl(filePath)
            const proofUrl = data.publicUrl

            // Atualizar no banco
            const { error } = await supabase
                .from('accounts_payable')
                .update({
                    status: 'pago',
                    payment_date: payData.payment_date,
                    invoice_url: proofUrl // Salvando a URL do arquivo agora
                })
                .eq('id', selectedExpenseId)

            if (error) throw error

            setShowPayModal(false)
            setUploadedProof(null)
            fetchExpenses()
            toast.success('✅ Pagamento registrado com sucesso!', { duration: 5000 })
        } catch (error) {
            console.error('Erro ao processar pagamento:', error)
            toast.error('Erro ao processar: ' + error.message)
        } finally {
            setUploading(false)
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

    // Helper para buscar dados da conta selecionada
    const selectedExpense = expenses.find(e => e.id === selectedExpenseId)

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
                                                    NF/Doc: {expense.invoice_url.length > 20 ? 'Ver Arquivo' : expense.invoice_url}
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

            {/* Modal de Pagamento Profissional - PADRÃO PREMIUM - ESTILOS INLINE */}
            {showPayModal && selectedExpense && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '600px', borderRadius: '12px', overflow: 'hidden', padding: 0 }}>

                        {/* Header Elegante (Vermelho para Saída de Caixa) */}
                        <div style={{
                            backgroundColor: '#fef2f2',
                            borderBottom: '1px solid #fee2e2',
                            padding: '20px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    background: '#fee2e2',
                                    color: '#b91c1c',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '20px'
                                }}>💸</div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>Registrar Pagamento</h2>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Confirme os dados e anexe a Nota Fiscal</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPayModal(false)}
                                style={{ background: 'none', border: 'none', fontSize: '24px', color: '#94a3b8', cursor: 'pointer' }}
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={confirmPayment} style={{ padding: '24px' }}>

                            {/* Card de Resumo da Despesa */}
                            <div style={{
                                backgroundColor: '#fff1f2',
                                border: '1px solid #ffe4e6',
                                borderRadius: '8px',
                                padding: '16px',
                                marginBottom: '24px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#e11d48', textTransform: 'uppercase', marginBottom: '4px' }}>Detalhes da Despesa</p>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>{selectedExpense.description}</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#475569' }}>
                                        Categoria: {categories.find(c => c.value === selectedExpense.category)?.label || selectedExpense.category}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Valor a Pagar</p>
                                    <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#b91c1c' }}>{formatCurrency(selectedExpense.amount)}</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Vencimento: {formatDate(selectedExpense.due_date)}</p>
                                </div>
                            </div>

                            {/* Input Data */}
                            <div style={{ marginBottom: '16px' }}>
                                <div className="input-group">
                                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>Data do Pagamento</label>
                                    <input
                                        type="date"
                                        className="input"
                                        style={{ width: '100%' }}
                                        value={payData.payment_date}
                                        onChange={(e) => setPayData({ ...payData, payment_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Upload Profissional */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span>Nota Fiscal / Comprovante <span style={{ color: '#ef4444' }}>*</span></span>
                                    {uploadedProof && <button type="button" onClick={(e) => { e.stopPropagation(); setUploadedProof(null) }} style={{ color: '#ef4444', background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>Remover</button>}
                                </label>

                                <div
                                    {...getRootProps()}
                                    style={{
                                        border: `2px dashed ${uploadedProof ? '#4ade80' : isDragActive ? '#60a5fa' : '#cbd5e1'}`,
                                        borderRadius: '8px',
                                        padding: '24px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: uploadedProof ? '#f0fdf4' : isDragActive ? '#eff6ff' : '#fff',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <input {...getInputProps()} />

                                    {uploadedProof ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ width: '40px', height: '40px', background: '#dcfce7', color: '#166534', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '8px' }}>
                                                📄
                                            </div>
                                            <p style={{ fontWeight: 'bold', color: '#15803d', fontSize: '14px', margin: 0 }}>{uploadedProof.name}</p>
                                            <p style={{ fontSize: '12px', color: '#16a34a', margin: '4px 0 0' }}>Pronto para envio</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ fontSize: '28px', color: '#cbd5e1', marginBottom: '8px' }}>☁️</div>
                                            <p style={{ fontWeight: '500', color: '#475569', fontSize: '14px', margin: 0 }}>Clique ou arraste a NF aqui</p>
                                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>PDF, JPG ou PNG</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Compliance Info */}
                            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '6px', padding: '12px', marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <span style={{ fontSize: '16px' }}>ℹ️</span>
                                <p style={{ fontSize: '12px', color: '#9a3412', margin: 0, lineHeight: '1.5' }}>
                                    <strong>Compliance:</strong> É obrigatório anexar a Nota Fiscal para justificar a saída de caixa no balancete mensal.
                                </p>
                            </div>

                            {/* Footer / Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setShowPayModal(false)}
                                    disabled={uploading}
                                    style={{ padding: '8px 24px' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{
                                        padding: '8px 24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        backgroundColor: (uploading || !uploadedProof) ? '#9ca3af' : '#ef4444',
                                        borderColor: (uploading || !uploadedProof) ? '#9ca3af' : '#ef4444',
                                        color: 'white',
                                        cursor: (uploading || !uploadedProof) ? 'not-allowed' : 'pointer'
                                    }}
                                    disabled={uploading || !uploadedProof}
                                >
                                    {uploading ? (
                                        'Processando...'
                                    ) : (
                                        <>
                                            <span>💸</span> Confirmar Pagamento
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
