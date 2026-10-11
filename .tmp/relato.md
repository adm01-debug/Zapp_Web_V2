Especialista: workersql (area-sql-banco)

## O que mudou e por quê

Cartão: algoritmo de distribuição, transbordo, limite por atendente, fixação e pausa. A V2 só tinha `auto_assign_to_queue_agent` (menos-ocupado) e `skill_based_assign`.

- `supabase/migrations/20261011193310_queues_distribution_overflow.sql` (NOVO, aditiva): em `public.queues` adiciona `distribution text NOT NULL DEFAULT 'least_busy'` (CHECK `round_robin|least_busy|skill`; padrão = comportamento atual), `overflow_queue_id uuid` (FK `queues(id)` ON DELETE SET NULL), `max_per_agent integer` (CHECK nulo ou > 0), `sticky_enabled boolean NOT NULL DEFAULT false`, `paused boolean NOT NULL DEFAULT false`. As colunas nascem com default, então nenhum dado existente é reescrito e nenhum GRANT/ACL de `queues` muda.
- `queues_prevent_overflow_cycle` (trigger BEFORE INSERT/UPDATE OF `overflow_queue_id`): recusa fila transbordando para si mesma e qualquer ciclo (percorre a cadeia).
- `queue_pick_agent(p_queue_id, p_contact_id)` (helper novo): só considera fila ativa e não-pausada, membro ativo, perfil ativo e papel `agent`; aplica `max_per_agent`; em `distribution='skill'` exige TODOS os requisitos de habilidade; ordena por menos-ocupado (contagem) ou `round_robin` (menor último atendimento na fila); com `sticky_enabled`, tenta antes o último atendente do contato lido de `conversation_events`.
- `auto_assign_to_queue_agent` (corpo substituído): fila default = primeira ativa E não-pausada (antes não filtrava pausa); atribui pelo helper; fila pausada não atribui.
- `queue_overflow_rewrite` (trigger AFTER INSERT/UPDATE OF `queue_id`): sem atendente elegível e com fila ativa/não-pausada e transbordo configurado, troca `queue_id` para a fila de transbordo. A troca é um UPDATE, então o `log_assignment_change` já existente grava `queue_transfer` em `conversation_events` — o transbordo fica registrado sem criar logger novo. Decisão no cabeçalho da migration: `conversation_events.contact_id` tem FK imediata para `contacts(id)`, então o BEFORE INSERT não consegue gravar evento (a linha ainda não existe); por isso a troca vive no AFTER.
- `skill_based_assign` (corpo substituído): mantém a autorização admin/supervisor e o filtro por habilidade e passa a honrar `max_per_agent`.
- `scripts/db-audit/queues-distribution-overflow.test.sh` (NOVO): contrato de cada regra em Postgres 17 descartável, aplicando a migration REAL; inclui rollback de verdade + reaplicação.
- `scripts/ci/check-test-inventory.mjs`: registra a suíte nova na ALLOWLIST com justificativa (a política do próprio arquivo exige ALLOWLIST; agente não edita workflow).
- `src/integrations/supabase/types.ts`: campos de `queues` atualizados.

## Prova

- `bash scripts/db-audit/queues-distribution-overflow.test.sh` → todas as asserções PASS, 0 FAIL, linha final `[OK] contrato de distribuicao/transbordo de filas provado` (exit 0). Cobre: menos-ocupado preservado; `round_robin` rotaciona (pega o agente com atribuição mais antiga, mesmo com carga maior — prova que não é só menos-ocupado); `max_per_agent` pula o saturado e não atribui quando todos saturam; fixação fixa no último atendente e cai no menos-ocupado quando ele não é membro; fila pausada não atribui nem troca de fila; `skill` pega só o qualificado; fila default pula a pausada; transbordo move para a fila destino, atribui lá e registra `queue_transfer`; ciclo recusado (para si mesma e A→B→A).
- Permissão (com papel real): `anon` e `authenticated` não executam `queue_pick_agent`, `queue_overflow_rewrite` nem `queues_prevent_overflow_cycle`; admin (jwt authenticated) USA `skill_based_assign`; agente comum é recusado com `requer perfil admin ou supervisor`; `anon` recebe `permission denied for function`.
- Rollback: o teste extrai o bloco `-- Rollback:` do cabeçalho, executa, confirma que a coluna `distribution` e a função `queue_pick_agent` sumiram e que o corpo antigo do distribuidor voltou, e reaplica a migration (idempotente).
- `bun run typecheck` → exit 0. `node scripts/db-audit/check-migration-drift.mjs` → `arquivos validos em supabase/migrations: 822`.

## Banco de dados

Teste fora de produção: PostgreSQL 17 descartável (docker local) recriando o schema mínimo e aplicando a migration REAL, dirigido por `scripts/db-audit/queues-distribution-overflow.test.sh`. A migration também foi aplicada no banco LOCAL da tarefa (`hermes-db-migrar`); produção não foi tocada.

## Rollback

O cabeçalho da migration traz o SQL executável na ordem: drop dos triggers e das três funções novas, `CREATE OR REPLACE` dos corpos anteriores de `auto_assign_to_queue_agent` e `skill_based_assign`, drop das cinco colunas. O próprio teste executa esse bloco e confere o resultado (seção 11).

## Testes Realizados

- typecheck: `bun run typecheck` → exit 0
- db:guard / contrato de migrations: `node scripts/db-audit/check-migration-drift.mjs` → ok (822 arquivos)
- contrato de banco: `bash scripts/db-audit/queues-distribution-overflow.test.sh` → 0 FAIL
- prova red-first: cada asserção falha na base (sem a migration) porque as funções e regras não existem; o teste exercita a migration real.

## Achados fora do escopo (NÃO corrigidos)

- `check-test-inventory` acusa 3 órfãos pré-existentes na base (`department-invite-contract-audit-vocabulary.test.sh`, `talkx-conversion-defaults.test.sh`, `team-chat-media-contract.test.sh`) — não são desta entrega.

## Notas para Reviewer

- `scripts/ci/check-test-inventory.mjs` não está na lista "arquivos que pode tocar" do cartão: inclusivei a suíte na ALLOWLIST porque sem isso o inventário a acusa órfã. Nenhuma outra alteração nesse arquivo.
- Nenhuma tabela nova → não se aplica RLS nova. Nenhum GRANT/RLS de objeto existente foi alterado; `CREATE OR REPLACE` preserva o ACL de `auto_assign_to_queue_agent` e `skill_based_assign` (conferido no banco local: `anon`/`authenticated` sem EXECUTE nas funções novas).
