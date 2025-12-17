import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

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

    // Função para Gerar Carta de Cobrança PDF (VERSÃO PROFISSIONAL)
    const generateCollectionLetter = (defaulter) => {
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
        doc.setFontSize(22)
        doc.text('NOTIFICAÇÃO EXTRAJUDICIAL', 25, 25)

        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100)
        doc.text('DE COBRANÇA E CONSTITUIÇÃO EM MORA', 25, 30)

        // Logo / Nome do Condomínio (Simulado)
        doc.setFontSize(14)
        doc.setTextColor(0)
        doc.setFont('helvetica', 'bold')
        doc.text('CondoManager System', 190, 25, { align: 'right' })
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text('Administração Financeira e Jurídica', 190, 30, { align: 'right' })

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
        doc.text(defaulter.resident.name, 30, 60)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.text(`Unidade: ${defaulter.resident.unit_number} ${defaulter.resident.block ? '| Bloco ' + defaulter.resident.block : ''}`, 30, 67)

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
            bill.description,
            formatCurrency(bill.original),
            formatCurrency(bill.fine + bill.interest),
            formatCurrency(bill.total)
        ])

        doc.autoTable({
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
        doc.save(`Notificacao_${defaulter.resident.name.replace(/\s+/g, '_')}.pdf`)
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
