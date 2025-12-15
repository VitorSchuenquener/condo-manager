import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useDropzone } from 'react-dropzone'

export default function Residents() {
    const [residents, setResidents] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Estados do Modal / Formulário
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        cpf: '',
        unit_number: '',
        block: '', // Mantendo compatibilidade com banco, mesmo que vazio
        phone: '',
        email: '',
        is_owner: true,
        documents: []
    })

    // --- ESTADOS PARA DOCUMENTOS ---
    const [uploadedFile, setUploadedFile] = useState(null)
    const [uploading, setUploading] = useState(false)

    useEffect(() => {
        fetchResidents()
    }, [])

    const fetchResidents = async () => {
        try {
            const { data, error } = await supabase
                .from('residents')
                .select('*')
                .order('name')

            if (error) throw error
            setResidents(data || [])
        } catch (error) {
            console.error('Erro ao buscar moradores:', error)
        } finally {
            setLoading(false)
        }
    }

    // --- KPIs ---
    const totalResidents = residents.length
    const ownersCount = residents.filter(r => r.is_owner).length
    const tenantsCount = residents.filter(r => !r.is_owner).length

    // --- FILTRO DE BUSCA ---
    const filteredResidents = residents.filter(resident =>
        resident.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resident.unit_number?.toString().includes(searchTerm) ||
        resident.cpf?.includes(searchTerm)
    )

    // --- AÇÕES ---
    const handleDelete = async (id) => {
        if (!confirm('Tem certeza que deseja excluir este morador?')) return

        try {
            const { error } = await supabase.from('residents').delete().eq('id', id)
            if (error) throw error
            fetchResidents()
        } catch (error) {
            alert('Erro ao excluir: ' + error.message)
        }
    }

    const handleEdit = (resident) => {
        setEditingId(resident.id)
        setFormData({
            name: resident.name,
            cpf: resident.cpf,
            unit_number: resident.unit_number,
            block: resident.block,
            phone: resident.phone,
            email: resident.email,
            is_owner: resident.is_owner,
            documents: resident.documents || []
        })
        setShowModal(true)
    }

    const openNewModal = () => {
        setEditingId(null)
        setFormData({
            name: '',
            cpf: '',
            unit_number: '',
            block: '',
            phone: '',
            email: '',
            is_owner: true,
            documents: []
        })
        setUploadedFile(null)
        setShowModal(true)
    }

    // --- CONFIGURAÇÃO DO DROPZONE ---
    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles?.length > 0) {
            setUploadedFile(acceptedFiles[0])
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        accept: { 'image/*': [], 'application/pdf': [] }
    })

    const uploadDocument = async (file) => {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `residents_docs/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file)

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('documents').getPublicUrl(filePath)
        return data.publicUrl
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setUploading(true)

        try {
            let currentDocs = formData.documents || []

            // Se fez upload de novo arquivo, adiciona à lista
            if (uploadedFile) {
                const newDocUrl = await uploadDocument(uploadedFile)
                currentDocs = [{ name: uploadedFile.name, url: newDocUrl, type: 'doc' }] // Substituindo para simplificar (1 doc por vez)
            }

            const payload = {
                name: formData.name,
                cpf: formData.cpf,
                unit_number: formData.unit_number,
                block: formData.block,
                phone: formData.phone,
                email: formData.email,
                is_owner: formData.is_owner,
                documents: currentDocs
            }

            let error = null

            if (editingId) {
                // UPDATE
                const { error: updateError } = await supabase
                    .from('residents')
                    .update(payload)
                    .eq('id', editingId)
                error = updateError
            } else {
                // INSERT
                const { error: insertError } = await supabase
                    .from('residents')
                    .insert([payload])
                error = insertError
            }

            if (error) throw error

            setShowModal(false)
            setUploadedFile(null)
            fetchResidents()
            alert(editingId ? 'Morador atualizado!' : 'Morador cadastrado com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro ao salvar: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
        setFormData({ ...formData, [e.target.name]: value })
    }

    if (loading) return <div className="loading-screen">Carregando...</div>

    return (
        <div>
            {/* Header e KPIs */}
            <div className="mb-lg">
                <h1 className="page-title">Moradores</h1>
                <p className="page-subtitle">Gestão completa e documentos</p>

                <div className="grid grid-cols-3 gap-md mt-md">
                    <div className="card p-md flex items-center justify-between border-l-4 border-primary">
                        <div>
                            <p className="text-gray text-sm font-medium">Total de Moradores</p>
                            <p className="text-2xl font-bold text-dark">{totalResidents}</p>
                        </div>
                        <div className="text-3xl">👥</div>
                    </div>
                    <div className="card p-md flex items-center justify-between border-l-4 border-success">
                        <div>
                            <p className="text-gray text-sm font-medium">Proprietários (Donos)</p>
                            <p className="text-2xl font-bold text-dark">{ownersCount}</p>
                        </div>
                        <div className="text-3xl">🏠</div>
                    </div>
                    <div className="card p-md flex items-center justify-between border-l-4 border-warning">
                        <div>
                            <p className="text-gray text-sm font-medium">Inquilinos (Aluguel)</p>
                            <p className="text-2xl font-bold text-dark">{tenantsCount}</p>
                        </div>
                        <div className="text-3xl">👤</div>
                    </div>
                </div>
            </div>

            {/* Barra de Ações e Search */}
            <div className="flex justify-between items-center mb-md gap-md">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        placeholder="🔍 Buscar por nome, casa ou CPF..."
                        className="input w-full pl-lg"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="btn btn-primary whitespace-nowrap" onClick={openNewModal}>
                    + Novo Morador
                </button>
            </div>

            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Casa</th>
                                <th>Contato</th>
                                <th>Status</th>
                                <th>Doc</th>
                                <th className="text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredResidents.map((resident) => (
                                <tr key={resident.id} className="hover:bg-gray-50">
                                    <td>
                                        <div className="font-medium text-dark">{resident.name}</div>
                                        <div className="text-xs text-gray">{resident.cpf}</div>
                                    </td>
                                    <td>
                                        <span className="font-bold text-lg text-primary">{resident.unit_number}</span>
                                    </td>
                                    <td className="text-sm">
                                        <div>📧 {resident.email}</div>
                                        <div>📱 {resident.phone}</div>
                                    </td>
                                    <td>
                                        <span className={`badge ${resident.is_owner ? 'badge-primary' : 'badge-warning'}`}>
                                            {resident.is_owner ? 'Proprietário' : 'Inquilino'}
                                        </span>
                                    </td>
                                    <td>
                                        {resident.documents && resident.documents.length > 0 ? (
                                            <a
                                                href={resident.documents[0].url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn btn-sm btn-outline"
                                                title={resident.documents[0].name}
                                            >
                                                📄 Ver
                                            </a>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="text-right">
                                        <button
                                            className="btn btn-sm text-gray hover:text-primary mr-sm"
                                            onClick={() => handleEdit(resident)}
                                            title="Editar"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="btn btn-sm text-gray hover:text-danger"
                                            onClick={() => handleDelete(resident.id)}
                                            title="Excluir"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredResidents.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="text-center py-lg text-gray">
                                        Nenhum morador encontrado com "{searchTerm}"
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Cadastro/Edição */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingId ? 'Editar Morador' : 'Novo Morador'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-2 gap-md">
                                <div className="input-group">
                                    <label className="input-label">Nome Completo</label>
                                    <input type="text" name="name" required className="input" value={formData.name} onChange={handleChange} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">CPF</label>
                                    <input type="text" name="cpf" required className="input" value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Número da Casa</label>
                                    <input type="text" name="unit_number" required className="input" value={formData.unit_number} onChange={handleChange} placeholder="Ex: 105" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Tipo de Ocupação</label>
                                    <select name="is_owner" className="input" value={formData.is_owner} onChange={(e) => setFormData({ ...formData, is_owner: e.target.value === 'true' })}>
                                        <option value="true">🏠 Proprietário (Dono)</option>
                                        <option value="false">👤 Inquilino (Aluguel)</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Email</label>
                                    <input type="email" name="email" className="input" value={formData.email} onChange={handleChange} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Telefone</label>
                                    <input type="tel" name="phone" className="input" value={formData.phone} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Dropzone */}
                            <div className="input-group mt-md">
                                <label className="input-label">Documento do Morador</label>
                                <div {...getRootProps()} className={`border-2 border-dashed rounded p-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary-light' : 'border-gray-300 hover:border-primary'}`} style={{ background: isDragActive ? '#f0f9ff' : '#fafafa' }}>
                                    <input {...getInputProps()} />
                                    {uploadedFile ? (
                                        <div className="text-success font-medium">📄 {uploadedFile.name} (Pronto para enviar)</div>
                                    ) : (
                                        <div className="text-gray">
                                            {formData.documents?.length > 0 && !uploadedFile ? (
                                                <p className="text-primary mb-xs">📄 Documento já anexado (Arraste outro para substituir)</p>
                                            ) : (
                                                <p>📂 Arraste um arquivo ou clique aqui</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-center gap-md mt-lg">
                                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={uploading}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={uploading}>
                                    {uploading ? 'Salvando...' : (editingId ? 'Atualizar Morador' : 'Salvar Morador')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
