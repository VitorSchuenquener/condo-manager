const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tdmuemuofczpulphfhpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbXVlbXVvZmN6cHVscGhmaHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzODA3MzksImV4cCI6MjA4MDk1NjczOX0.w2lFWR_UIiQzO7t2cSOv2yA9Ow7gOR3fLjFRobLQ-wQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedData() {
    console.log('🌱 Iniciando Seed de Dados (com Autenticação)...\n');

    try {
        // 1. Autenticar (Login ou Cadastro)
        const email = 'admin_seed@teste.com';
        const password = 'password123';

        console.log(`1️⃣  Autenticando como ${email}...`);

        let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            console.log('   Usuário não existe ou erro de login. Tentando criar...');
            const signUpResult = await supabase.auth.signUp({
                email,
                password
            });

            if (signUpResult.error) throw signUpResult.error;
            authData = signUpResult.data;

            if (!authData.session) {
                console.log('⚠️  Usuário criado, mas sem sessão ativa (pode requerer confirmação de email).');
                console.log('    Tente confirmar o email ou desabilitar confirmação no Supabase.');
                // Tenta logar de novo só pra garantir
                const retryLogin = await supabase.auth.signInWithPassword({ email, password });
                if (retryLogin.data.session) authData = retryLogin.data;
                else throw new Error('Falha ao obter sessão após cadastro.');
            }
        }

        console.log('   ✅ Autenticado com sucesso!');

        // 2. Criar Morador
        console.log('\n2️⃣  Criando Morador de Teste...');
        const { data: newResident, error: residentError } = await supabase
            .from('residents')
            .insert([{
                name: 'João Inadimplente',
                cpf: '123.456.789-00',
                unit_number: '101',
                block: 'A',
                email: 'joao@teste.com',
                phone: '(11) 99999-9999',
                is_owner: true
            }])
            .select()
            .single();

        let residentId;

        if (residentError) {
            if (residentError.code === '23505') {
                console.log('   Morador já existe, buscando ID...');
                const { data: existing } = await supabase.from('residents').select().eq('cpf', '123.456.789-00').single();
                if (existing) {
                    residentId = existing.id;
                } else {
                    throw residentError;
                }
            } else {
                throw residentError;
            }
        } else {
            residentId = newResident.id;
            console.log(`   Morador criado: ${newResident.name}`);
        }

        if (residentId) await processBills(residentId);

    } catch (err) {
        console.error('❌ ERRO:', err.message);
    }
}

async function processBills(residentId) {
    console.log(`\n3️⃣  Gerando Contas para ID: ${residentId}...`);

    const bills = [
        {
            resident_id: residentId,
            description: 'Condomínio Out/2025',
            amount: 500.00,
            due_date: '2025-10-10',
            status: 'pendente',
            total_amount: 500.00,
            reference_month: '10/2025'
        },
        {
            resident_id: residentId,
            description: 'Condomínio Nov/2025',
            amount: 500.00,
            due_date: '2025-11-10',
            status: 'pendente',
            total_amount: 500.00,
            reference_month: '11/2025'
        },
        {
            resident_id: residentId,
            description: 'Condomínio Dez/2025',
            amount: 550.00,
            due_date: '2025-12-10',
            status: 'pendente',
            total_amount: 550.00,
            reference_month: '12/2025'
        },
        {
            resident_id: residentId,
            description: 'Condomínio Jan/2026',
            amount: 550.00,
            due_date: '2026-01-10',
            status: 'pendente',
            total_amount: 550.00,
            reference_month: '01/2026'
        }
    ];

    // Verifica se já existem para não duplicar infinitamente
    for (const bill of bills) {
        const { data: existing } = await supabase
            .from('accounts_receivable')
            .select('id')
            .eq('resident_id', residentId)
            .eq('reference_month', bill.reference_month)
            .maybeSingle(); // Use maybeSingle to avoid error if 0 found

        if (!existing) {
            const { error } = await supabase.from('accounts_receivable').insert(bill);
            if (error) console.error(`   Erro ao inserir ${bill.reference_month}:`, error.message);
            else console.log(`   + Inserido: ${bill.description}`);
        } else {
            console.log(`   . Já existe: ${bill.description}`);
        }
    }

    console.log('\n✅ Processo concluído!');
}

seedData();
