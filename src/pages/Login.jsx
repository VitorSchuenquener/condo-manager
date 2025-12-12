import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './Login.css'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState('sindico')

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [adminCode, setAdminCode] = useState('')
    const MASTER_KEY = "MASTER123"

    const [isSignUp, setIsSignUp] = useState(false)

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            if (isSignUp) {
                if (role === 'admin' && adminCode !== MASTER_KEY) throw new Error("Código Master inválido!")

                // 1. Criar Usuário na Auth
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (authError) throw authError

                // 2. Criar Perfil Público (Audit Trail)
                if (authData.user) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert([{
                            id: authData.user.id,
                            full_name: fullName,
                            role: role
                        }])

                    if (profileError) {
                        console.error('Erro ao criar perfil:', profileError)
                        // Não bloqueamos o fluxo, mas logamos o erro
                    }
                }

                alert(`Conta de ${role === 'sindico' ? 'Síndico' : 'Contador'} criada com sucesso!`)
                setIsSignUp(false)
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
            }
        } catch (error) {
            console.error(error)
            setError(error.message || 'Ocorreu um erro. Verifique seus dados.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1 className="login-title">🏢 CondoManager</h1>
                    <p className="login-subtitle">Sistema Profissional de Gestão de Condomínios</p>
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
                                {isSignUp ? 'Criando conta...' : 'Entrando...'}
                            </>
                        ) : (
                            isSignUp ? 'Criar Conta' : 'Entrar'
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
