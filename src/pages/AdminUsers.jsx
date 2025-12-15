import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminUsers() {
    const [profiles, setProfiles] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchProfiles()
    }, [])

    const fetchProfiles = async () => {
        try {
            // Busca todos os perfis. A ordenação é feita pelo banco.
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setProfiles(data || [])
        } catch (error) {
            console.error('Erro ao buscar perfis:', error)
            // Não falha a tela inteira, apenas mostra lista vazia se der erro grave
        } finally {
            setLoading(false)
        }
    }

    const toggleApproval = async (id, currentStatus) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_approved: !currentStatus })
                .eq('id', id)

            if (error) throw error
            fetchProfiles() // Recarrega lista
        } catch (error) {
            alert('Erro ao atualizar status: ' + error.message)
        }
    }

    if (loading) return <div className="p-xl">Carregando usuários...</div>

    return (
        <div>
            <h1 className="page-title">Gestão de Usuários (Admin)</h1>
            <p className="page-subtitle text-gray mb-lg">Aprove ou bloqueie o acesso de usuários ao sistema.</p>

            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Cargo</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {profiles.map(p => (
                            <tr key={p.id}>
                                <td className="font-medium">{p.full_name || 'Sem nome'}</td>
                                <td>
                                    <span className={`badge ${p.role === 'admin' ? 'badge-primary' : 'badge-info'}`}>
                                        {p.role ? p.role.toUpperCase() : '-'}
                                    </span>
                                </td>
                                <td>
                                    {p.is_approved ? (
                                        <span className="badge badge-success">APROVADO</span>
                                    ) : (
                                        <span className="badge badge-warning">PENDENTE</span>
                                    )}
                                </td>
                                <td>
                                    {p.role !== 'admin' && (
                                        <button
                                            className={`btn btn-sm ${p.is_approved ? 'btn-outline text-danger' : 'btn-success'}`}
                                            onClick={() => toggleApproval(p.id, p.is_approved)}
                                        >
                                            {p.is_approved ? 'Bloquear' : 'Aprovar Acesso'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
