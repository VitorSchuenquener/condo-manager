# 🔧 Correção de Erro: payment_amount

## ❌ Erro Encontrado
```
Could not find the 'payment_amount' column of 'accounts_receivable' in the schema cache
```

## ✅ Solução

Execute o script SQL abaixo no **SQL Editor** do Supabase:

### Passo a Passo:

1. Acesse o **Supabase Dashboard**: https://supabase.com/dashboard
2. Selecione seu projeto **CondoManager**
3. No menu lateral, clique em **SQL Editor**
4. Clique em **"+ New Query"**
5. Cole o conteúdo do arquivo `migration_add_payment_fields.sql`
6. Clique em **"Run"** (ou pressione Ctrl+Enter)
7. Aguarde a mensagem de sucesso
8. Pronto! O erro está corrigido

### O que o script faz:

Adiciona as seguintes colunas nas tabelas:

**accounts_receivable:**
- `payment_amount` - Valor efetivamente recebido (com juros/multa)
- `payment_method` - Forma de pagamento (PIX, Transferência, etc.)
- `payment_proof` - JSON com dados do comprovante/NF anexado

**accounts_payable:**
- `payment_amount` - Valor efetivamente pago
- `payment_method` - Forma de pagamento
- `payment_proof` - JSON com dados do comprovante/NF anexado

### Após executar:

Recarregue a página do sistema e teste novamente o recebimento. O erro não deve mais aparecer!

---

**Nota:** Este script usa `ADD COLUMN IF NOT EXISTS`, então é seguro executar múltiplas vezes sem causar erros.
