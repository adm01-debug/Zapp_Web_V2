Especialista: workersql

## Ambiente (leia antes do diff)
- `hermes-tarefa-iniciar`/`hermes-tarefa-fechar` estao **CONGELADOS** nesta sessao (o arquivo
  `MODO_V2` do guard nao existe mais em `~/.local/libexec/hermes-guard` desde hoje; o gate
  responde "o modo V1 esta suspenso"). Como o pai tambem fez, trabalhei no **workspace que o
  guard amarrou a este chat** (`agendadores-edge-purga-cron-refazer1-t_d017ecde`, branch
  `v2/agendadores-edge-purga-cron-26101306098a75`) e faco a transicao por `kanban_complete`
  com a nota do congelamento.
- A pasta que eu criei a mao no inicio (`agendar-auto-close-depois-edge-t_cb83cf1c`) nao foi
  usada: o guard amarra este chat ao workspace do pai e recusa qualquer outro caminho. Ela e
  copia nao registrada, sem commit nenhum (`rm` e proibido) — nenhum diff saiu dela.

## FAIXA DO PAI (nao e deste cartao)
- commit `a969af9cda` do cartao **t_ec25181f (PK-01)** — a correcao da Edge
  `auto-close-conversations` (lote 200, filtro de status/exclusao, encerramento no outbox),
  trazida por cherry-pick de `dia/2026-10-13..0fe6cec348`. Sao **2 arquivos** dela
  (`supabase/functions/auto-close-conversations/index.ts` e `index.test.ts`).
- Os dois commits seguintes da faixa (`825caa22c2`, `0fe6cec348`) so mexem em `.tmp/relato.md`
  daquele cartao; ficaram de fora, como manda a skill (relato de outro cartao nao entra).
- Base: `f975b5617e` (cartao t_d017ecde / PE-102), que ja esta no workspace do chat.
- O juiz barato mede a faixa `96dd72dc5f..HEAD` (10 arquivos, 3 de teste) e lista
  `check-test-inventory.mjs`, `supabase/config.toml` e os 2 arquivos da Edge como "fora do
  cartao": **sao os 8 arquivos dos DOIS cartoes pais** (t_d017ecde + t_ec25181f), nao do meu
  commit. O meu commit `61826bd8a6` toca **so** `supabase/migrations/20261014183000_agendar_auto_close.sql`
  e `supabase/tests/agendar_auto_close_conversations.sql`.

## O que mudou e por que
- `supabase/migrations/20261014183000_agendar_auto_close.sql` (novo): adiciona o job
  `auto-close-conversations` no `pg_cron` com cadencia `4-59/10 * * * *`, dono = dono atual,
  via `net.http_post` para `public.zapp_project_url() || '/functions/v1/auto-close-conversations'`
  com o header `x-cron-secret` lido do Vault (`gmail_cron_secret`, o MESMO valor do env da Edge —
  nao criei segredo novo) e `timeout_milliseconds := 120000`. Segue o molde do PE-102:
  funcao `public.apply_zapp_agendar_auto_close()` (`security definer`, `search_path` fixo) com
  `IF cron.job -> alter_job ELSE cron.schedule`, erro `cron_job_name_taken` se o nome for de
  outro dono, **nenhum DML direto em `cron.job`** (so leitura), REVOKE de EXECUTE para
  `public/anon/authenticated/service_role` e **guarda de saida** que aborta a migration se o job
  nao ficar com a cadencia/dono/header certos. Nao editei a migration do PE-102: a correcao e
  migration nova, aditiva, com rollback executavel nas 5 primeiras linhas.
