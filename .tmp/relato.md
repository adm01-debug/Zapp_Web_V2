Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011193310_queues_distribution_overflow.sql`: limitei o atalho sticky ao mesmo contrato da seleção normal (`queue_members` ativo, `profiles` ativo, `user_roles.role='agent'`, `max_per_agent` e requisitos de habilidade quando a fila é `skill`). Também troquei o desempate de `round_robin` para considerar o último evento real de atribuição para a fila (`conversation_events.to_agent_id` + `to_queue_id` ou `metadata.new_queue`) antes do `created_at` legado, e deixei `is_active=false` fora do helper de fila explícita para preservar o comportamento anterior; fila pausada continua negando atribuição.
- `scripts/db-audit/queues-distribution-overflow.test.sh`: adicionei casos no Postgres descartável que passam pelos triggers reais (`INSERT/UPDATE contacts`) para sticky com agente sem habilidade, sticky com usuário sem papel `agent`, fila inativa explícita, fila pausada e round-robin por contato transferido via `UPDATE queue_id`; o rollback agora é descrito como reaplicação após rollback, não como idempotência direta.
- `src/integrations/supabase/types.ts`: atualizei apenas o bloco `queues` para as colunas/FK criadas pela migration; conferi que a RPC `transfer_conversation` permaneceu no arquivo.
- `.github/workflows/db-guard.yml`: registrei o `.test.sh` novo no workflow de banco, porque o inventário automático recusou teste versionado sem passo no CI.

## Pontos da recusa
- Ponto 1: Corrigido em `queue_pick_agent` (`supabase/migrations/20261011193310_queues_distribution_overflow.sql`): o ramo sticky agora exige `user_roles.role='agent'` e replica o filtro de requisitos em `queue_skill_requirements`/`agent_skills`. Prova verde: `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[PASS] sticky+skill: ultimo atendente sem habilidade cai no qualificado` e `[PASS] sticky: ultimo membro sem papel agent cai no agente elegivel`.
- Ponto 2: Corrigido em `queue_pick_agent`: `round_robin` usa `conversation_events` da atribuição real para a fila antes de cair no `contacts.created_at`. Prova vermelho antes: com a migration anterior e o teste novo, `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[FAIL] round_robin: usa data da atribuicao (evento), nao created_at antigo do contato transferido: esperado '00000000-0000-0000-0000-0000000000b2', obtido '00000000-0000-0000-0000-0000000000b1'`. Prova verde depois: o mesmo comando -> `[PASS] round_robin: usa data da atribuicao (evento), nao created_at antigo do contato transferido`.
- Ponto 3: Corrigido preservando fila inativa explícita e mantendo fila pausada bloqueada: `queue_pick_agent` deixou de negar `is_active=false`, enquanto seleção default/overflow continuam filtrando filas ativas e não pausadas. Prova verde: `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[PASS] fila pausada: nao atribui`, `[PASS] fila pausada: nao transborda nem troca de fila` e `[PASS] fila inativa explicita: preserva comportamento anterior e ainda atribui atendente`.
- Ponto 4: Corrigido o relato do teste: a verificação final agora diz `reaplicacao apos rollback`, não promete idempotência de aplicar a mesma migration duas vezes. Prova verde: `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[PASS] reaplicacao apos rollback: migration volta a criar distribution`.

## Prova executada agora
- Vermelho sem a correção: `bash scripts/db-audit/queues-distribution-overflow.test.sh` com a migration anterior -> `RED_STATUS=1` e a falha do `round_robin` por usar `created_at` antigo do contato transferido.
- Verde com a correção: `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `GREEN2_STATUS=0` e `[OK] contrato de distribuicao/transbordo de filas provado`.
- Autorrevisão de escopo: `git log --oneline dia/2026-10-11..HEAD` -> `5eceb3404 fix(banco): corrige distribuicao de filas recusada`.
- Autorrevisão de tamanho: `git diff dia/2026-10-11...HEAD | wc -c` -> `46554`.
- Checagem de whitespace: `git diff --cached --check` antes do commit -> sem saída.
- Inventário de testes: `node scripts/ci/check-test-inventory.mjs` agora não lista `scripts/db-audit/queues-distribution-overflow.test.sh`; o comando ainda retorna 1 por três órfãos pré-existentes (`department-invite-contract-audit-vocabulary`, `talkx-conversion-defaults`, `team-chat-media-contract`) que não pertencem a este cartão.
- Varredura de produção/segredo nos arquivos tocados: buscas pelo identificador do banco real, URL Supabase e `service_role` em migration/teste -> `total_count: 0`.
- Conferência contra diffs alheios: `git diff --name-only dia/2026-10-11...HEAD` fica só nos 5 arquivos abaixo (incluindo este relato versionado); não trouxe as deleções de docs/testes/front da branch anterior.

## Arquivos no diff
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/queues-distribution-overflow.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011193310_queues_distribution_overflow.sql

## Avisos do juiz automático que não procedem
- Escopo: `.github/workflows/db-guard.yml` entrou só porque o próprio inventário/fechar exigiu registrar o `.test.sh` novo no CI; sem isso o check-test-inventory reprova o cartão. `scripts/db-audit/queues-distribution-overflow.test.sh` é a prova SQL versionada do defeito recusado.
- `updated_at`: o UPDATE de transbordo filtra `WHERE id = NEW.id AND queue_id = NEW.queue_id`; o contrato verde prova `[PASS] transbordo: toca UMA linha de contacts` e `[PASS] transbordo: contato intocado mantem updated_at antigo`.
- `LOOP`: `queues_prevent_overflow_cycle` tem teto explícito `v_depth < 100` e só percorre ponteiros de fila; o contrato verde prova o bloqueio de auto-ciclo e ciclo `b -> f0 -> b`.

## O que NÃO fiz e por quê
- Não alterei docs, Edge Functions, front nem migrations antigas; a branch anterior tinha diffs alheios e eu trouxe apenas migration/teste/tipos, mais o registro obrigatório do teste novo no `db-guard.yml`.
- Não alterei o contrato de fila default: seleção automática sem `queue_id` continua exigindo fila ativa e não pausada.
