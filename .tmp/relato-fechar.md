- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 17s;OK lint 2s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (11/10 20:07, gerados por máquina: valem mais que números escritos à mão)
```
 scripts/db-audit/inbound-effects-replay.test.sh    | 327 +++++++++++++++++++++
 .../__tests__/inbound-effects-replay.test.ts       | 225 ++++++++++++++
 .../_shared/evolution-webhook-messages.ts          | 216 +++++++-------
 ...261005224959_inbound_message_effects_outbox.sql | 297 +++++++++++++++++++
 4 files changed, 948 insertions(+), 117 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Passada adversarial do [refazer]: juiz indisponível (não bloqueou)
- Checagens determinísticas do fechar: 0 aviso(s) (ver relato do fechar)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts, supabase/functions/_shared/evolution-webhook-messages.ts, supabase/migrations/20261005224959_inbound_message_effects_outbox.sql; diff grande (66596 caracteres): cartão deveria ser menor; padrão sensível: caminho:supabase/functions/_share, caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\.delete\(\)

Especialista: senior (area-sql-banco + area-edge-api)

## Pontos do refazer

Ponto 1: aplicar a base original do outbox inbound do #69 sem trazer a correção nova de rollback
- O que mudei: reapliquei o conteúdo da base original do outbox inbound nos 4 arquivos do cartão: `scripts/db-audit/inbound-effects-replay.test.sh`, `supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts`, `supabase/functions/_shared/evolution-webhook-messages.ts` e `supabase/migrations/20261005224959_inbound_message_effects_outbox.sql`.
- Mantive o escopo no pedido original: a Edge grava opt-out/citação/direção na RPC `ingest_inbound_message`; a migration cria `public.inbound_message_effects`, a assinatura nova do ingest com `p_from_me`, `p_opt_out_keyword`, `p_quoted_external_id` e a RPC `drain_inbound_message_effects`; a Edge drena em toda entrega, inclusive `duplicate`, e lança erro quando ingest/drain falham para permitir reentrega.
- Prova: `git diff --name-only dia/2026-10-11...HEAD` lista só os 4 arquivos permitidos. `git diff dia/2026-10-11...HEAD | python3 ...` retornou `d4009c410=False` e `faddbd58a=False`, então os commits de correção nova do rollback não entraram.

Ponto 2: corrigir a recusa do CI/espelho sem mentir no DB-INVENTORY
- O que mudei: não mexi em `docs/DB-INVENTORY.md` nem em manifesto/guarda para “fazer passar”; resolvi o empilhamento sobre a branch do dia atual, que já contém a correção do espelho, mantendo o diff limitado aos arquivos do cartão.
- Prova: rodei `zapp-verify full .` no workspace atual depois de aplicar a base e resolver o conflito de empilhamento. Resultado real: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `OK testes`, `OK build`; linha final `VERIFY: VERDE SEM BANCO (1114s)`. A falha do espelho não reapareceu na base do dia atual.

Ponto 3: provar o defeito original e a correção no banco local descartável
- O que mudei: mantive o teste executável `scripts/db-audit/inbound-effects-replay.test.sh`, que sobe Postgres descartável e executa SQL real. Ele tem o bloco A com o comportamento anterior defeituoso e os blocos B/C com a migration aplicada.
- Vermelho/defeito antes, no próprio script: bloco A retornou `[PASS] A.3 (DEFEITO) efeito falha após o ingest`, `[PASS] A.4 (DEFEITO) supressão não saiu e nada a retenta`, `[PASS] A.7 (DEFEITO) resposta nunca atribuída` e `[PASS] A.8 (DEFEITO) sem outbox: nada para o replay retomar`.
- Verde depois: `bash scripts/db-audit/inbound-effects-replay.test.sh` terminou com `[OK] inbound-effects-replay: todos os checks passaram`; no bloco C, `fromMe=true` gravou mensagem, não criou efeito, não preencheu `replied_at`, e mensagem recebida criou/drenou exatamente os efeitos esperados.

Ponto 4: provar o caminho real da Edge Function alterada
- O que mudei: o teste Deno chama `handleIncomingMessage` real, não regex em SQL. Ele força erro no drain, reentrega duplicada, falha de ingest e passagem de citação/palavra/direção para a RPC.
- Prova: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts` terminou com `ok | 4 passed | 0 failed (34ms)`.

## Arquivos no diff

```
scripts/db-audit/inbound-effects-replay.test.sh
supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts
supabase/functions/_shared/evolution-webhook-messages.ts
supabase/migrations/20261005224959_inbound_message_effects_outbox.sql
```

## Verificações executadas

- `bash scripts/db-audit/inbound-effects-replay.test.sh` → `[OK] inbound-effects-replay: todos os checks passaram`.
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts` → `ok | 4 passed | 0 failed (34ms)`.
- `zapp-verify full .` → `VERIFY: VERDE SEM BANCO (1114s)`; passou `db_guard`, `tipos`, `lint`, `migrations`, `testes` e `build`.
- `zapp-verify . --rapido` após o commit → `VERIFY: VERDE SEM BANCO (21s)`; passou `db_guard`, `tipos`, `lint` e `migrations`.
- `git diff --stat dia/2026-10-11...HEAD` → 4 arquivos, diff de 67083 caracteres; abaixo do teto de 90000.
- Varredura de segurança no diff: identificador do banco de produção ausente; tokens `d4009c410` e `faddbd58a` ausentes; sem marcadores de conflito.

## Conferências do juiz barato que não viraram diff novo

- Inventário de `.test.sh`: o juiz pediu registrar `scripts/db-audit/inbound-effects-replay.test.sh` em `.github/workflows/db-guard.yml`, mas o critério deste refazer manda manter exatamente os 4 arquivos da base original. Não alterei workflow para não abrir 5º arquivo fora do escopo; a prova do script foi executada manualmente no workspace e está registrada acima.
- Permissão/RLS: o `REVOKE ALL` para `PUBLIC, anon, authenticated`, o `GRANT` só para `service_role` e a RLS sem policy fazem parte da migration do outbox; a prova com papel real é o próprio `scripts/db-audit/inbound-effects-replay.test.sh`, checks B.33/B.34 (`authenticated`/`anon` não drenam nem inserem) e o `zapp-verify` com `db_guard` verde.
- `updated_at` de `messages`: o UPDATE do `ingest_inbound_message` é da base original pedida pelo cartão; não mudei a semântica da mensagem nem adicionei trigger/DDL fora do escopo. O teste de banco provou que replay sequencial, corrida e duplicate não reabrem outbox nem duplicam atribuição/supressão.

## O que NÃO fiz

- Não alterei `docs/DB-INVENTORY.md`, workflow, manifesto, guarda de CI ou qualquer arquivo fora da lista do cartão.
- Não trouxe os commits de correção nova de rollback citados no cartão; esta entrega é a base original do outbox inbound, empilhada sobre a branch do dia atual.
