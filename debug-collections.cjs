const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tdmuemuofczpulphfhpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbXVlbXVvZmN6cHVscGhmaHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzODA3MzksImV4cCI6MjA4MDk1NjczOX0.w2lFWR_UIiQzO7t2cSOv2yA9Ow7gOR3fLjFRobLQ-wQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function debugCollections() {
    console.log('🔍 Iniciando diagnóstico de Cobranças...\n');

    try {
        // 1. Buscar TODAS as contas (sem filtro)
        console.log('1️⃣  Buscando TODAS as contas (sem filtro de status)...');
        const { data: allBills, error } = await supabase
            .from('accounts_receivable')
            .select('id, description, due_date, status, resident_id')

        if (error) throw error;

        console.log(`   Total encontradas: ${allBills.length}`);

        // 2. Analisar datas e atrasos
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Hoje meia-noite
        console.log(`   Data de hoje (referência): ${today.toISOString()} (${today.toLocaleDateString()})\n`);

        let overdueCount = 0;

        console.log('2️⃣  Análise Detalhada (Top 10):');
        allBills.slice(0, 10).forEach((bill, i) => {
            // Tenta parsing de várias formas para debug
            const rawDate = bill.due_date;
            const dateT = new Date(rawDate + 'T00:00:00');

            // Simulação da lógica corrigida
            dateT.setHours(0, 0, 0, 0);

            const isOverdue = today > dateT;
            // Contar como atrasada apenas se for pendente E data passada
            if (isOverdue && bill.status === 'pendente') overdueCount++;

            console.log(`   [${i + 1}] Desc: ${bill.description}`);
            console.log(`       Vencimento: ${rawDate}`);
            console.log(`       Status Atual: '${bill.status}'`); // Mostra o status exato
            console.log(`       Atrasada? ${isOverdue ? 'SIM' : 'NÃO'}`);
            console.log('---');
        });

        console.log(`\n📊 RESUMO FINAL:`);
        console.log(`   Total Geral: ${allBills.length}`);
        console.log(`   Contas Atrasadas (Pendente + Data Passada): ${overdueCount}`);

        if (overdueCount === 0 && allBills.length > 0) {
            console.log('\n⚠️ ALERTA: Nenhuma conta foi considerada atrasada. Verifique se as datas de vencimento no banco estão futuras.');
        } else if (overdueCount > 0) {
            console.log('\n✅ OK: O script detectou contas atrasadas corretamente. O problema no frontend pode ser cache ou renderização.');
        }

    } catch (err) {
        console.error('❌ ERRO:', err.message);
    }
}

debugCollections();
