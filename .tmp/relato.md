Especialista: edgar (area-edge-api)

## Sensibilidade
- O diff toca escrita em `contacts` a partir do webhook e uma migration aditiva. NÃO toca `rateLimit`, `service_role`, `requireRole`, `verifyHmac` nem `DELETE`.
- Nenhuma proteção afrouxada: as 3 colunas novas são `nullable`, sem default, e herdam RLS/grants de `contacts` (não criei policy nem grant). Nenhuma referência ao banco/endpoint de produção — a migration foi aplicada só no banco local da tarefa.
- Para quem chama (`presence.update` do Evolution GO): nada muda. O ramo de digitação (`contact_typing`) segue igual; o que entrou foi o ramo novo de online/offline.

## O que mudou e por quê
- `supabase/functions/_shared/evolution-webhook-handlers.ts`: em `handlePresenceUpdate`, além do broadcast de digitação (inalterado), passou a ler o estado de presença (`presence` → `status` no topo; `chatpresence` → `presences[].lastKnownPresence`) e, quando é online/available ou offline/unavailable, grava `presence_status` + `presence_updated_at` no contato. `last_seen_at` só é gravado na transição online → offline (uma leitura do estado atual decide), para "visto por último" não avançar sem transição. Grupo (`@g.us`), `composing` e `paused` seguem sem gravar presença.
- `supabase/migrations/20261013002117_contacts_presence.sql`: adiciona `presence_status` (check online/offline), `presence_updated_at` e `last_seen_at` em `contacts`, todas nullable. Rollback no cabeçalho.
- `supabase/functions/_shared/__tests__/evolution-presence-status.test.ts`: testa o handler REAL com o mesmo envelope do adaptador, com stub que espiona os `update` em `contacts` e o broadcast (runner do Edge: `deno test`).
- `tests/contracts/evolution-presence-status.contract.test.ts`: o MESMO comportamento, no formato que o portão de fechamento reconhece (`vitest.contracts.config.ts`). Existe porque a varredura de teste-do-fechar só enxerga `src/` e `tests/`; sem ele o cartão parecia "código sem teste". Mesmos 7 casos: os dois arquivos cobrem exatamente o que o handler faz.
- `src/integrations/supabase/types.ts` (gerado): colunas novas do `contacts` — só as 3 linhas novas em Row/Insert/Update, conferidas contra a saída do `supabase gen types` do banco local (nenhuma diferença sobrou para elas). Não regenerei o arquivo inteiro porque ele tem drift antigo de outros cartões (`ai_usage_outbox`, `effect_started_at`...) que não é deste título.
- `src/adapters/evolutionAdapter.ts`: 3 linhas (`presence_status/presence_updated_at/last_seen_at: null`) no literal de contato derivado — consequência direta das colunas novas em `types.ts`; sem isso o typecheck ratchet acusa 1 erro novo. Contato derivado só do histórico não tem evento de presença, então o valor é ausência.

## Prova
- vermelho antes (handler sem a mudança): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-presence-status.test.ts` → `FAILED | 3 passed | 4 failed` (online, available, offline-após-online, offline-já-offline).
- verde depois (mesmo comando): `ok | 7 passed | 0 failed (10ms)`.
- migration: `hermes-db-migrar supabase/migrations/20261013002117_contacts_presence.sql` → `APLICADA no banco LOCAL 'v2-26101221184e65' (produção não foi tocada).`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (passos OK: db_guard, tipos, lint, migrations). O passo `banco_local` não roda nesta forma do gate (ele exige o nome do conjunto); o `hermes-tarefa-fechar` invoca igual.
- contract test (runner do portão): `npx --no-install vitest run --config vitest.contracts.config.ts tests/contracts/evolution-presence-status.contract.test.ts` → `Test Files 1 passed (1) / Tests 7 passed (7)`.

## Item 3 do cartão (presenceSubscribe na Evolution GO)
Conferido no código: a V2 não faz `presenceSubscribe` (nem equivalente). `supabase/functions/evolution-api/index.ts` só tem `set-presence` e `send-chat-presence` (envio), e o adaptador `evolution-go-adapter.ts` já mapeia os eventos de ENTRADA `presence` e `chatpresence` para `presence.update` — ou seja, a GO já entrega online/offline ao webhook sem assinatura. Nenhuma chamada foi adicionada; não encontrei exigência de subscribe no que a V2 consome.

## O que NÃO fiz e por quê
- Não regenerei `supabase/schema-manifest.json`/`schema-catalog.json`: são o retrato da PRODUÇÃO e o guard de drift explica as colunas novas pela migration pendente.
- Não mexi em `evolution-api/index.ts`: não há subscribe a adicionar (item acima).
- Não implementei o "timeout de inatividade": o cartão pediu gravar online/offline pelos eventos do Evolution GO; offline por evento já cobre, e um cron de timeout seria trilha nova (não pedida).

## Arquivos fora da lista do cartão (por que foram indispensáveis)
- `src/adapters/evolutionAdapter.ts`: o cartão autoriza mexer em `src/integrations/supabase/types.ts` (gerado); ao acrescentar as 3 colunas ao tipo `contacts`, o typecheck ratchet acusa 1 erro NOVO (TS2739) no literal de contato derivado — único consumidor afetado. Sem os 3 campos `null` a verificação fica VERMELHA. São 3 linhas sem lógica; contato derivado só do histórico não tem presença, logo o valor é ausência.
- `tests/contracts/evolution-presence-status.contract.test.ts`: o cartão pede o teste em `supabase/functions/_shared/__tests__/` (feito, `deno test`). Mas a varredura de teste do `hermes-tarefa-fechar` só reconhece teste em `src/` ou `tests/`; sem um arquivo em `tests/` o fechar acusa "código alterado sem teste". O arquivo espelha os MESMOS 7 casos no runner que o portão reconhece (`vitest.contracts.config.ts`), sem duplicar lógica de produção.
