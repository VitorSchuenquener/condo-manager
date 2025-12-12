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

    const MASTER_KEY = "MASTER123"

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            let authUser = null;

            if (isSignUp) {
                // Tenta CRIAR usuário
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                })

                if (error) {
                    if (error.message.includes('already registered') || error.message.includes('exists')) {
                        console.log("Tentando login de recuperação...")
                        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                            email,
                            password,
                        })

                        if (signInError) throw new Error("Email já existe, senha incorreta.")
                        authUser = signInData.user
                    } else {
                        throw error
                    }
                } else {
                    authUser = data.user
                }
            } else {
                // LOGIN NORMAL
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
                authUser = data.user
            }

            // --- PERFIL E APROVAÇÃO ---
            if (authUser) {
                const isMasterAttempt = (role === 'admin' && adminCode === MASTER_KEY && isSignUp);

                if (role === 'admin' && adminCode !== MASTER_KEY && isSignUp) {
                    throw new Error("Código Master incorreto!")
                }

                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .single()

                let newRole = existingProfile?.role || role
                let newApproval = existingProfile?.is_approved || false
                let newName = (fullName && fullName.length > 0) ? fullName : (existingProfile?.full_name || 'Usuário')

                if (isMasterAttempt) {
                    newRole = 'admin'
                    newApproval = true
                } else if (!existingProfile) {
                    // Reset Profile Logic
                    if (role === 'admin') newRole = 'sindico';
                    newApproval = false;
                }

                // Salvar
                const { error: upsertError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: authUser.id,
                        full_name: newName,
                        role: newRole,
                        is_approved: newApproval
                    })

                if (upsertError) console.error('Upsert warn:', upsertError)

                // --- ZONA DE BLOQUEIO DESATIVADA ---
                if (!newApproval) {
                    console.warn("Usuário não aprovado acessando sistema (recuperação)")
                    // await supabase.auth.signOut() 
                    // throw new Error(...)
                }

                if (isMasterAttempt) {
                    alert('👑 Admin Master Confirmado!')
                } else if (!existingProfile && isSignUp) {
                    alert('✅ Cadastro realizado!')
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

                <form onSubmit={handleLogin} className="login-form">
                    {error && <div className="alert alert-error">{error}</div>}

                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <input type="email" className="input" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Senha</label>
                        <input type="password" className="input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>

                    {isSignUp && (
                        <>
                            <div className="input-group">
                                <label className="input-label">Nome Completo</label>
                                <input type="text" className="input" placeholder="Ex: Vitor Silva" value={fullName} onChange={(e) => setFullName(e.target.value)} required={isSignUp} />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Cargo / Função</label>
                                <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                                    <option value="sindico">Síndico</option>
                                    <option value="contador">Contador</option>
                                    <option value="admin">Administrador (Master)</option>
                                </select>
                            </div>

                            {role === 'admin' && (
                                <div className="input-group">
                                    <label className="input-label" style={{ color: 'red' }}>Código de Segurança (Master)</label>
                                    <input type="password" className="input" placeholder="Digite a chave mestra..." value={adminCode} onChange={(e) => setAdminCode(e.target.value)} style={{ borderColor: 'red' }} />
                                </div>
                            )}
                        </>
                    )}

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? (isSignUp ? 'Processando...' : 'Entrando...') : (isSignUp ? 'Criar / Recuperar Conta' : 'Entrar')}
                    </button>

                    <div className="text-center mt-md">
                        <button type="button" className="bg-transparent border-none text-primary cursor-pointer text-sm hover:underline" onClick={() => { setIsSignUp(!isSignUp); setError('') }}>
                            {isSignUp ? 'Já tem conta? Fazer Login' : 'Primeiro acesso? Crie sua conta aqui'}
                        </button>
                    </div>
                </form>

                <div className="login-footer">
                    <p className="text-sm text-gray">Sistema exclusivo para Síndicos e Contadores</p>
                </div>
            </div>
        </div>
    )
}
