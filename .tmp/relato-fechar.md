Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK dependencias 2s;OK db_guard 0s;OK tipos 181s;OK lint 0s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 22:18, gerados por máquina: valem mais que números escritos à mão)
```
 .../20261016005650_admin_unlock_login.sql          | 100 ++++++
 supabase/tests/admin_unlock_login_autorizacao.sql  | 368 +++++++++++++++++++++
 2 files changed, 468 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261016005650_admin_unlock_login.sql, supabase/tests/admin_unlock_login_autorizacao.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bGRANT\b, padrão:\bREVOKE\b


## O que mudou e por quê

- `supabase/migrations/20261016005650_admin_unlock_login.sql` (nova): cria
  `public.admin_unlock_login(p_email text) returns void` — SECURITY DEFINER,
  `SET search_path TO 'public','pg_temp'` — que (1) exige `public.is_admin(auth.uid())`
  e recusa com `admin_required`/SQLSTATE 42501 ANTES de qualquer efeito; (2) valida
  a entrada (`invalid_email`/22023 para NULL ou vazio); (3) apaga a linha de
  `public.login_attempts` pelo e-mail normalizado (`btrim`+`lower`, o mesmo formato
  de `record_failed_login`, UNIQUE(email)); (4) grava exatamente 1 linha em
  `public.audit_logs` por destravamento REAL, com `action='login_unlock'`,
  `user_id = auth.uid()` (QUEM destravou), `entity_id` = id da linha apagada e
  `details.email_masked` (1º caractere do local-part + domínio) — nunca o e-mail
  completo. Rollback executável na 1ª linha (`drop function if exists`): a função é
  nova, é o inverso exato; nada mais (tabela, coluna, gatilho, policy, ACL) é tocado.
- ACL explícita na própria migration: `REVOKE ... FROM PUBLIC, anon` e
  `GRANT ... TO authenticated`. Não há grant novo para `service_role` (o guard exige
  `auth.uid()`, que o claim de service_role não traz — seria ACL morta).
- `supabase/tests/admin_unlock_login_autorizacao.sql` (novo): prova de enforcement
  com PAPEL REAL (`SET LOCAL ROLE authenticated`/`anon` + JWT sintético), aplicando
  as migrations reais verbatim (`\i`) num PG17 descartável, no mesmo padrão de
  `supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql`.

## Prova

- Fronteira e efeito (PG17 descartável, `SET LOCAL ROLE` de verdade, nunca postgres
  na chamada):
  `PGPASSWORD=... psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55433 -U postgres -d postgres -v mig_dir="$PWD/supabase/migrations" -f supabase/tests/admin_unlock_login_autorizacao.sql`
  → `EXIT=0`, 33 asserções `PASS`, zero `FALHOU`, terminando em
  `LA OK: agente/supervisor/anonimo nao destravam; o admin destrava, a linha some / e fica 1 linha de auditoria com QUEM destravou e o e-mail mascarado.`
- O que a suíte cobre, com a saída no log: agente → `ERRO 42501 admin_required`
  (T1) e a linha do alvo intacta (T1c, sem efeito parcial); supervisor → `ERRO 42501`
  (T2); anônimo → `ERRO 42501 permission denied for function` (T3, ACL); agente com
  e-mail vazio para no guard, não na validação (T5 → 42501, não 22023); admin com
  e-mail vazio/nulo → `ERRO 22023 invalid_email` (T6/T7) sem criar trilha (T7b);
  admin destrava → `OK 1`, linha some (T8/T8b) e a trilha fica com `user_id` = o
  admin, `entity_id` = a linha apagada, `attempts=7`, `was_locked=true` (T9);
  `details->>'email_masked' = 'a***@empresa.com'` e o e-mail completo NÃO aparece em
  coluna nenhuma da trilha (T10); a linha da OUTRA conta bloqueada fica intacta
  (T11); o caminho direto pela tabela (PostgREST, sem a RPC) também não destrava o
  agente — `DELETE` = `OK 0` pela RLS (T13); conta já destravada e e-mail que nunca
  existiu dão a MESMA resposta, sem trilha nova (T12) — sem oráculo.
- Vermelho antes (mesma suíte, `-v sem_guarda=1`: a RPC é recriada — `CREATE OR
  REPLACE`, as ACLs sobrevivem — sem o guard de admin, que é o defeito que o cartão
  corrige):
  → `EXIT=3`, `LA FALHOU [T1 agente nao destrava (admin_required)]: esperava erro SQLSTATE 42501, veio: OK 1`.
  Ou seja: o teste reprova quando falta a correção e passa com ela.
- Rollback executado de verdade (PG17 descartável, migration aplicada verbatim e
  depois a linha do rollback `.tmp/rollback-prova.sql`):
  `criada | autenticado | anonimo = t | t | f` → `removida = t`.
- Migration aplicada no banco LOCAL da tarefa: `hermes-db-migrar
  supabase/migrations/20261016005650_admin_unlock_login.sql` →
  `CREATE FUNCTION / REVOKE / GRANT / COMMIT` e
  `APLICADA no banco LOCAL 'v2-2610152154a6d0' (produção não foi tocada)`.

## O que NÃO fiz e por quê

- Não toquei `src/` (a chamada `.rpc('admin_unlock_login')` e o botão da tela são do
  cartão da Íris, `t_35f3740e`); o contrato do banco já está pronto para ela.
- Não mexi em `supabase/schema-manifest.json`/`schema-catalog.json` (gerados).
- Não criei `scripts/db-audit/*.test.sh`: a prova foi para `supabase/tests/*.sql`,
  que não precisa de registro no inventário de CI.
- Não alterei `clear_login_attempts` nem a RLS de `login_attempts`. ACHADO (fora do
  escopo, registrado em comentário no cartão): a policy de DELETE da tabela aceita
  `is_admin_or_supervisor`, então um supervisor ainda pode apagar a linha direto pelo
  PostgREST; a RPC do cartão é mais estrita (só admin), como o critério de pronto
  pediu.
