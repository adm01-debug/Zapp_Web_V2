Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Restaurei na ponta de dia/2026-10-12 o trabalho já aprovado do cartão anterior (branch
v2/refazer-reactions-emoji-contato-t-f23448-26100907574162, commit 01d6a22d9), que tinha
ficado de fora por conflito com a base. Cherry-pickei os DOIS commits da branch:
- 07c58c990 "fix(migrações): torna rollback de reactions resiliente a conflito" →
  - supabase/migrations/20261007001008_message_reactions_agente_sem_chave_de_contato.sql (nova): gatilho
    message_reactions_normalize_author que zera contact_id quando há user_id (autoria agente x cliente),
    tabela de apoio do rollback e backfill das reações de agente legadas.
  - scripts/db-audit/message-reactions-author-model.test.sh (nova): prova em Postgres 17 descartável
    (docker) do defeito (2ª reação de agente ao mesmo emoji colide em 23505 na chave do contato),
    migration, rollback executável extraído do próprio arquivo, idempotência e RLS como authenticated.
  - scripts/ci/check-test-inventory.mjs: entrada na ALLOWLIST para o novo .test.sh.
- 01d6a22d9 "fix(db): explicita rollback de reações" → move o rollback da migration para o formato
  executável (prosa + bloco `-- Rollback (SQL executável, na ordem):`) e ajusta a extração no teste.

Único conflito do cherry-pick: scripts/ci/check-test-inventory.mjs (a base já tinha duas entradas
novas na ALLOWLIST de outro cartão: ia131-audio-stt-cadeia e multiplix-completion-item-queue).
Resolvi MANTENDO as duas entradas da base E a entrada nova (message-reactions-author-model), sem
remover nada — não reescrevi trabalho de outro cartão.

Confirmei que o defeito ainda existia na base antes de mexer: nenhuma migration em
supabase/migrations/ citava message_reactions_normalize_author na ponta de dia/2026-10-12.

## Prova
- verde: `bash scripts/db-audit/message-reactions-author-model.test.sh` →
  `[OK] R2-DB-021: modelo de autoria de reacao provado (defeito vermelho -> verde -> rollback -> idempotente)`
  (todos os [PASS] dos blocos A/B/ROLLBACK/C; EXIT=0)
- vermelho dentro do próprio roteiro (bloco A, estado anterior): `[PASS] A: 2o agente no mesmo emoji
  colide na chave do contato` e `[PASS] A: reacao de cliente colide com a de agente` — o defeito 23505
  é reproduzido antes da migration e o mesmo INSERT passa depois (bloco C).
- banco local: `hermes-db-migrar supabase/migrations/20261007001008_...sql` →
  `APLICADA no banco LOCAL 'v2-2610121722c913' (produção não foi tocada).`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (97s)` (dependencias/db_guard/tipos/
  lint/migrations OK); o conjunto de banco nomeado não foi passado, então banco_local fica NÃO VERIFICADO.

## Sobre o aviso do fechar ("SEM DDL/migration")
Falso positivo. O pedido original DESTE cartão é uma migration (Item 303 do BACKLOG_VERIFICADO,
R2-DB-021, "área migrations"). O próprio rodapé do cartão ressalva "sem DDL/Edge/dependência nova
salvo se o pedido original exigia" — e ele exigia. A migration nova é a entrega pedida, não escopo
extra: as duas unicidades independentes de message_reactions continuavam na ponta de dia/2026-10-12
até este cartão. Repito o MESMO `hermes-tarefa-fechar` sem mudar nada.

## O que NÃO fiz e por quê
- Não editei `.github/workflows/db-guard.yml`: agente não edita workflow (a entrada ficou na ALLOWLIST
  do check-test-inventory.mjs, com a nota "promover pelo dono do workflow" — igual ao padrão dos demais
  .test.sh de container). Registro em uma linha: passo pendente `bash scripts/db-audit/message-reactions-author-model.test.sh`.
- Não mexi no edge (supabase/functions/**) nem no src/**: fora da minha área.
- `check-test-inventory.mjs` reprova 6 órfãos (department-invite-contract-audit-vocabulary, ia-usage-outbox-duravel,
  talkx-conversion-defaults, team-chat-department-transfer-guards, team-chat-media-contract,
  team-direct-conversation-race) — todos já existem na ponta de dia/2026-10-12 e não estão na ALLOWLIST de base:
  falha PRÉ-EXISTENTE, não introduzida por este cartão (o arquivo novo NÃO aparece como órfão).
