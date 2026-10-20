Especialista: semisenior (area-testes-do-produto)

## O que mudou e por quê
- `supabase/functions/message-delivery/index.test.ts`: trouxe o commit de teste do trabalho anterior (`084d52ae8b`, via `git cherry-pick`, aplicou limpo) — 6 `Deno.test` novos cobrindo os ramos que o cartão lista como descobertos: 404 do claim vazio com a linha PRESENTE e negada (mensagem de OUTRO agente e mensagem de ENTRADA), `mark_first_response` falhando por ERRO retornado e por EXCEÇÃO sem derrubar o envio confirmado, recusa 4xx genérica do provedor (`provider_rejected`, sem reconciliação). Meu delta contra o HEAD recebido (`5bb1637787..HEAD`) toca SÓ este arquivo.
- `.tmp/relato.md` (este arquivo): reescrito para corrigir os 2 pontos da recusa (primeira linha e comando de verificação do escopo).

## Prova
- verde depois: `deno test --config scripts/ci/deno.json --allow-env supabase/functions/message-delivery/index.test.ts` → `ok | 28 passed | 0 failed (47ms)`
- o arquivo tem 28 casos (`grep -c "Deno.test"` = 28) e o meu commit acrescenta 6 (`git show HEAD | grep -cE '^\+Deno\.test'` = 6).

## Pontos do revisor
- Ponto 1: primeira linha agora é exatamente `Especialista: semisenior (area-testes-do-produto)` (linha 1 deste arquivo).
- Ponto 2: comando que prova o escopo do MEU commit (só o teste, sem produção):
  `git diff 5bb1637787..HEAD --stat` → `supabase/functions/message-delivery/index.test.ts | 157 ++++...-` + `1 file changed, 151 insertions(+), 6 deletions(-)`.
  E `git show --stat HEAD` confirma: 1 arquivo (`supabase/functions/message-delivery/index.test.ts`), sem `index.ts`, sem migration.

## Arquivos no diff da branch (saída de `git diff --name-only dia/2026-10-13...HEAD`, colada)
- .tmp/relato.md
- scripts/db-audit/message-delivery-phase1-behavior.test.sh
- scripts/db-audit/message-delivery-phase1-runtime.sql
- supabase/functions/message-delivery/index.test.ts
- supabase/functions/message-delivery/index.ts
- supabase/migrations/20261013210004_outbound_post_started.sql
- (`git diff --stat dia/2026-10-13...HEAD`: 6 files changed, 1063 insertions(+), 46 deletions(-))

## O que NÃO fiz e por quê
- FAIXA DO PAI: os outros 5 arquivos do diff (`index.ts`, a migration `20261013210004_outbound_post_started.sql`, os 2 scripts `db-audit` e o restante de `index.test.ts` fora do meu commit) já estavam na branch do workspace quando a recebi (histórico do cartão pai t_996e42f2, commits `090eb4811e`, `cd9f5e69e8`, `5bb1637787`); NÃO foram editados por mim. Meu único commit novo é o de teste acima.
- Produção intacta: `git diff 5bb1637787..HEAD` lista só `index.test.ts`; nenhum `index.ts` nem migration no meu commit.
