# 🔍 DEBUG: Verificar Faturas Atrasadas

## Execute esta query no SQL Editor do Supabase:

```sql
-- Ver todas as contas pendentes e suas datas
SELECT 
    ar.id,
    ar.description,
    ar.due_date,
    ar.status,
    r.name as resident_name,
    CASE 
        WHEN ar.due_date < CURRENT_DATE THEN 'ATRASADA'
        ELSE 'EM DIA'
    END as situacao,
    CURRENT_DATE - ar.due_date as dias_atraso
FROM accounts_receivable ar
LEFT JOIN residents r ON ar.resident_id = r.id
WHERE ar.status = 'pendente'
ORDER BY ar.due_date;
```

## O que verificar:

1. **Quantas linhas retornam?** (deve ser 7 ou mais)
2. **Coluna `status`:** Todas devem estar como `'pendente'`
3. **Coluna `situacao`:** Quantas mostram `'ATRASADA'`?
4. **Coluna `dias_atraso`:** Valores positivos = atrasadas

## Se retornar 0 linhas:

Significa que as faturas NÃO estão com `status = 'pendente'`. Podem estar:
- `'pago'` (já foram pagas)
- `'atrasado'` (status errado - deveria ser 'pendente')

Nesse caso, execute:

```sql
-- Ver TODAS as contas (qualquer status)
SELECT 
    status,
    COUNT(*) as quantidade
FROM accounts_receivable
GROUP BY status;
```

Me envie o resultado dessas queries!
