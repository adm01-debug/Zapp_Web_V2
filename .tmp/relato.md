Especialista: workersql

## O que mudou e por quê
- supabase/migrations/20261013230001_delete_message_rpc.sql (novo): cria
  `public.delete_message(p_message_id uuid)` — SECURITY DEFINER, `search_path = public, pg_temp`,
  negada por padrão (REVOKE PUBLIC/anon/authenticated/service_role; GRANT EXECUTE só a authenticated).
  Ela marca `is_deleted = true` e grava o rastro (`deleted_by` = profiles.id de quem apagou,
  `deleted_at`) e **mantém `content` original** (a UI mostra o rótulo). Autoriza por: visibilidade do
  contato (`is_contact_visible_to_user`, o mesmo predicado de SELECT/INSERT) E a mensagem é do próprio
  agente (`messages.agent_id` = profile do chamador) OU admin/supervisor. Erro uniforme
  `message_not_deletable` (42501) para inexistente/fora de visibilidade/sem posse — sem oráculo de
  existência. Idempotente: segunda chamada devolve false sem tocar no original.
- supabase/migrations/20261013230001_delete_message_rpc.sql: `ALTER TABLE public.messages ADD COLUMN
  IF NOT EXISTS deleted_by uuid, deleted_at timestamptz` (aditivo, nullable; nenhum fluxo existente
  quebra).
- supabase/tests/delete_message_rpc.sql (novo): prova com papel REAL (SET LOCAL ROLE authenticated/anon/
  service_role, nunca superusuário) contra o arquivo REAL da migration aplicado via `\i`.

## Prova
- vermelho antes: `docker exec -i <pg> psql -X -v ON_ERROR_STOP=1 -U postgres -v sem_migration=1 < supabase/tests/delete_message_rpc.sql` → `ERROR: function public.delete_message(unknown) does not exist` (exit 3).
- verde depois: mesmo comando com `-v mig=/tmp/mig.sql` (aplica o arquivo real) → `NOTICE: T1 OK…T2 OK… T3-T6 OK… T7 OK… T8 OK… T9 OK… T10 OK… T11 OK…` e `NOTICE: delete_message_rpc: TODAS as assercoes passaram (T1-T11)` (exit 0). T1 apaga a própria e confirma `content` intacto + rastro; T2 idempotente; T3-T6 colega/cliente/fora de visibilidade/inexistente respondem IGUAL; T7 admin apaga e preserva; T8/T9 anon e service_role barrados pela ACL; T10 id nulo uniforme e chamador sem profile recusado; T11 ACL + colunas.
- banco local (schema real, com os gatilhos e policies de verdade): `hermes-db-migrar supabase/migrations/20261013230001_delete_message_rpc.sql` → `APLICADA no banco LOCAL 'v2-26101304039317' (produção não foi tocada)`. Smoke como authenticated contra a estrutura real → `NOTICE: SMOKE OK (banco local real): apagou, rastro gravado, content/proveniencia intactos` (fixture removida ao fim).
- rollback executado de verdade: apliquei a migration e rodei as 3 linhas do `-- Rollback` → `NOTICE: ROLLBACK OK: funcao e colunas removidas (rollback executavel)`.
- verificação: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK migrations`; `VERIFY: VERDE SEM BANCO (171s)`.

## Efeitos colaterais (passada obrigatória)
- Gatilhos no UPDATE: `trg_guard_message_provenance_fields` e `trg_guard_message_delivery_internal_fields` só barram quando `current_user NOT IN ('postgres','service_role')`; como a RPC é SECURITY DEFINER do dono `postgres`, eles liberam — e a RPC não toca `content`/`sender`/`agent_id`/`external_id`/`media_url`/campos de delivery. `update_messages_updated_at` roda no UPDATE (esperado para uma mutação).
- Atômico: valida tudo (visibilidade/posse/idempotência) ANTES do único UPDATE; falha de validação não altera nada (T3-T6 provam "as recusas nao alteraram nenhuma linha").
- Sem oráculo: inexistente, fora de visibilidade e sem posse dão a MESMA resposta `message_not_deletable` (T3-T6).
- Nenhum GRANT/papel/ACL existente mudou: só a assinatura nova recebe/nega EXECUTE.
- `updated_at` muda no UPDATE (gatilho `update_messages_updated_at`) — isso é ESPERADO aqui: a linha
  realmente foi alterada (marcada como apagada) e é uma única linha travada por `FOR UPDATE`, não um
  backfill em massa (o caso que gerou a recusa de 06/10 era um UPDATE em TODAS as linhas). O texto
  original (`content`) e os campos de proveniência ficam preservados; só o carimbo de atualização e o
  rastro de exclusão mudam.

## O que NÃO fiz e por quê
- Não editei `src/integrations/supabase/types.ts` e não toquei nos 4 pontos de UI
  (`MessageContextActions`, `MessageHoverToolbar`, `useFilesActions`, `chat.service`): o cartão dá os
  pontos de UI ao filho t_fef320c8 (iris) e manda não editar types.ts — quem regenera é o worker de CI/
  gen-types. O contrato que a tela precisa consumir é `public.delete_message(uuid) → boolean` (true =
  apagou; false = já estava apagada) e o texto original segue em `content`.
- Não dupliquei o gatilho de guarda de `content` (é do cartão ED1/t_8060d654).
- Não adicionei passos novos em `.github/workflows/db-guard.yml` (arquivo fora dos meus arquivos).
- **REGISTRO PENDENTE**: `supabase/tests/delete_message_rpc.sql` roda no harness de Postgres
  descartável (comando na prova), mas ainda não está ligado a um `scripts/db-audit/*.test.sh` nem a um
  passo do `db-guard.yml`. Quem cuida do inventário de testes/CI (worker de CI) precisa registrá-lo.

Concluí: migration e prova entregues; zapp-verify verde (banco não coberto sem nome de conjunto — aviso previsto no cartão).
