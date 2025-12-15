import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'

export default function AccountsReceivable() {
    const [receivables, setReceivables] = useState([])
    const [residents, setResidents] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showReceiptModal, setShowReceiptModal] = useState(false)
    const [selectedReceivable, setSelectedReceivable] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('todos')

    const [formData, setFormData] = useState({
        resident_id: '',
        description: '',
        amount: '',
        due_date: '',
        status: 'pendente'
    })

    // Estados do Modal de Recebimento
    const [receiptData, setReceiptData] = useState({
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'pix',
        payment_amount: 0
    })
    const [uploadedProof, setUploadedProof] = useState(null)
    const [uploading, setUploading] = useState(false)

    // Estados do Modal de Geração em Lote
    const [showBatchModal, setShowBatchModal] = useState(false)
    const [batchData, setBatchData] = useState({
        description: '',
        amount: '',
        due_date: '',
        filter: 'todos' // todos, proprietarios, inquilinos
    })
    const [batchProgress, setBatchProgress] = useState({
        isGenerating: false,
        current: 0,
        total: 0,
        created: 0,
        errors: []
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

            if (residentsError) throw residentsError

            const processedReceivables = processData(receivablesData || [])
            setReceivables(processedReceivables)
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

    // --- UPLOAD DE COMPROVANTE ---
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

    const uploadProof = async (file) => {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `payment_proofs/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file)

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('documents').getPublicUrl(filePath)
        return data.publicUrl
    }

    const openReceiptModal = (receivable) => {
        setSelectedReceivable(receivable)
        setReceiptData({
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: 'pix',
            payment_amount: receivable.totalCorrected
        })
        setUploadedProof(null)
        setShowReceiptModal(true)
    }

    const handleReceiptSubmit = async (e) => {
        e.preventDefault()

        if (!uploadedProof) {
            toast.error('⚠️ OBRIGATÓRIO: Anexe a Nota Fiscal ou Comprovante de Pagamento!', { duration: 6000 })
            return
        }

        setUploading(true)
        try {
            const proofUrl = await uploadProof(uploadedProof)

            const { error } = await supabase
                .from('accounts_receivable')
                .update({
                    status: 'pago',
                    payment_date: receiptData.payment_date,
                    payment_method: receiptData.payment_method,
                    payment_amount: receiptData.payment_amount,
                    payment_proof: [{ name: uploadedProof.name, url: proofUrl, type: 'nf' }]
                })
                .eq('id', selectedReceivable.id)

            if (error) throw error

            setShowReceiptModal(false)
            setUploadedProof(null)
            fetchData()
            toast.success('✅ Recebimento registrado com sucesso!', { duration: 5000 })
        } catch (error) {
            console.error('Erro ao processar recebimento:', error)
            toast.error('Erro ao processar: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    // --- GERAÇÃO EM LOTE ---
    const handleBatchGeneration = async () => {
        if (!batchData.description || !batchData.amount || !batchData.due_date) {
            alert('Preencha todos os campos obrigatórios!')
            return
        }

        setBatchProgress({ isGenerating: true, current: 0, total: 0, created: 0, errors: [] })

        try {
            // 1. Filtrar moradores conforme seleção
            let targetResidents = residents
            if (batchData.filter === 'proprietarios') {
                targetResidents = residents.filter(r => r.is_owner)
            } else if (batchData.filter === 'inquilinos') {
                targetResidents = residents.filter(r => !r.is_owner)
            }

            setBatchProgress(prev => ({ ...prev, total: targetResidents.length }))

            // 2. Verificar duplicatas (mesma descrição e vencimento)
            const { data: existing } = await supabase
                .from('accounts_receivable')
                .select('resident_id')
                .eq('description', batchData.description)
                .eq('due_date', batchData.due_date)

            const existingIds = new Set(existing?.map(e => e.resident_id) || [])

            // 3. Gerar faturas
            const amountValue = parseFloat(batchData.amount.replace("R$", "").replace(/\./g, "").replace(",", ".").trim())
            let created = 0
            const errors = []

            for (let i = 0; i < targetResidents.length; i++) {
                const resident = targetResidents[i]

                // Pular se já existe
                if (existingIds.has(resident.id)) {
                    errors.push(`${resident.name}: Fatura já existe`)
                    setBatchProgress(prev => ({ ...prev, current: i + 1 }))
                    continue
                }

                try {
                    const { error } = await supabase
                        .from('accounts_receivable')
                        .insert([{
                            resident_id: resident.id,
                            description: batchData.description,
                            amount: amountValue,
                            total_amount: amountValue,
                            due_date: batchData.due_date,
                            status: 'pendente'
                        }])

                    if (error) throw error
                    created++
                } catch (err) {
                    errors.push(`${resident.name}: ${err.message}`)
                }

                setBatchProgress(prev => ({ ...prev, current: i + 1, created, errors }))

                // Pequeno delay para não sobrecarregar o banco
                await new Promise(resolve => setTimeout(resolve, 50))
            }

            // 4. Finalizar
            setBatchProgress(prev => ({ ...prev, isGenerating: false }))

            if (errors.length === 0) {
                toast.success(`✅ ${created} faturas geradas com sucesso!`, { duration: 5000 })
                setShowBatchModal(false)
                fetchData()
            } else {
                toast.warning(`⚠️ ${created} faturas criadas. ${errors.length} erros/duplicatas. Veja o relatório no modal.`, { duration: 7000 })
            }

        } catch (error) {
            console.error('Erro na geração em lote:', error)
            alert('Erro ao gerar faturas: ' + error.message)
            setBatchProgress(prev => ({ ...prev, isGenerating: false }))
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

    // --- LÓGICA FINANCEIRA ---
    const calculateFinancials = (receivable) => {
        if (receivable.status === 'pago') return { ...receivable, daysLate: 0, penalty: 0, interest: 0, totalCorrected: receivable.total_amount, statusDisplay: 'pago' }

        const dueDate = new Date(receivable.due_date)
        // Ajuste de timezone para garantir comparação correta (assumindo vencimento ao final do dia)
        dueDate.setHours(23, 59, 59, 999)

        const today = new Date()
        const diffTime = today - dueDate
        const daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (daysLate > 0) {
            // Regra Brasileira de Condomínio:
            // Multa: 2%
            // Juros: 1% ao mês (0.0333% ao dia)
            const originalAmount = receivable.amount
            const penalty = originalAmount * 0.02 // 2%
            const interest = originalAmount * (0.000333 * daysLate) // 0.033% ao dia
            const totalCorrected = originalAmount + penalty + interest

            return {
                ...receivable,
                daysLate,
                penalty,
                interest,
                totalCorrected,
                statusDisplay: 'atrasado',
                shouldProtest: daysLate > 30 // Sugere protesto após 30 dias
            }
        }

        return { ...receivable, daysLate: 0, penalty: 0, interest: 0, totalCorrected: receivable.amount, statusDisplay: receivable.status }
    }

    const simpleDate = (dateStr) => {
        if (!dateStr) return '-'
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }

    // Processa os dados brutos do banco e aplica a matemática
    const processData = (rawData) => {
        return rawData.map(item => calculateFinancials(item))
    }

    // --- KPIs FINANCEIROS ---
    const totalReceivable = receivables
        .filter(r => r.status !== 'pago')
        .reduce((sum, r) => sum + r.totalCorrected, 0)

    const totalOverdue = receivables
        .filter(r => r.statusDisplay === 'atrasado')
        .reduce((sum, r) => sum + r.totalCorrected, 0)

    const totalReceived = receivables
        .filter(r => r.status === 'pago')
        .reduce((sum, r) => sum + (r.payment_amount || r.total_amount), 0)

    // --- FILTROS ---
    const filteredReceivables = receivables.filter(item => {
        const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.residents?.name.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesStatus = statusFilter === 'todos' ||
            (statusFilter === 'pendente' && item.status === 'pendente') ||
            (statusFilter === 'atrasado' && item.statusDisplay === 'atrasado') ||
            (statusFilter === 'pago' && item.status === 'pago')

        return matchesSearch && matchesStatus
    })

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="loading"></div>
            </div>
        )
    }

    return (
        <div>
            {/* Header e KPIs */}
            <div className="mb-lg">
                <h1 className="page-title">Contas a Receber</h1>
                <p className="page-subtitle">Gestão de receitas e cobranças</p>

                <div className="grid grid-cols-3 gap-md mt-md">
                    <div className="card p-md flex items-center justify-between border-l-4 border-warning">
                        <div>
                            <p className="text-gray text-sm font-medium">Total a Receber</p>
                            <p className="text-2xl font-bold text-dark">{formatCurrency(totalReceivable)}</p>
                        </div>
                        <div className="text-3xl">💰</div>
                    </div>
                    <div className="card p-md flex items-center justify-between border-l-4 border-danger">
                        <div>
                            <p className="text-gray text-sm font-medium">Em Atraso</p>
                            <p className="text-2xl font-bold text-danger">{formatCurrency(totalOverdue)}</p>
                        </div>
                        <div className="text-3xl">⚠️</div>
                    </div>
                    <div className="card p-md flex items-center justify-between border-l-4 border-success">
                        <div>
                            <p className="text-gray text-sm font-medium">Recebido (Total)</p>
                            <p className="text-2xl font-bold text-success">{formatCurrency(totalReceived)}</p>
                        </div>
                        <div className="text-3xl">✅</div>
                    </div>
                </div>
            </div>

            {/* Barra de Filtros */}
            <div className="flex justify-between items-center mb-md gap-md">
                <div className="flex gap-md flex-1">
                    <input
                        type="text"
                        placeholder="🔍 Buscar por descrição ou morador..."
                        className="input flex-1"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <select
                        className="input"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="todos">Todos</option>
                        <option value="pendente">Pendentes</option>
                        <option value="atrasado">Atrasados</option>
                        <option value="pago">Pagos</option>
                    </select>
                </div>
                <div className="flex gap-sm">
                    <button
                        className="btn btn-primary whitespace-nowrap"
                        onClick={() => setShowBatchModal(true)}
                    >
                        📋 Gerar Faturas
                    </button>
                    <button
                        className="btn btn-success whitespace-nowrap"
                        onClick={() => setShowModal(true)}
                    >
                        + Nova Receita
                    </button>
                </div>
            </div>

            <div className="card">
                {filteredReceivables.length === 0 ? (
                    <div className="text-center p-xl text-gray">
                        {searchTerm || statusFilter !== 'todos'
                            ? 'Nenhuma conta encontrada com os filtros aplicados.'
                            : 'Nenhuma conta a receber registrada.'}
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
                                {filteredReceivables.map((item) => (
                                    <tr key={item.id} className={item.statusDisplay === 'atrasado' ? 'bg-red-50' : ''}>
                                        <td className="font-medium">
                                            {item.description}
                                            {item.statusDisplay === 'atrasado' && (
                                                <div className="text-xs text-danger font-bold mt-1">
                                                    ⚠️ {item.daysLate} dias de atraso
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {item.residents ? (
                                                <div className="text-sm">
                                                    <div className="font-medium">{item.residents.name}</div>
                                                    <div className="text-gray">
                                                        Casa {item.residents.unit_number}
                                                        {item.residents.block && ` - ${item.residents.block}`}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="badge badge-info text-xs">Receita Avulsa</span>
                                            )}
                                        </td>
                                        <td>{simpleDate(item.due_date)}</td>
                                        <td>
                                            <div className="font-medium text-dark">{formatCurrency(item.totalCorrected)}</div>
                                            {item.daysLate > 0 && item.status !== 'pago' && (
                                                <div className="text-xs text-gray-500" title={`Multa: ${formatCurrency(item.penalty)} | Juros: ${formatCurrency(item.interest)}`}>
                                                    Original: {formatCurrency(item.amount)}
                                                    <br />
                                                    <span className="text-danger">+ Juros/Multa</span>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge ${item.statusDisplay === 'pago' ? 'badge-success' :
                                                item.statusDisplay === 'atrasado' ? 'badge-danger' : 'badge-warning'
                                                }`}>
                                                {item.statusDisplay.toUpperCase()}
                                            </span>
                                            {item.shouldProtest && item.status !== 'pago' && (
                                                <div className="mt-xs">
                                                    <span className="badge badge-dark text-xs animate-pulse">
                                                        ⚖️ PROTESTAR
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {item.status !== 'pago' && (
                                                <button
                                                    className="btn btn-sm btn-outline btn-success w-full"
                                                    onClick={() => openReceiptModal(item)}
                                                >
                                                    💵 Receber {formatCurrency(item.totalCorrected)}
                                                </button>
                                            )}
                                            {item.status === 'pago' && item.payment_proof && (
                                                <a
                                                    href={item.payment_proof[0]?.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="btn btn-sm btn-outline text-xs"
                                                >
                                                    📄 Ver NF
                                                </a>
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

            {/* Modal de Recebimento com Upload de NF */}
            {showReceiptModal && selectedReceivable && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">💵 Registrar Recebimento</h2>
                            <button className="modal-close" onClick={() => setShowReceiptModal(false)}>&times;</button>
                        </div>

                        <form onSubmit={handleReceiptSubmit}>
                            {/* Informações da Conta */}
                            <div className="bg-gray-50 p-md rounded mb-md">
                                <p className="text-sm text-gray mb-xs"><strong>Descrição:</strong> {selectedReceivable.description}</p>
                                <p className="text-sm text-gray mb-xs"><strong>Morador:</strong> {selectedReceivable.residents?.name || 'Receita Avulsa'}</p>
                                <p className="text-sm text-gray mb-xs"><strong>Vencimento:</strong> {simpleDate(selectedReceivable.due_date)}</p>
                                {selectedReceivable.daysLate > 0 && (
                                    <p className="text-sm text-danger font-bold">⚠️ {selectedReceivable.daysLate} dias de atraso</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-md">
                                <div className="input-group">
                                    <label className="input-label">Data do Recebimento</label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={receiptData.payment_date}
                                        onChange={(e) => setReceiptData({ ...receiptData, payment_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Forma de Pagamento</label>
                                    <select
                                        className="input"
                                        value={receiptData.payment_method}
                                        onChange={(e) => setReceiptData({ ...receiptData, payment_method: e.target.value })}
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
                                <label className="input-label">Valor Recebido (com juros/multa)</label>
                                <input
                                    type="text"
                                    className="input font-bold text-lg"
                                    value={formatCurrency(receiptData.payment_amount)}
                                    readOnly
                                    style={{ background: '#f0f9ff' }}
                                />
                                {selectedReceivable.daysLate > 0 && (
                                    <p className="text-xs text-gray mt-xs">
                                        Original: {formatCurrency(selectedReceivable.amount)} +
                                        Multa: {formatCurrency(selectedReceivable.penalty)} +
                                        Juros: {formatCurrency(selectedReceivable.interest)}
                                    </p>
                                )}
                            </div>

                            {/* Upload Obrigatório de Comprovante */}
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
                                <p className="text-xs text-gray mt-xs">
                                    ⚖️ <strong>Compliance Contábil:</strong> Todo recebimento precisa de comprovante fiscal para registro no balancete.
                                </p>
                            </div>

                            <div className="flex justify-center gap-md mt-lg">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setShowReceiptModal(false)}
                                    disabled={uploading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-success"
                                    disabled={uploading || !uploadedProof}
                                >
                                    {uploading ? 'Processando...' : '✅ Confirmar Recebimento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Geração em Lote */}
            {showBatchModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">📋 Geração em Lote de Faturas</h2>
                            <button className="modal-close" onClick={() => setShowBatchModal(false)}>&times;</button>
                        </div>

                        <div className="p-md">
                            <div className="input-group">
                                <label className="input-label">Descrição</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={batchData.description}
                                    onChange={(e) => setBatchData({ ...batchData, description: e.target.value })}
                                    placeholder="Ex: Condomínio Janeiro/2025"
                                    disabled={batchProgress.isGenerating}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-md">
                                <div className="input-group">
                                    <label className="input-label">Valor (R$)</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={batchData.amount}
                                        onChange={(e) => {
                                            let value = e.target.value.replace(/\D/g, "")
                                            value = (Number(value) / 100).toLocaleString("pt-BR", {
                                                style: "currency",
                                                currency: "BRL"
                                            })
                                            setBatchData({ ...batchData, amount: value })
                                        }}
                                        placeholder="R$ 0,00"
                                        disabled={batchProgress.isGenerating}
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Vencimento</label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={batchData.due_date}
                                        onChange={(e) => setBatchData({ ...batchData, due_date: e.target.value })}
                                        disabled={batchProgress.isGenerating}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Aplicar para</label>
                                <select
                                    className="input"
                                    value={batchData.filter}
                                    onChange={(e) => setBatchData({ ...batchData, filter: e.target.value })}
                                    disabled={batchProgress.isGenerating}
                                >
                                    <option value="todos">Todos os moradores</option>
                                    <option value="proprietarios">Apenas Proprietários</option>
                                    <option value="inquilinos">Apenas Inquilinos</option>
                                </select>
                            </div>

                            {/* Preview */}
                            {!batchProgress.isGenerating && batchProgress.total === 0 && (
                                <div className="bg-blue-50 border-l-4 border-primary p-md">
                                    <p className="text-sm font-bold mb-xs">📊 Preview</p>
                                    <p className="text-sm">
                                        {batchData.filter === 'todos' && `${residents.length} faturas serão criadas`}
                                        {batchData.filter === 'proprietarios' && `${residents.filter(r => r.is_owner).length} faturas (proprietários)`}
                                        {batchData.filter === 'inquilinos' && `${residents.filter(r => !r.is_owner).length} faturas (inquilinos)`}
                                    </p>
                                    <p className="text-xs text-gray mt-xs">
                                        ⚠️ Duplicatas serão automaticamente ignoradas
                                    </p>
                                </div>
                            )}

                            {/* Barra de Progresso */}
                            {batchProgress.isGenerating && (
                                <div className="bg-gray-50 p-md rounded">
                                    <p className="text-sm font-bold mb-xs">Gerando faturas...</p>
                                    <div className="w-full bg-gray-200 rounded-full h-4 mb-xs">
                                        <div
                                            className="bg-primary h-4 rounded-full transition-all"
                                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray">
                                        {batchProgress.current} / {batchProgress.total} processados | {batchProgress.created} criadas
                                    </p>
                                </div>
                            )}

                            {/* Relatório de Erros */}
                            {!batchProgress.isGenerating && batchProgress.errors.length > 0 && (
                                <div className="bg-yellow-50 border-l-4 border-warning p-md max-h-40 overflow-y-auto">
                                    <p className="text-sm font-bold mb-xs">⚠️ Avisos ({batchProgress.errors.length})</p>
                                    {batchProgress.errors.slice(0, 10).map((err, idx) => (
                                        <p key={idx} className="text-xs text-gray">{err}</p>
                                    ))}
                                    {batchProgress.errors.length > 10 && (
                                        <p className="text-xs text-gray mt-xs">+ {batchProgress.errors.length - 10} mais...</p>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-sm mt-lg">
                                <button
                                    className="btn btn-outline"
                                    onClick={() => setShowBatchModal(false)}
                                    disabled={batchProgress.isGenerating}
                                >
                                    {batchProgress.isGenerating ? 'Aguarde...' : 'Cancelar'}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleBatchGeneration}
                                    disabled={batchProgress.isGenerating || !batchData.description || !batchData.amount || !batchData.due_date}
                                >
                                    {batchProgress.isGenerating ? 'Gerando...' : '✅ Gerar Faturas'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
