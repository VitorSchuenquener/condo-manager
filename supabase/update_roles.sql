-- Atualizar a verificação de cargos para incluir 'admin'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'sindico', 'contador'));

-- Política de Auditoria: Apenas ADMIN pode ver quem deletou documentos
DROP POLICY IF EXISTS "Authenticated users can view deleted documents" ON resident_documents;

CREATE POLICY "Admins can view all documents including deleted"
ON resident_documents FOR SELECT
TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' 
  OR 
  deleted = false
);
