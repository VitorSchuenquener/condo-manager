import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
            // Não mostrar alert no load inicial para não travar se a tabela não existir
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            const { error } = await supabase
                .from('residents')
                .insert([formData])

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
            fetchResidents()
            alert('Morador cadastrado com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro ao salvar morador: ' + error.message)
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
                                    <th>Unidade</th>
                                    <th>Bloco</th>
                                    <th>Contato</th>
                                    <th>Tipo</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {residents.map((resident) => (
                                    <tr key={resident.id}>
                                        <td className="font-medium">{resident.name}</td>
                                        <td>{resident.unit_number}</td>
                                        <td>{resident.block || '-'}</td>
                                        <td>
                                            <div className="text-sm">
                                                <div>{resident.email}</div>
                                                <div className="text-gray">{resident.phone}</div>
                                            </div>
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
                                    <label className="input-label">Unidade (Apto)</label>
                                    <input
                                        type="text"
                                        name="unit_number"
                                        required
                                        className="input"
                                        value={formData.unit_number}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Bloco</label>
                                    <input
                                        type="text"
                                        name="block"
                                        className="input"
                                        value={formData.block}
                                        onChange={handleChange}
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

                            <div className="input-group">
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
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Salvar Morador
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
