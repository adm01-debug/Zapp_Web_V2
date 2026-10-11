Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Cartão: gestão de departamentos pelo admin (criar, renomear, excluir com segurança) — a tela de departamentos do V3 (`docs/estado/01-frontend.md`, "DepartmentsPage") é admin-only.

- `supabase/migrations/20261011191021_departments_admin.sql` (nova, aditiva):
  - **Passo 1 do cartão — política de escrita:** `departments_admin_write` passa de `is_admin_or_supervisor()` para `is_admin()` (convenção GATE 16, 20260830150000: WRITES → `is_admin()`; SELECT fica com `departments_select`). Assim INSERT/UPDATE direto em `departments` só passa para admin; agente e supervisor ficam barrados pela RLS. Supervisores não perdem acesso: as RPCs de departamento (`create_department_invite`, `set_department_whatsapp_config`) são SECURITY DEFINER e não passam pela policy.
  - **ACL de exclusão:** `REVOKE DELETE ON public.departments FROM authenticated`. Antes o authenticated tinha DELETE de TABELA (confirmado no `supabase/schema-manifest.json`), então um admin apagava a linha direto pelo PostgREST e o `ON DELETE CASCADE` de `team_conversations` (FK de 20260929200000) apagava conversas em cascata sem checagem. `anon` já não tinha grant (20260928460000).
  - **`public.delete_department(p_department_id uuid, p_move_to uuid DEFAULT NULL) -> jsonb`** (SECURITY DEFINER, `search_path = pg_catalog, public`): só admin (`is_admin(auth.uid())`). Sem destino, recusa sem apagar quando há membros/conversas/filas ligados, devolvendo as contagens (`{ok:false, error:'department_in_use', members, conversations, queues}`). Com destino, move membros e conversas para o departamento escolhido, apaga a linha e audita — tudo em uma transação. A FK de `profiles.department_id` (NO ACTION) e o índice único de conversa-tipo são checados antes do DML.
  - **`public.departments_overview()`** (SECURITY DEFINER): contagens de membros, filas e conversas por departamento; admin/supervisor.
  - **ACL das funções:** `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated`; o papel é decidido dentro da função.
- `scripts/db-audit/departments-admin-management.test.sh` (novo) + passo em `.github/workflows/db-guard.yml`: contrato no Postgres 17 descartável (docker), no formato dos testes irmãos de departamento.
- `src/integrations/supabase/types.ts`: as duas funções novas (gerado).

## Prova
- verde depois: `bash scripts/db-audit/departments-admin-management.test.sh` (postgres:17-alpine) → `[OK] contrato departments-admin-gestao verificado: 14 etapas`; todas as linhas `[OK]`, zero `[FAIL]`.
- O contrato mede o defeito ANTES (authenticated tem DELETE de tabela; DELETE direto apaga a conversa em cascata) e, DEPOIS de aplicar o arquivo real da migration, prova: DELETE direto barrado (42501); INSERT de supervisor/agente barrado pela RLS (42501); INSERT/UPDATE do admin ok; RPC executável só por authenticated e barrada a anon/agente/supervisor (42501); recusa `department_in_use` com contagens sem apagar; move+apaga+auditoria; conflito de conversa-tipo; `departments_overview`; e o rollback.
- MUTACAO A (cópia sem o `REVOKE DELETE`) → contrato FALHA (`has_table_privilege ... deveria ser f, obtido t`), provando que a revogação é load-bearing.
- MUTACAO B (cópia com o portão de papel desligado) → contrato FALHA (`agente nao executa a RPC: a chamada passou`), provando que o gate `is_admin` é load-bearing.
- Rollback do bloco `-- Rollback (...)` executado: devolve o DELETE ao authenticated, restaura a policy e remove as duas RPCs.

## Efeitos colaterais conferidos (passada obrigatória)
- `team_conversations.department_id` é CASCADE → a contagem de conversas impede a cascata acidental; o único caminho de exclusão passa pela RPC.
- `department_audit_logs.department_id` é CASCADE → a auditoria por departamento do alvo apagado some junto; por isso o fato da exclusão também vai para `public.audit_logs`, que não tem FK para `departments` e sobrevive.
- UPDATE de `profiles` no move dispara o gatilho de `updated_at`: é mudança real de vínculo (não backfill), então a data atualiza — comportamento esperado, registrado aqui.
- Mover duas conversas `type='department'` colidiria com o índice único: a RPC recusa antes de tocar dados (não é falha parcial).
- Nenhum GRANT/papel de objeto existente mudou além do `departments_admin_write` (pedido no passo 1) e do `REVOKE DELETE` (exclusão segura, pedido no passo 2). Sem PII/telefone/texto em auditoria.

## O que NÃO fiz e por quê
- **Local do teste:** o cartão citou `supabase/tests/` ou `tests/contracts/`. Usei `scripts/db-audit/*.test.sh` porque é o único arranjo que executa como os papéis REAIS (authenticated/anon) num Postgres descartável — a suíte `supabase/tests/*.sql` roda como service_role (BYPASSRLS) e não prova RLS. É a convenção dos cartões de banco (ex.: `department-whatsapp-mode-rpc.test.sh`) e o passo novo foi registrado em `.github/workflows/db-guard.yml`.
- **"Filas" não têm vínculo direto com departamento no schema V2** (nem `queues` nem `queue_members` têm `department_id`). Defini "fila ligada ao departamento" como fila com ao menos um membro ATIVO cujo profile pertence ao departamento; a definição está comentada no SQL e é a mesma usada na recusa e no overview.
- **Não criei RPC de criar/renomear:** o passo 1 do cartão pede a POLICY, e criar/renomear acontecem por INSERT/UPDATE direto (agora só admin). A tela (outro cartão) usa esses caminhos.
- **Achado fora do escopo:** `node scripts/ci/check-test-inventory.mjs` acusa 3 testes órfãos pré-existentes (`department-invite-contract-audit-vocabulary.test.sh`, `talkx-conversion-defaults.test.sh`, `team-chat-media-contract.test.sh`) — nenhum é deste cartão; meu arquivo foi registrado no `db-guard.yml` e não aparece na lista.