- `supabase/tests/agendar_auto_close_conversations.sql` (novo): prova do contrato do job
  (nome, cadencia, dono, comando, idempotencia e ACL) sobre a migration REAL, num PG 17
  descartavel com stubs fieis de `cron` (com o ESCUDO do 42501) e do Vault. Roda com
  `psql -f`; o comando esta no cabecalho do arquivo. E auto-contido (o red usa
  `-v mig=/dev/null`), entao nao precisa de passo novo em workflow nem entra no
  `check-test-inventory.mjs` (que so varre `.test.ts` de `supabase/functions/` e `.test.sh` de
  `scripts/db-audit/`) — por isso fica em `supabase/tests/`, como o cartao manda.

## Criterio de pronto
1. **Job criado so depois da Edge corrigida** — a Edge corrigida (PK-01) esta no historico ANTES
   do commit desta migration (`git log --oneline`: `61826bd8a6` sobre `a969af9cda`) e no arquivo
   real: `AUTO_CLOSE_BATCH_LIMIT = 200`, `.not("conversation_status","in",'("resolved","archived")')`,
   `.is("deleted_at", null)`, `.limit(AUTO_CLOSE_BATCH_LIMIT)` e o encerramento pelo outbox.
   `supabase/config.toml` ja tem `[functions.auto-close-conversations] verify_jwt = false`
   (sem isso o cron tomaria 401 antes do `x-cron-secret`).
2. **Idempotente** — assercao E3/E3b do teste: reaplicar devolve `criados=0, alterados=1`,
   mantem 1 linha e preserva o `jobid`.
3. **Verificacao verde** — `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## Prova (saida real)
- vermelho antes: `bash /tmp/pk02_run.sh` (banco `red`, `-v mig=/dev/null`) →
  `FAIL E1. job auto-close-conversations ausente...` → `rc_vermelho=3`
- verde depois: mesmo driver, banco `verde` →
  ` {"criados": ["auto-close-conversations"], "alterados": []}`
  `PASS E1` / `PASS E2` / `PASS E3` / `PASS E3b` / `PASS E4`
  `OK: contrato do job auto-close-conversations (PK-02): TODAS as assercoes passaram.` → `rc_verde=0`
- rollback de verdade: a linha `-- Rollback:` do arquivo, extraida e aplicada no banco verde →
  `D1_jobs_restantes=0` e `D2_funcao_removida=true`
- sem regressao: `bash scripts/db-audit/agendadores-edge-e-purga-cron.test.sh supabase/migrations/20261013093000_agendadores_edge_e_purga_cron.sql`
  → `[OK] contrato dos agendadores Edge + purga do log do cron: TODAS as assercoes passaram.` (rc=0)
- `zapp-verify . --rapido` → `OK db_guard | OK tipos | OK lint | OK migrations | VERIFY: VERDE SEM BANCO`

## Passada de efeitos colaterais
- O unico objeto tocado e o job `auto-close-conversations` do dono atual; nenhuma tabela de
  aplicacao, nenhum GRANT/papel/ACL fora do REVOKE pedido na minha propria funcao; nenhum dado
  existente alterado; sem `DROP`/`TRUNCATE`/`DELETE`. A migration e uma transacao: se a guarda de
  saida falhar, nada fica aplicado. O `\i` das duas vezes no teste mostra que reaplicar nao
  duplica nem troca o `jobid` (sem gatilho/ordem escondida).

## O que NAO fiz e por que
- **Nao atualizei `scripts/db-audit/pg-cron-jobs-baseline.json`**: o arquivo esta fora de
  "ARQUIVOS QUE PODE TOCAR" e o job so passa a existir no banco de verdade quando o dono aplicar
  a migration. **Pendencia do operador que aplicar:** incluir
  `{"jobname":"auto-close-conversations","schedule":"4-59/10 * * * *"}` na lista do baseline
  (senao o drift guard acusa job novo). Fica registrado tambem em comentario no cartao.
- **Nao toquei `supabase/config.toml`, `.github/workflows/db-guard.yml` nem
  `scripts/db-audit/agendadores-edge-e-purga-cron.test.sh`** (fora da lista; o bloco A1a daquele
  teste continua valido porque ele aplica SO a migration do PE-102, e o job desta migration vem
  de um arquivo novo).
