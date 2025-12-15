import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useDropzone } from 'react-dropzone'

export default function Residents() {
    const [residents, setResidents] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        cpf: '',
        unit_number: '',
        block: '',
        phone: '',
        email: '',
        is_owner: true
    })

    // --- ESTADOS PARA DOCUMENTOS ---
    const [uploadedFile, setUploadedFile] = useState(null)
    const [uploading, setUploading] = useState(false)

    useEffect(() => {
        fetchResidents()
    }, [])

    const fetchResidents = async () => {
        try {
            // Tenta buscar, mas se a coluna documents ainda não existir, pega sem ela
            // O ideal seria usar '*' direto
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

    // --- CONFIGURAÇÃO DO DROPZONE ---
    const onDrop = useCallback(acceptedFiles => {
        // Pega apenas o primeiro arquivo
        if (acceptedFiles?.length > 0) {
            setUploadedFile(acceptedFiles[0])
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false, // Por enquanto, 1 documento principal (ex: Contrato ou Doc Pessoal)
        accept: {
            'image/*': [],
            'application/pdf': []
        }
    })

    const uploadDocument = async (file) => {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}` // Nome aleatório para evitar colisão
        const filePath = `residents_docs/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file)

        if (uploadError) throw uploadError

        // Retorna a URL pública
        const { data } = supabase.storage.from('documents').getPublicUrl(filePath)
        return data.publicUrl
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setUploading(true)

        try {
            let documentUrl = null

            // 1. Se tem arquivo, faz upload pro Supabase Storage
            if (uploadedFile) {
                documentUrl = await uploadDocument(uploadedFile)
            }

            // 2. Salva no Banco de Dados
            // Importante: No banco, vamos salvar esse link numa coluna 'notes' ou criar uma coluna nova 'document_url'
            // Vou usar 'notes' temporariamente para salvar o link, ou podemos criar a coluna certa via SQL depois.
            // Para não quebrar, vou salvar no campo 'documents' (jsonb) que já existe no schema padrão ou 'notes'.

            const payload = {
                ...formData,
                // Salvando como um array de objetos na coluna documents (JSONB)
                // Se a coluna documents não existir, o insert vai ignorar ou dar erro, então vamos garantir via SQL depois
                documents: documentUrl ? [{ name: uploadedFile.name, url: documentUrl, type: 'cadastro' }] : []
            }

            const { error } = await supabase
                .from('residents')
                .insert([payload])

            if (error) throw error

            setShowModal(false)
            setFormData({
                name: '',
                cpf: '',
                unit_number: '',
                block: '',
                phone: '',
                email: '',
                is_owner: true
            })
            setUploadedFile(null) // Limpa arquivo
            fetchResidents()
            alert('Morador cadastrado com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro ao salvar morador: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
        setFormData({ ...formData, [e.target.name]: value })
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
                    <h1 className="page-title">Moradores</h1>
                    <p className="page-subtitle">Gestão completa de moradores</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowModal(true)}
                >
                    + Novo Morador
                </button>
            </div>

            <div className="card">
                {residents.length === 0 ? (
                    <div className="text-center p-xl text-gray">
                        Nenhum morador cadastrado. Clique em "Novo Morador" para começar.
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Número da Casa</th>
                                    <th>Documentos</th>
                                    <th>Tipo</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {residents.map((resident) => (
                                    <tr key={resident.id}>
                                        <td className="font-medium">{resident.name}</td>
                                        <td>{resident.unit_number}</td>
                                        <td>
                                            {/* Exibição simples dos documentos */}
                                            {resident.documents && resident.documents.length > 0 ? (
                                                <a
                                                    href={resident.documents[0].url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-primary hover:underline text-sm"
                                                >
                                                    📄 Ver Doc
                                                </a>
                                            ) : (
                                                <span className="text-gray text-sm">-</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge ${resident.is_owner ? 'badge-primary' : 'badge-warning'}`}>
                                                {resident.is_owner ? 'Proprietário' : 'Inquilino'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="badge badge-success">Ativo</span>
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
                            <h2 className="modal-title">Novo Morador</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowModal(false)}
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-2 gap-md">
                                <div className="input-group">
                                    <label className="input-label">Nome Completo</label>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        className="input"
                                        value={formData.name}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">CPF</label>
                                    <input
                                        type="text"
                                        name="cpf"
                                        required
                                        className="input"
                                        value={formData.cpf}
                                        onChange={handleChange}
                                        placeholder="000.000.000-00"
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Número da Casa</label>
                                    <input
                                        type="text"
                                        name="unit_number"
                                        required
                                        className="input"
                                        value={formData.unit_number}
                                        onChange={handleChange}
                                        placeholder="Ex: 105"
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        className="input"
                                        value={formData.email}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Telefone</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        className="input"
                                        value={formData.phone}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* ÁREA DE DRAG DROP */}
                            <div className="input-group mt-md">
                                <label className="input-label">Documento (Contrato ou RG)</label>
                                <div
                                    {...getRootProps()}
                                    className={`
                                        border-2 border-dashed rounded p-lg text-center cursor-pointer transition-colors
                                        ${isDragActive ? 'border-primary bg-primary-light' : 'border-gray-300 hover:border-primary'}
                                    `}
                                    style={{ background: isDragActive ? '#f0f9ff' : '#fafafa' }}
                                >
                                    <input {...getInputProps()} />
                                    {uploadedFile ? (
                                        <div className="flex items-center justify-center gap-sm text-success font-medium">
                                            📄 {uploadedFile.name} (Pronto para enviar)
                                        </div>
                                    ) : (
                                        <div className="text-gray">
                                            <p className="mb-xs text-lg">📂</p>
                                            {isDragActive ? (
                                                <p>Solte o arquivo aqui...</p>
                                            ) : (
                                                <p>Arraste um documento ou clique aqui</p>
                                            )}
                                            <p className="text-xs text-gray-400 mt-xs">PDF ou Imagem (Máx 5MB)</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="input-group mt-md">
                                <label className="flex items-center gap-sm">
                                    <input
                                        type="checkbox"
                                        name="is_owner"
                                        checked={formData.is_owner}
                                        onChange={handleChange}
                                    />
                                    <span>É proprietário?</span>
                                </label>
                            </div>

                            <div className="flex justify-center gap-md mt-lg">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setShowModal(false)}
                                    disabled={uploading}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={uploading}>
                                    {uploading ? 'Enviando e Salvando...' : 'Salvar Morador'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
