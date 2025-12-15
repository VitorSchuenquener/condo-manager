import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './Login.css'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState('sindico')
    const [adminCode, setAdminCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)
    const [successMsg, setSuccessMsg] = useState('')

    const MASTER_KEY = "MASTER123"

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        setSuccessMsg('')

        try {
            if (isSignUp) {
                // --- CADASTRO NOVO (Via Trigger) ---

                // 1. Validação do Código Mestre (apenas frontend, segurança real no backend é ideal, mas serve para UX)
                const isAdminRequest = role === 'admin'
                if (isAdminRequest && adminCode !== MASTER_KEY) {
                    throw new Error("Código Master incorreto!")
                }

                // 2. Criar Usuário enviando Metadados (O Trigger do banco vai criar o Perfil)
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            role: role,
                            // Se acertou o código mestre, enviamos um sinal para o banco aprovar direto
                            is_admin_approved: isAdminRequest
                        }
                    }
                })

                if (authError) throw authError

                // 3. Sucesso - Verifica se logou direto ou precisa confirmar email
                if (authData.user) {
                    if (isAdminRequest) {
                        alert("👑 Conta Admin criada com sucesso!")
                    } else {
                        // Força logout para garantir que não entre como pendente
                        await supabase.auth.signOut()
                        setSuccessMsg("✅ Cadastro realizado! Sua conta está em análise. Aguarde a aprovação do Administrador.")
                        setIsSignUp(false)
                        setLoading(false)
                        return
                    }
                }
            } else {
                // --- LOGIN ---
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error

                if (data.user) {
                    // Verifica status no perfil recém criado/existente
                    const { data: profile, error: profileError } = await supabase
                        .from('profiles')
                        .select('is_approved, role')
                        .eq('id', data.user.id)
                        .single()

                    if (profileError || !profile) {
                        console.error(profileError)
                        throw new Error("Erro ao verificar perfil. Tente novamente em instantes.")
                    }

                    if (!profile.is_approved) {
                        await supabase.auth.signOut()
                        throw new Error("⛔ Sua conta ainda não foi aprovada pelo Administrador.")
                    }
                }
            }
        } catch (error) {
            console.error(error)
            setError(error.message || 'Ocorreu um erro.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1 className="login-title">🏢 CondoManager</h1>
                    <p className="login-subtitle">Sistema Profissional de Gestão</p>
                </div>

                <form onSubmit={handleAuth} className="login-form">
                    {error && <div className="alert alert-error">{error}</div>}
                    {successMsg && <div className="alert alert-success">{successMsg}</div>}

                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Senha</label>
                        <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>

                    {isSignUp && (
                        <>
                            <div className="input-group">
                                <label className="input-label">Nome Completo</label>
                                <input type="text" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required={isSignUp} />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Cargo</label>
                                <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                                    <option value="sindico">Síndico</option>
                                    <option value="contador">Contador</option>
                                    <option value="admin">Administrador (Master)</option>
                                </select>
                            </div>

                            {role === 'admin' && (
                                <div className="input-group">
                                    <label className="input-label text-danger">Chave Mestra</label>
                                    <input type="password" className="input border-danger" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />
                                </div>
                            )}
                        </>
                    )}

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? 'Processando...' : (isSignUp ? 'Cadastrar' : 'Entrar')}
                    </button>

                    <div className="text-center mt-md">
                        <button type="button" className="text-primary hover:underline text-sm border-none bg-transparent cursor-pointer"
                            onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccessMsg(''); }}>
                            {isSignUp ? 'Já tem conta? Fazer Login' : 'Criar Conta'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
