-- Migração: Adicionar campos de pagamento em accounts_receivable
-- Execute este script no SQL Editor do Supabase

-- Adicionar colunas de pagamento
ALTER TABLE accounts_receivable 
ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('pix', 'transferencia', 'boleto', 'dinheiro', 'cheque')),
ADD COLUMN IF NOT EXISTS payment_proof JSONB;

-- Adicionar colunas de pagamento em accounts_payable também
ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('pix', 'transferencia', 'boleto', 'dinheiro', 'cheque')),
ADD COLUMN IF NOT EXISTS payment_proof JSONB;

-- Comentários
COMMENT ON COLUMN accounts_receivable.payment_amount IS 'Valor efetivamente recebido (com juros/multa)';
COMMENT ON COLUMN accounts_receivable.payment_method IS 'Forma de pagamento utilizada';
COMMENT ON COLUMN accounts_receivable.payment_proof IS 'Array com informações do comprovante/NF anexado';

COMMENT ON COLUMN accounts_payable.payment_amount IS 'Valor efetivamente pago';
COMMENT ON COLUMN accounts_payable.payment_method IS 'Forma de pagamento utilizada';
COMMENT ON COLUMN accounts_payable.payment_proof IS 'Array com informações do comprovante/NF anexado';
