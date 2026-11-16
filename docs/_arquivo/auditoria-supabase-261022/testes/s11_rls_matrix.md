# Testes S11 — Matriz de Isolamento RLS (Multi-tenant A × B)

**Status: NÃO TESTADO**

## Por que não foi testado

Teste de isolamento RLS requer dois usuários autenticados executando queries no mesmo banco.
Em produção, isso exigiria criar usuários de teste (operação de escrita) — proibido pela política
desta auditoria (somente leitura em produção).

## Roteiro para Execução Local

### Pré-requisitos

1. Banco local com migrations aplicadas via `scripts/db-audit/replay-local.sh`
2. `pg_cron` desabilitado (`alter system set cron.launch_active_jobs = off`)
3. Host do projeto oficial apontado para 127.0.0.1 (`/etc/hosts`)
4. Dois usuários de teste criados no banco local

### Setup

```sql
-- Criar usuários de teste no banco local
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES 
  ('aaaa0000-0000-0000-0000-000000000001', 'usuario_a@teste.local', '{"role": "authenticated"}'),
  ('bbbb0000-0000-0000-0000-000000000002', 'usuario_b@teste.local', '{"role": "authenticated"}');

INSERT INTO public.profiles (id, email, name)
VALUES
  ('aaaa0000-0000-0000-0000-000000000001', 'usuario_a@teste.local', 'Usuário A'),
  ('bbbb0000-0000-0000-0000-000000000002', 'usuario_b@teste.local', 'Usuário B');
```

### Casos de Teste

#### CT-01: SELECT de contatos (isolamento básico)

```sql
-- Como usuário A: criar contato
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaa0000-0000-0000-0000-000000000001"}';
INSERT INTO public.contacts (id, name, phone, created_by)
VALUES ('cccc0001-0000-0000-0000-000000000001', 'Contato de A', '11999990001', 'aaaa0000-0000-0000-0000-000000000001');

-- Como usuário B: não deve ver o contato de A
SET LOCAL request.jwt.claims = '{"sub": "bbbb0000-0000-0000-0000-000000000002"}';
SELECT count(*) FROM public.contacts WHERE id = 'cccc0001-0000-0000-0000-000000000001';
-- ESPERADO: 0
```

#### CT-02: UPDATE sem WITH CHECK (39 tabelas — verificar containment)

```sql
-- Como usuário A: tentar "roubar" registro de outro usuário via UPDATE
SET LOCAL request.jwt.claims = '{"sub": "aaaa0000-0000-0000-0000-000000000001"}';
-- Tentar mover para user_id de B (deve falhar se WITH CHECK estiver configurado)
UPDATE public.contacts SET user_id = 'bbbb0000-0000-0000-0000-000000000002'
WHERE id = '<id_criado_por_a>';
-- ESPERADO: 0 rows affected (com WITH CHECK) OU erro de policy
-- ATUAL: DESCONHECIDO (sem WITH CHECK nas 39 tabelas listadas)
```

#### CT-03: RPC SECURITY DEFINER com user_id param

```sql
-- Chamar função que aceita user_id como param, passando UUID de outro usuário
SET LOCAL request.jwt.claims = '{"sub": "aaaa0000-0000-0000-0000-000000000001"}';
SELECT public.admin_set_role('bbbb0000-0000-0000-0000-000000000002', 'admin');
-- ESPERADO: ERRO (função deve validar que caller é admin)
```

#### CT-04: Tabelas sem políticas (18 tabelas)

```sql
-- Como authenticated user: tentar SELECT em tabela sem policies
SET LOCAL request.jwt.claims = '{"sub": "aaaa0000-0000-0000-0000-000000000001"}';
SELECT count(*) FROM public.ai_jobs;
-- ESPERADO: 0 rows (RLS bloqueia, sem policy de SELECT)
```

### Critérios de Aprovação

| Teste | Critério |
|---|---|
| CT-01 | Usuário B vê 0 contatos de A |
| CT-02 | UPDATE para user_id de B retorna 0 rows |
| CT-03 | Chamada não-admin falha com SQLSTATE 42501 |
| CT-04 | Tabelas sem policy retornam 0 rows para authenticated |

### Como Executar

```bash
# No banco local:
psql "$LOCAL_DB_URL" -f testes/run_rls_matrix.sql 2>&1 | tee testes/resultado_rls_matrix.txt

# Verificar resultado:
grep -c "PASS" testes/resultado_rls_matrix.txt
grep -c "FAIL" testes/resultado_rls_matrix.txt
```