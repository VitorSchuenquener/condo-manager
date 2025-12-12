-- Tabela de Perfis de Usuário (Para linkar o login ao nome/cargo)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sindico', 'contador')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS para Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

-- Adicionar Rastreabilidade (Quem criou?) nas tabelas que faltam
ALTER TABLE residents ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE accounts_receivable ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Adicionar Auditoria de Exclusão em Documentos (Soft Delete)
-- Ao invés de deletar de verdade, marcamos como deletado para saber quem fez
ALTER TABLE resident_documents ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
ALTER TABLE resident_documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE resident_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Atualizar políticas de Documentos para esconder os deletados (mas manter no banco)
DROP POLICY IF EXISTS "Authenticated users can access resident_documents" ON resident_documents;

CREATE POLICY "Authenticated users can view active documents"
ON resident_documents FOR SELECT
TO authenticated
USING (deleted = false);

CREATE POLICY "Authenticated users can insert documents"
ON resident_documents FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can soft delete documents"
ON resident_documents FOR UPDATE
TO authenticated
USING (true);
