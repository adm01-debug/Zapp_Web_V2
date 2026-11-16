# S11 — RLS: Isolamento Multi-tenant

**Coletado em:** 2026-11-01

## Modelo de Tenant

O Zapp Web V2 é single-tenant por instância Supabase — um único projeto serve todos os
usuários do sistema. O "isolamento" é por `profile_id`/`user_id`, não por tenant separado.

## Políticas de SELECT para Tabelas Críticas

```sql
SELECT tablename, policyname, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND cmd IN ('SELECT','ALL')
  AND tablename IN ('contacts', 'messages', 'profiles', 'whatsapp_connections', 'audit_logs')
ORDER BY tablename, cmd;
```

### Grants anon vs authenticated

| Role | Writes (não-anon) | Detalhes |
|---|---|---|
| anon | 1 tabela (INSERT) | `password_reset_requests` |
| authenticated | 156 tabelas | múltiplas permissões |

### UPDATE sem WITH CHECK (39 tabelas)

Ver S3 para lista completa.

**Exemplo de risco (hipotético):**
```sql
-- Policy atual (USING apenas):
USING (user_id = auth.uid())

-- Permite este UPDATE malicioso:
UPDATE contacts SET user_id = '<outro_uuid>' WHERE id = '<meu_contato>';
-- Isso passa USING (meu_contato é meu) mas deveria falhar WITH CHECK
```

## Matriz de Isolamento Tenant A × B

**NÃO TESTADO** — teste real de isolamento requer dois usuários autenticados e execução
de queries cruzadas. Requer banco local com migrations aplicadas.

Ver `testes/s11_rls_matrix.md` para roteiro de testes.

## Funções RPC Sensíveis

Funções com `SECURITY DEFINER` que recebem `user_id` como parâmetro devem validar que
o `user_id` passado corresponde a `auth.uid()`. Query pendente para verificar sistematicamente.