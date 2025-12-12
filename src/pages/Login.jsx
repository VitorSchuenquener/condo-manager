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
                    // Se o erro for "usuário já existe", tentamos logar com a senha fornecida para recuperar a conta
                    if (error.message.includes('already registered') || error.message.includes('exists')) {
                        console.log("Usuário já existe, tentando login para auto-correção...")
                        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                            email,
                            password,
                        })

                        if (signInError) {
                            throw new Error("Este e-mail já está cadastrado, mas a senha informada não confere.")
                        }
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

            // --- LÓGICA DE RECUPERAÇÃO E PERFIL ---
            if (authUser) {
                // 1. Verificar se é uma tentativa de Master (Admin + Key)
                // Isso vale tanto para cadastro novo quanto para login (se o campo estiver visivel/preenchido)
                // Mas no login normal o campo adminCode não aparece, então assumimos isSignUp ou se quisermos permitir "Upgrade" no login, teríamos que mudar a UI.
                // Por enquanto, vamos assumir que o usuário usa a aba "Criar Conta" para forçar o upgrade se preciso.
                const isMasterAttempt = (role === 'admin' && adminCode === MASTER_KEY && isSignUp);

                // Se tentou ser admin na criação e errou a senha
                if (role === 'admin' && adminCode !== MASTER_KEY && isSignUp) {
                    throw new Error("Código Master incorreto!")
                }

                // 2. Buscar perfil existente para saber o status atual
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .single()

                // 3. Determinar Novos Valores
                // Se for Master Attempt -> Vira Admin e Aprovado
                // Se não existe perfil -> Usa o role selecionado e Pending
                // Se já existe -> Mantém o que tem (a menos que seja Master Attempt de upgrade)

                let newRole = existingProfile?.role || role
                let newApproval = existingProfile?.is_approved || false
                let newName = hasChangedName(fullName, existingProfile?.full_name) ? fullName : (existingProfile?.full_name || 'Usuário')

                if (isMasterAttempt) {
                    newRole = 'admin'
                    newApproval = true
                } else if (!existingProfile) {
                    // Se resetou o banco, quem logar vira "Pendente" com o cargo que tentou.
                    // Se for admin sem chave (não deveria acontecer pelo if acima), vira sindico
                    if (role === 'admin') newRole = 'sindico';
                    newApproval = false;
                }

                // 4. Salvar (Upsert)
                const { error: upsertError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: authUser.id,
                        full_name: newName,
                        role: newRole,
                        is_approved: newApproval
                    })

                if (upsertError) console.error('Erro ao atualizar perfil:', upsertError)

                // 5. Bloqueio Final
                if (!newApproval) {
                    await supabase.auth.signOut()
                    throw new Error(`⛔ ACESSO BLOQUEADO\nSua conta (${newRole.toUpperCase()}) aguarda aprovação do Admin.`)
                }

                if (isMasterAttempt) {
                    alert('👑 Acesso Master Confirmado/Restaurado!')
                } else if (!existingProfile) {
                    alert('✅ Cadastro Enviado! Aguarde aprovação.')
                }
            }

        } catch (error) {
            console.error(error)
            setError(error.message || 'Ocorreu um erro.')
        } finally {
            setLoading(false)
        }
    }

    const hasChangedName = (newN, oldN) => {
        return newN && newN.length > 0 && newN !== oldN
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1 className="login-title">🏢 CondoManager</h1>
                    <p className="login-subtitle">Sistema Profissional de Gestão</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    {error && (
                        <div className="alert alert-error">
                            {error}
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <input
                            type="email"
                            className="input"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Senha</label>
                        <input
                            type="password"
                            className="input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {isSignUp && (
                        <>
                            <div className="input-group">
                                <label className="input-label">Nome Completo</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Ex: Vitor Silva"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required={isSignUp}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Cargo / Função</label>
                                <select
                                    className="select"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                >
                                    <option value="sindico">Síndico</option>
                                    <option value="contador">Contador</option>
                                    <option value="admin">Administrador (Master)</option>
                                </select>
                            </div>

                            {role === 'admin' && (
                                <div className="input-group">
                                    <label className="input-label" style={{ color: 'red' }}>Código de Segurança (Master)</label>
                                    <input
                                        type="password"
                                        className="input"
                                        placeholder="Digite a chave mestra..."
                                        value={adminCode}
                                        onChange={(e) => setAdminCode(e.target.value)}
                                        style={{ borderColor: 'red' }}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="loading"></span>
                                {isSignUp ? 'Processando...' : 'Entrar'}
                            </>
                        ) : (
                            isSignUp ? 'Criar / Recuperar Conta' : 'Entrar'
                        )}
                    </button>

                    <div className="text-center mt-md">
                        <button
                            type="button"
                            className="bg-transparent border-none text-primary cursor-pointer text-sm hover:underline"
                            onClick={() => {
                                setIsSignUp(!isSignUp)
                                setError('')
                            }}
                        >
                            {isSignUp
                                ? 'Já tem conta? Fazer Login'
                                : 'Primeiro acesso? Crie sua conta aqui'}
                        </button>
                    </div>
                </form>

                <div className="login-footer">
                    <p className="text-sm text-gray">
                        Sistema exclusivo para Síndicos e Contadores
                    </p>
                </div>
            </div>
        </div>
    )
}
