import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './Login.css'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [isSignUp, setIsSignUp] = useState(false)

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (error) throw error
                alert('Conta criada com sucesso! Você já pode entrar.')
                setIsSignUp(false) // Volta para login para forçar o usuário a entrar com a senha nova
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
