Especialista: worker (sql) (area-sql-banco)

# fix(sql): permite waiting -> archived em set_conversation_status

## O que mudou e por quê
- `supabase/migrations/20261011162528_set_conversation_status_waiting_para_archived.sql`
  (nova): `CREATE OR REPLACE FUNCTION public.set_conversation_status` com o corpo
  IDÊNTICO ao vigente (`20260930090000`), mudando SÓ o ramo da tabela de transições:
  `waiting -> ('open','resolved')` passa a `waiting -> ('open','resolved','archived')`.
  É o ADR-005 (máquina de estados da conversa): o gatilho de banco já aceita
  `waiting -> archived`; só a RPC ficou para trás e recusava `invalid transition`.
  Contrato aditivo: nada mais muda — assinatura `(uuid, text, text)`, `RETURNS void`,
  `SECURITY DEFINER`, `SET search_path`, o `PERFORM require_contact_edit_permission`
  ANTES de qualquer efeito (e antes do no-op), o no-op idempotente e o
  `INSERT INTO conversation_closures` ao resolver, com os mesmos REVOKE/GRANT.
- `supabase/tests/set_conversation_status_waiting_para_archived.sql` (novo): suíte
  versionada no padrão do repositório (mesmo formato de
  `supabase/tests/inbox_agregado_por_contato.sql`), roda no banco LOCAL com o
  conjunto real de migrations e exercita a RPC como PAPEL REAL
  (`set_config('role','authenticated')` + claims sintéticos `{sub, role}`).

## Prova
- vermelho antes (banco sem a migration; `position(...)` no `prosrc` = 0):
  `zapp-db-local psql . v2-26101113201ee9 -v ON_ERROR_STOP=1 < supabase/tests/set_conversation_status_waiting_para_archived.sql`
  → `ERROR:  T1 FALHOU: waiting -> archived deveria ser permitido, mas deu erro [P0001] invalid transition waiting -> archived`
- verde depois (migration aplicada com `hermes-db-migrar`, log
  `APLICADA no banco LOCAL 'v2-26101113201ee9'`):
  `zapp-db-local psql . v2-26101113201ee9 -v ON_ERROR_STOP=1 < supabase/tests/set_conversation_status_waiting_para_archived.sql`
  → `NOTICE:  set_conversation_status_waiting_para_archived: suite OK (T0 gatilho, T1 waiting->archived, T2 permissao sem efeito, T3 no-op, T4 archived->open, T5 recusas, T6 fechamento, T6b negacao sem fechamento, T7 ACL) — 9 grupo(s)` seguido de `DO` e `ROLLBACK`.
- rollback executável: extraí as linhas `--   <stmt>;` da migration e rodei no banco
  local → `CREATE FUNCTION / REVOKE / GRANT / GRANT / GRANT`; `position(...)` volta
  de >0 para 0 (corpo anterior restaurado); reaplicada em seguida → volta a >0.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (66s)` (é assim que o fechar
  chama: sem nome de conjunto o `banco_local` é pulado de propósito).

O que a suíte prova: T0 o gatilho FSM aceita `waiting -> archived`; T1 a RPC passa a
permitir e grava `conversation_status_changed_at`; T2 chamador sem permissão (agente
que não é dono, sem fila) recebe `42501 contact_not_authorized` com estado INTACTO;
T3 o no-op não reescreve `changed_at`; T4 `archived -> open` segue permitido; T5
`archived -> waiting` e `archived -> resolved` CONTINUAM recusados; T6 `resolved`
grava `conversation_closures` e a negociação por falta de permissão não deixa
fechamento; T7 única sobrecarga `(uuid,text,text)`, `anon` sem EXECUTE e barrado,
`authenticated/service_role/postgres` com EXECUTE.

## O que NÃO fiz e por quê
- Não editei a migration original (`20260930090000`): correção = migration nova.
- Não criei `scripts/db-audit/*.test.sh` novo (evita `.test.sh` órfão sem passo em
  `.github/workflows/db-guard.yml`). O contrato de autorização já tem cobertura
  versionada em `scripts/db-audit/wa-tag-and-status-authorization.test.sh`, que roda
  antes e depois no Postgres descartável; a prova nova do cartão ficou em
  `supabase/tests/`, como o cartão pede.
- Não toquei nada fora de banco (nenhuma tela/hook/Edge altera o status por esta RPC).
