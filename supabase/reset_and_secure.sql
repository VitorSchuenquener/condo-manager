-- 1. RESETAR Perfis (Cuidado: Isso remove os vínculos dos usuários atuais)
TRUNCATE TABLE profiles CASCADE;

-- 2. Adicionar coluna de Aprovação
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- 3. Atualizar Políticas de Segurança (RLS) para permitir Gestão de Usuários
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Quem pode ver perfis?
-- Admin vê todos. Usuário comum vê só o seu (ou todos, se precisarmos exibir nomes em listas, vamos manter todos por enquanto para auditoria visual)
CREATE POLICY "Users can view all profiles" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

-- Quem pode ATUALIZAR perfis? (Aqui está o segredo da Aprovação)
-- Admin pode atualizar QUALQUER perfil (para aprovar).
-- Usuário comum só pode atualizar o próprio (ex: mudar nome).
CREATE POLICY "Admin can update approval status"
ON profiles FOR UPDATE
TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  OR
  auth.uid() = id
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  OR
  auth.uid() = id
);
