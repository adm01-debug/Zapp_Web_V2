# 🔒 Instruções para Aplicar Migration RLS

## Status
- **Migration:** `supabase/migrations/20260412230000_fix_rls_policies_security.sql`
- **Status:** ⏳ PENDENTE APLICAÇÃO
- **Criticidade:** ALTA

## Como Aplicar

### Opção 1: Via Supabase Dashboard (RECOMENDADO)

1. Acesse: https://supabase.com/dashboard/project/allrjhkpuscmgbsnmjlv/sql
2. Copie todo o conteúdo do arquivo `supabase/migrations/20260412230000_fix_rls_policies_security.sql`
3. Cole no SQL Editor
4. Clique em "Run"
5. Verifique se não há erros

### Opção 2: Via Supabase CLI

```bash
# 1. Login no Supabase CLI
supabase login

# 2. Link ao projeto
supabase link --project-ref allrjhkpuscmgbsnmjlv

# 3. Aplicar migrations
supabase db push
```

### Opção 3: Via Supabase Migration (local → remoto)

```bash
# No diretório do projeto
cd /path/to/zapp-web

# Aplicar todas as migrations pendentes
supabase db push --project-ref allrjhkpuscmgbsnmjlv
```

## Verificação Pós-Aplicação

Execute este SQL para verificar se as policies foram aplicadas:

```sql
SELECT tablename, policyname, permissive, cmd, qual
FROM pg_policies 
WHERE tablename IN (
    'entity_versions', 
    'email_threads', 
    'email_messages', 
    'email_attachments',
    'whatsapp_connection_queues'
)
ORDER BY tablename, policyname;
```

### Resultado Esperado

As policies devem mostrar condições restritivas ao invés de `true`:

- `entity_versions`: `changed_by = auth.uid()` ou similar
- `email_threads`: `owner_id = auth.uid()` ou similar
- `email_messages`: via join com email_threads
- `email_attachments`: via join com email_messages
- `whatsapp_connection_queues`: validação de profile

## Rollback (se necessário)

Se algo der errado, as policies anteriores estavam com `USING(true)`, então reverter seria simplesmente:

```sql
-- NÃO EXECUTAR A MENOS QUE NECESSÁRIO
-- Isso remove as restrições de segurança
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name FOR SELECT USING (true);
```

## Contato

- **Responsável:** ti@promobrindes.com.br
- **Projeto:** allrjhkpuscmgbsnmjlv

---

**Última atualização:** 2026-04-12
