import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Collections() {
    // State for Defaulters Monitor
    const [defaulters, setDefaulters] = useState([])

    // State for Protest Processes
    const [processes, setProcesses] = useState([])

    const [loading, setLoading] = useState(true)
    const [showProcessModal, setShowProcessModal] = useState(false)
    const [showChecklistModal, setShowChecklistModal] = useState(false)
    const [showContactModal, setShowContactModal] = useState(false)
    const [selectedDefaulter, setSelectedDefaulter] = useState(null)
    const [selectedProcess, setSelectedProcess] = useState(null)
    const [selectedContact, setSelectedContact] = useState(null)
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

    // Função para Gerar Carta de Cobrança PDF (VERSÃO PROFISSIONAL)
    const generateCollectionLetter = (defaulter) => {
        try {
            console.log('Generating Professional Letter for:', defaulter.resident.name)
            const doc = new jsPDF()

            // --- PALETA DE CORES ---
            const PRIMARY_COLOR = [30, 58, 138] // Azul Escuro (Navy)
            const SECONDARY_COLOR = [220, 38, 38] // Vermelho (Destaque)
            const TEXT_COLOR = [51, 65, 85] // Cinza Escuro
            const BG_LIGHT = [241, 245, 249] // Cinza Claro

            // --- CABEÇALHO ---
            // Barra lateral colorida
            doc.setFillColor(...PRIMARY_COLOR)
            doc.rect(0, 0, 15, 297, 'F') // Lateral esquerda inteira

            // Título do Documento
            doc.setTextColor(...PRIMARY_COLOR)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(16) // Reduzido para evitar sobreposição
            doc.text('NOTIFICAÇÃO EXTRAJUDICIAL', 25, 25)

            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(100)
            doc.text('DE COBRANÇA E CONSTITUIÇÃO EM MORA', 25, 30)

            // Logo / Nome do Condomínio (Simulado)
            doc.setFontSize(10)
            doc.setTextColor(0)
            doc.setFont('helvetica', 'bold')
            doc.text('CondoManager System', 190, 25, { align: 'right' })
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.text('Administração Financeira e Jurídica', 190, 29, { align: 'right' })

            // Linha Divisória
            doc.setDrawColor(...PRIMARY_COLOR)
            doc.setLineWidth(0.5)
            doc.line(25, 35, 190, 35)

            // --- DESTINATÁRIO (BOX) ---
            doc.setFillColor(...BG_LIGHT)
            doc.roundedRect(25, 45, 165, 30, 2, 2, 'F')

            doc.setFontSize(10)
            doc.setTextColor(...TEXT_COLOR)
            doc.text('DESTINATÁRIO:', 30, 53)

            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(0)
            doc.text(defaulter.resident.name || 'Nome Indisponível', 30, 60)

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(11)
            doc.text(`Unidade: ${defaulter.resident.unit_number || '-'} ${defaulter.resident.block ? '| Bloco ' + defaulter.resident.block : ''}`, 30, 67)

            doc.setFontSize(10)
            doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 180, 53, { align: 'right' })

            // --- CORPO DO TEXTO ---
            doc.setFontSize(11)
            doc.setTextColor(...TEXT_COLOR)
            const introText = `Prezado(a) Senhor(a),

Servimo-nos da presente para informar que, até o presente momento, não identificamos em nossos registros o pagamento das cotas condominiais abaixo relacionadas, referentes à unidade de sua responsabilidade.

O atraso no pagamento compromete o fluxo de caixa do condomínio e onera os demais condôminos. Desta forma, solicitamos sua atenção para os débitos listados a seguir:`

            const splitText = doc.splitTextToSize(introText, 165)
            doc.text(splitText, 25, 90)

            // --- TABELA DE DÉBITOS (AutoTable) ---
            const tableData = defaulter.bills.map(bill => [
                formatDate(bill.due_date),
                bill.description || 'Taxa Condominial',
                formatCurrency(bill.original),
                formatCurrency(bill.fine + bill.interest),
                formatCurrency(bill.total)
            ])

            autoTable(doc, {
                startY: 125,
                head: [['Vencimento', 'Descrição', 'Valor Original', 'Multa/Juros', 'Total']],
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: PRIMARY_COLOR,
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                columnStyles: {
                    0: { halign: 'center' },
                    2: { halign: 'right' },
                    3: { halign: 'right' },
                    4: { halign: 'right', fontStyle: 'bold' }
                },
                styles: {
                    fontSize: 10,
                    cellPadding: 3,
                    textColor: TEXT_COLOR
                },
                margin: { left: 25, right: 15 }
            })

            // --- TOTALIZADOR (FINAL DA TABELA) ---
            const finalY = doc.lastAutoTable.finalY + 10

            // Box de Total
            doc.setFillColor(...BG_LIGHT)
            doc.rect(120, finalY, 70, 15, 'F')
            doc.setDrawColor(...PRIMARY_COLOR)
            doc.rect(120, finalY, 70, 15, 'S')

            doc.setFontSize(10)
            doc.text('TOTAL DEVIDO:', 125, finalY + 10)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(...SECONDARY_COLOR)
            doc.text(formatCurrency(defaulter.totalDebt), 185, finalY + 10, { align: 'right' })

            // --- CONCLUSÃO E JURÍDICO ---
            doc.setTextColor(...TEXT_COLOR)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)

            const conclusionText = `O valor acima já inclui multa de 2% e juros de mora de 1% ao mês pro rata die, conforme Art. 1336 do Código Civil e Convenção Condominial.

    Solicitamos a regularização desta pendência no prazo improrrogável de 48 horas.
    O não pagamento poderá acarretar no envio do título para Protesto em Cartório e posterior Ação Judicial de Cobrança, o que elevará os custos com honorários advocatícios e custas processuais.

    Caso o pagamento já tenha sido efetuado, por favor, desconsidere este aviso e envie o comprovante para a administração.`

            const splitConclusion = doc.splitTextToSize(conclusionText, 165)
            doc.text(splitConclusion, 25, finalY + 35)

            // --- ASSINATURA ---
            const assinaturaY = finalY + 80
            doc.setDrawColor(150)
            doc.line(70, assinaturaY, 140, assinaturaY)

            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('ADMINISTRAÇÃO', 105, assinaturaY + 5, { align: 'center' })
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.text('Departamento Financeiro & Jurídico', 105, assinaturaY + 10, { align: 'center' })

            // Salvar Arquivo
            const fileName = `Notificacao_${(defaulter.resident.name || 'condomino').replace(/\s+/g, '_')}.pdf`
            doc.save(fileName)

        } catch (error) {
            console.error('Erro ao gerar PDF:', error)
            alert('Erro ao gerar a carta PDF. Verifique o console para mais detalhes.\n\nErro: ' + error.message)
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
                    status,
                    resident_id,
                    residents (id, name, unit_number, block, phone, email)
                `)
            // REMOVIDO: .eq('status', 'pendente') -> Vamos filtrar na memória para garantir

            // 2. Filtrar: Status "pendente" (sem case sensitive) E Atrasadas
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const overdueOnly = overdueData?.filter(bill => {
                // 1. Verificar status (garantir que pega 'pendente', 'Pendente', etc)
                const status = bill.status?.toLowerCase().trim()
                if (status !== 'pendente' && status !== 'atrasado') return false

                // 2. Verificar data
                const dueDate = new Date(bill.due_date + 'T00:00:00')
                dueDate.setHours(0, 0, 0, 0)

                return today > dueDate
            }) || []

            console.log('DEBUG Collections:', {
                totalPending: overdueData?.length,
                overdueCount: overdueOnly.length,
                today: today.toISOString(),
                todayLocal: today.toLocaleDateString('pt-BR'),
                allBills: overdueData?.map(b => ({
                    desc: b.description,
                    due: b.due_date,
                    resident: b.residents?.name,
                    isOverdue: today > new Date(b.due_date + 'T00:00:00')
                })),
                sample: overdueOnly[0] ? {
                    due_date: overdueOnly[0].due_date,
                    resident: overdueOnly[0].residents?.name
                } : null
            })

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
                                        onClick={() => generateCollectionLetter(item)}
                                        title="Baixar Carta PDF"
                                    >
                                        📄 Carta
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline w-full"
                                        onClick={() => {
                                            console.log('Contact clicked:', item.resident);
                                            setSelectedContact(item.resident);
                                            setShowContactModal(true);
                                        }}
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

            {/* Modal de Checklist PREMIUM */}
            {showChecklistModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '700px', maxHeight: '90vh', borderRadius: '16px', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>

                        {/* Header com Gradiente */}
                        <div style={{
                            background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                            padding: '32px 40px',
                            color: 'white',
                            position: 'relative'
                        }}>
                            <button
                                onClick={() => setShowChecklistModal(false)}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '24px',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ×
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                                <div style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '28px'
                                }}>
                                    ⚖️
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Checklist de Protesto</h2>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>Verificação de Conformidade Legal</p>
                                </div>
                            </div>

                            {/* Barra de Progresso */}
                            <div style={{ marginTop: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', opacity: 0.9 }}>
                                    <span>Progresso do Checklist</span>
                                    <span>{Object.values(checklist).filter(Boolean).length} de 4 itens</span>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.2)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        background: 'white',
                                        height: '100%',
                                        width: `${(Object.values(checklist).filter(Boolean).length / 4) * 100}%`,
                                        transition: 'width 0.3s ease',
                                        borderRadius: '4px'
                                    }} />
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '32px 40px', overflowY: 'auto', flex: 1 }}>
                            {/* Card de Resumo do Devedor */}
                            <div style={{
                                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                border: '2px solid #fecaca',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '32px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                        Dados do Devedor
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                                        {selectedDefaulter?.resident.name}
                                    </h3>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#64748b' }}>
                                        <span>📍 Unidade {selectedDefaulter?.resident.unit_number}</span>
                                        <span>📅 {Math.max(...(selectedDefaulter?.bills.map(b => b.days) || [0]))} dias em atraso</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Valor Total Atualizado</div>
                                    <div style={{ fontSize: '28px', fontWeight: '800', color: '#dc2626' }}>
                                        {formatCurrency(selectedDefaulter?.totalDebt)}
                                    </div>
                                    <div style={{
                                        display: 'inline-block',
                                        marginTop: '8px',
                                        padding: '4px 12px',
                                        background: '#7f1d1d',
                                        color: 'white',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        borderRadius: '12px',
                                        textTransform: 'uppercase'
                                    }}>
                                        🚨 Crítico
                                    </div>
                                </div>
                            </div>

                            {/* Checklist Items Estilizados */}
                            <div style={{ marginBottom: '32px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Requisitos Legais Obrigatórios
                                </h4>

                                {/* Item 1 */}
                                <label style={{
                                    display: 'flex',
                                    gap: '16px',
                                    padding: '16px',
                                    background: checklist.carta_enviada ? '#f0fdf4' : '#f8fafc',
                                    border: `2px solid ${checklist.carta_enviada ? '#86efac' : '#e2e8f0'}`,
                                    borderRadius: '12px',
                                    marginBottom: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={checklist.carta_enviada}
                                        onChange={(e) => setChecklist({ ...checklist, carta_enviada: e.target.checked })}
                                        style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '20px' }}>📧</span>
                                            <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Carta de Cobrança com AR</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                                            Notificação extrajudicial enviada via Correios com Aviso de Recebimento (AR) comprovando a ciência do devedor.
                                        </p>
                                    </div>
                                </label>

                                {/* Item 2 */}
                                <label style={{
                                    display: 'flex',
                                    gap: '16px',
                                    padding: '16px',
                                    background: checklist.prazo_cumprido ? '#f0fdf4' : '#f8fafc',
                                    border: `2px solid ${checklist.prazo_cumprido ? '#86efac' : '#e2e8f0'}`,
                                    borderRadius: '12px',
                                    marginBottom: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={checklist.prazo_cumprido}
                                        onChange={(e) => setChecklist({ ...checklist, prazo_cumprido: e.target.checked })}
                                        style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '20px' }}>⏳</span>
                                            <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Prazo de 10 Dias Úteis</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                                            Aguardado o prazo legal de 10 dias úteis após o recebimento da notificação para pagamento voluntário.
                                        </p>
                                    </div>
                                </label>

                                {/* Item 3 */}
                                <label style={{
                                    display: 'flex',
                                    gap: '16px',
                                    padding: '16px',
                                    background: checklist.documentos_anexados ? '#f0fdf4' : '#f8fafc',
                                    border: `2px solid ${checklist.documentos_anexados ? '#86efac' : '#e2e8f0'}`,
                                    borderRadius: '12px',
                                    marginBottom: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={checklist.documentos_anexados}
                                        onChange={(e) => setChecklist({ ...checklist, documentos_anexados: e.target.checked })}
                                        style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '20px' }}>📄</span>
                                            <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Documentação Completa</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                                            Boletos originais, comprovantes de notificação (AR), convenção do condomínio e ata de assembleia anexados.
                                        </p>
                                    </div>
                                </label>

                                {/* Item 4 - Auto */}
                                <div style={{
                                    display: 'flex',
                                    gap: '16px',
                                    padding: '16px',
                                    background: '#f0fdf4',
                                    border: '2px solid #86efac',
                                    borderRadius: '12px',
                                    opacity: 0.7
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={checklist.valor_calculado}
                                        disabled
                                        style={{ width: '20px', height: '20px', marginTop: '2px' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '20px' }}>💰</span>
                                            <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Valor Atualizado</span>
                                            <span style={{
                                                fontSize: '10px',
                                                padding: '2px 8px',
                                                background: '#dcfce7',
                                                color: '#166534',
                                                borderRadius: '6px',
                                                fontWeight: 'bold'
                                            }}>
                                                AUTOMÁTICO
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                                            Cálculo automático com multa de 2% e juros de mora de 1% a.m. conforme legislação vigente.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Disclaimer Legal */}
                            <div style={{
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderLeft: '4px solid #f59e0b',
                                borderRadius: '8px',
                                padding: '16px',
                                marginBottom: '32px',
                                display: 'flex',
                                gap: '12px'
                            }}>
                                <span style={{ fontSize: '20px' }}>⚠️</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '6px' }}>
                                        Aviso Legal Importante
                                    </div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#78350f', lineHeight: '1.6' }}>
                                        O protesto em cartório é um ato formal que inscreve o devedor em cadastros de inadimplentes (Serasa/SPC).
                                        Certifique-se de que todos os requisitos legais foram cumpridos antes de prosseguir.
                                    </p>
                                </div>
                            </div>

                            {/* Botões */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowChecklistModal(false)}
                                    style={{
                                        padding: '12px 24px',
                                        border: '2px solid #e2e8f0',
                                        background: 'white',
                                        color: '#64748b',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={proceedToCreateProcess}
                                    disabled={!checklist.carta_enviada || !checklist.prazo_cumprido || !checklist.documentos_anexados}
                                    style={{
                                        padding: '12px 32px',
                                        border: 'none',
                                        background: (!checklist.carta_enviada || !checklist.prazo_cumprido || !checklist.documentos_anexados)
                                            ? '#cbd5e1'
                                            : 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: '700',
                                        cursor: (!checklist.carta_enviada || !checklist.prazo_cumprido || !checklist.documentos_anexados)
                                            ? 'not-allowed'
                                            : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <span>Prosseguir com Protesto</span>
                                    <span>→</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Create Process PREMIUM */}
            {showProcessModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '650px', maxHeight: '90vh', borderRadius: '16px', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>

                        {/* Header com Gradiente */}
                        <div style={{
                            background: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
                            padding: '32px 40px',
                            color: 'white',
                            position: 'relative'
                        }}>
                            <button
                                onClick={() => setShowProcessModal(false)}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '24px',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ×
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '28px'
                                }}>
                                    ⚖️
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Confirmar Protesto</h2>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>Abertura de Processo de Cobrança Judicial</p>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '32px 40px', overflowY: 'auto', flex: 1 }}>
                            {/* Resumo do Devedor */}
                            <div style={{
                                background: '#fef2f2',
                                border: '2px solid #fecaca',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '24px'
                            }}>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                                    Confirmar abertura de processo para:
                                </div>
                                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                                    {selectedDefaulter?.resident.name}
                                </h3>
                                <div style={{ fontSize: '14px', color: '#64748b' }}>
                                    📍 Unidade {selectedDefaulter?.resident.unit_number}
                                </div>
                            </div>

                            {/* Breakdown Financeiro */}
                            <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '24px'
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Composição do Débito
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                                    <span style={{ color: '#64748b' }}>Valor Principal:</span>
                                    <strong style={{ color: '#1e293b' }}>{formatCurrency(selectedDefaulter?.totalOriginal)}</strong>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                                    <span style={{ color: '#dc2626' }}>+ Multa (2%):</span>
                                    <strong style={{ color: '#dc2626' }}>{formatCurrency(selectedDefaulter?.totalFine)}</strong>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', paddingBottom: '16px', borderBottom: '2px dashed #e2e8f0' }}>
                                    <span style={{ color: '#dc2626' }}>+ Juros de Mora (1% a.m):</span>
                                    <strong style={{ color: '#dc2626' }}>{formatCurrency(selectedDefaulter?.totalInterest)}</strong>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#7f1d1d' }}>TOTAL A PROTESTAR:</span>
                                    <span style={{ fontSize: '24px', fontWeight: '800', color: '#dc2626' }}>{formatCurrency(selectedDefaulter?.totalDebt)}</span>
                                </div>
                            </div>

                            {/* Campo de Observações */}
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                                    Observações Iniciais do Processo
                                </label>
                                <textarea
                                    style={{
                                        width: '100%',
                                        minHeight: '100px',
                                        padding: '12px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontFamily: 'inherit',
                                        resize: 'vertical',
                                        outline: 'none'
                                    }}
                                    value={newProcessNote}
                                    onChange={e => setNewProcessNote(e.target.value)}
                                    placeholder="Ex: Carta de notificação enviada em DD/MM/AAAA via AR nº XXXXX. Prazo de 10 dias úteis cumprido. Documentação completa anexada aos autos."
                                />
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                                    💡 Dica: Documente todas as tentativas de contato e prazos cumpridos
                                </div>
                            </div>

                            {/* Aviso Legal */}
                            <div style={{
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderLeft: '4px solid #f59e0b',
                                borderRadius: '8px',
                                padding: '16px',
                                marginBottom: '24px',
                                display: 'flex',
                                gap: '12px'
                            }}>
                                <span style={{ fontSize: '20px' }}>⚠️</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '6px' }}>
                                        Atenção: Ação Irreversível
                                    </div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#78350f', lineHeight: '1.6' }}>
                                        Ao confirmar, o processo será registrado oficialmente e o devedor será notificado.
                                        O protesto em cartório resultará em restrição de crédito (Serasa/SPC).
                                    </p>
                                </div>
                            </div>

                            {/* Botões de Ação */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowProcessModal(false)}
                                    style={{
                                        padding: '12px 24px',
                                        border: '2px solid #e2e8f0',
                                        background: 'white',
                                        color: '#64748b',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmCreateProcess}
                                    style={{
                                        padding: '12px 32px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <span>⚖️</span>
                                    <span>Confirmar Abertura do Processo</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Contato Premium */}
            {showContactModal && selectedContact && (
                <div className="modal-overlay" onClick={() => console.log('Modal overlay clicked')}>
                    <div className="modal" style={{ maxWidth: '500px', borderRadius: '16px', overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>

                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                            padding: '32px 40px',
                            color: 'white',
                            position: 'relative'
                        }}>
                            <button
                                onClick={() => setShowContactModal(false)}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '24px',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ×
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '28px'
                                }}>
                                    📞
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Informações de Contato</h2>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>Canais de comunicação com o morador</p>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '32px 40px' }}>
                            {/* Card do Morador */}
                            <div style={{
                                background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
                                border: '2px solid #99f6e4',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '24px',
                                textAlign: 'center'
                            }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '36px',
                                    color: 'white',
                                    margin: '0 auto 16px',
                                    fontWeight: 'bold'
                                }}>
                                    {selectedContact.name?.charAt(0).toUpperCase()}
                                </div>
                                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                                    {selectedContact.name}
                                </h3>
                                <div style={{ fontSize: '14px', color: '#64748b' }}>
                                    📍 Unidade {selectedContact.unit_number} {selectedContact.block && `• Bloco ${selectedContact.block}`}
                                </div>
                            </div>

                            {/* Botões de Ação Rápida */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                {/* Telefone */}
                                {selectedContact.phone && (
                                    <a
                                        href={`tel:${selectedContact.phone}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            padding: '16px 20px',
                                            background: 'white',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '12px',
                                            textDecoration: 'none',
                                            transition: 'all 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = '#14b8a6'
                                            e.currentTarget.style.background = '#f0fdfa'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = '#e2e8f0'
                                            e.currentTarget.style.background = 'white'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '24px'
                                        }}>
                                            📱
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Telefone</div>
                                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>{selectedContact.phone}</div>
                                        </div>
                                        <div style={{ fontSize: '20px', color: '#94a3b8' }}>→</div>
                                    </a>
                                )}

                                {/* WhatsApp */}
                                {selectedContact.phone && (
                                    <a
                                        href={`https://wa.me/55${selectedContact.phone.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            padding: '16px 20px',
                                            background: 'white',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '12px',
                                            textDecoration: 'none',
                                            transition: 'all 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = '#25D366'
                                            e.currentTarget.style.background = '#f0fdf4'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = '#e2e8f0'
                                            e.currentTarget.style.background = 'white'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '24px'
                                        }}>
                                            💬
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>WhatsApp</div>
                                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Enviar mensagem</div>
                                        </div>
                                        <div style={{ fontSize: '20px', color: '#94a3b8' }}>→</div>
                                    </a>
                                )}

                                {/* Email */}
                                {selectedContact.email && (
                                    <a
                                        href={`mailto:${selectedContact.email}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            padding: '16px 20px',
                                            background: 'white',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '12px',
                                            textDecoration: 'none',
                                            transition: 'all 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = '#f59e0b'
                                            e.currentTarget.style.background = '#fffbeb'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = '#e2e8f0'
                                            e.currentTarget.style.background = 'white'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '24px'
                                        }}>
                                            📧
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Email</div>
                                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedContact.email}</div>
                                        </div>
                                        <div style={{ fontSize: '20px', color: '#94a3b8' }}>→</div>
                                    </a>
                                )}
                            </div>

                            {/* Dica */}
                            <div style={{
                                background: '#eff6ff',
                                border: '1px solid #dbeafe',
                                borderLeft: '4px solid #3b82f6',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'flex-start'
                            }}>
                                <span style={{ fontSize: '18px' }}>💡</span>
                                <p style={{ margin: 0, fontSize: '12px', color: '#1e40af', lineHeight: '1.5' }}>
                                    <strong>Dica:</strong> Documente todas as tentativas de contato para fortalecer o processo de cobrança.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
