import { supabase } from '../lib/supabase'

export default function PendingApproval() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            textAlign: 'center',
            padding: '20px'
        }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳ Conta em Análise</h1>
            <p style={{ maxWidth: '400px', color: '#666', marginBottom: '2rem' }}>
                Seu cadastro foi realizado com sucesso, mas o acesso ainda não foi liberado pelo Administrador.
            </p>
            <p style={{ fontSize: '0.9rem', color: '#888' }}>
                Entre em contato com a administração do condomínio.
            </p>

            <button
                onClick={() => window.location.reload()} // Tenta recarregar pra ver se aprovou
                style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
            >
                Verificar novamente
            </button>

            <br />

            <button
                onClick={() => supabase.auth.signOut()}
                style={{ marginTop: '10px', background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}
            >
                Sair / Voltar ao Login
            </button>
        </div>
    )
}
