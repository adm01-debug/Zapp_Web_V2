# F06 + F15 — Mensageria TalkX/Multiplix: mapa de divergencias edge/hooks

**Plano-sync 2026.** Base: `dia/2026-10-17` @ `d723a90107` x `origin/main` @ `a9b4d6c6fb`
(merge-base `7a15852791`). Leitura pura: nenhum deploy, nenhum push, nenhum envio de mensagem.

**Escopo (recorte do cartao SYNC20-16):** as edges de
`supabase/functions/` com prefixo `evolution-`, `whatsapp-webhook`, `multiplix-`, `talkx-`,
`send-`, `message-`, os modulos de `_shared` que elas importam, e os hooks de mensageria em
`src/hooks/{evolution/,integrations/useTalkX*|useMultiplix*|useEvolution*|useWhatsApp*}`.
Os hooks (lado do navegador) sao do SYNC20-06; aqui aparecem como consumidores e como
divergencia de contrato.

**Dados brutos regeneraveis:** `dados/mensageria_funcoes.csv`, `dados/mensageria_arquivos.csv`,
`dados/mensageria_shared.csv`, `dados/mensageria_deps_ausentes.csv`, `dados/mensageria_hooks.csv`
(gerados por `dados/gerar_mapa_mensageria.py`, que so le `git`).

## 1. Contagens

| Recorte | HEAD | origin/main | divergentes |
|---|---|---|---|
| Funcoes edge (18) | 18 dirs | 18 dirs | 12 com blob diferente, 6 identicas |
| Arquivos de funcao | 59 | 60 | 25 (24 blob-diferente + 1 origin-only, 0 head-only) |
| Modulos `_shared` do recorte | 9 | 10 | 9 (7 blob-diferente + 2 origin-only) |
| Hooks de mensageria | 37 | 42 | 18 (13 blob-diferente + 5 origin-only, 0 head-only) |

Codigo (nao-teste) divergente: 10 arquivos dentro das funcoes + 7 modulos `_shared` = **17**.
Testes divergentes: 14 blob-diferente + 1 origin-only (`evolution-webhook/index.test.ts`).

**Lado vencedor: `origin/main` em 24 de 24** arquivos de funcao com data de HEAD mensuravel
(e em 7 de 7 modulos `_shared`). O ultimo toque na origin e `2026-10-16 15:59:33 -0300`
(merge do lote de 880 cartoes); o toque mais recente do lado do `dia` e `2026-10-14`.
**Nenhum arquivo HEAD-only no recorte** — nao existe artefato local orfao a preservar.

## 2. Mapa por funcao (hash do `index.ts`, verify_jwt, consumidores)

`verify_jwt` lido de `supabase/config.toml`; `(default true)` = nao declarado naquele lado
(default do CLI). Consumidores = arquivos de codigo que citam o nome da funcao
(fora de docs, testes e listas de feature).

| funcao | status | hash HEAD | hash origin | verify_jwt H/O | div. | consumidores |
|---|---|---|---|---|---|---|
| evolution-api | blob diferente | `db7617f7f8` | `d7d7f75840` | default/default | 3 | 24 |
| evolution-sync | igual | `517213e9b9` | `517213e9b9` | default/default | 0 | 6 |
| evolution-webhook | blob diferente | `0ea43640ff` | `9da6d63e01` | false/false | 1 (+1 origin-only) | 18 |
| message-delivery | blob diferente | `dc60a8b7b5` | `dc60a8b7b5` | true/true | 1 (teste) | 4 |
| multiplix-audience | blob diferente | `c9e7168757` | `c9e7168757` | default/default | 1 (teste) | 8 |
| multiplix-dispatch | igual | `5ca2b39baa` | `5ca2b39baa` | default/default | 0 | 4 |
| multiplix-send | blob diferente | `f0a3358381` | `fdb39abe01` | default/default | 2 | 18 |
| multiplix-voices | blob diferente | `e7e2228f09` | `e7e2228f09` | default/default | 1 (teste) | 0 |
| send-email | blob diferente | `5b54e5c37f` | `45b76fc8c9` | default/default | 2 | 3 |
| send-rate-limit-alert | igual | `1e79de2c6d` | `1e79de2c6d` | default/default | 0 | 0 |
| send-scheduled-report | blob diferente | `d2e3889a64` | `c29216abf6` | default/default | 2 | 3 |
| talkx-ai | igual | `928a0bf95d` | `928a0bf95d` | true/true | 0 | 0 |
| talkx-link | blob diferente | `cb39ac6ecb` | `081f057c2c` | false/false | 2 | 6 |
| talkx-report | blob diferente | `fbb5f07f9c` | `ed127694c3` | default/default | 2 | 4 |
| talkx-scheduler | blob diferente | `e1c6bd7eca` | `e9a276eb82` | default/default | 2 | 8 |
| talkx-send | blob diferente | `fb828d2145` | `f2142ca60e` | default/default | 5 | 25 |
| talkx-storage-purge | igual | `ac7e87bfda` | `ac7e87bfda` | default/default | 0 | 0 |
| whatsapp-webhook | igual | `b895135a15` | `b895135a15` | false/false | 0 | 1 |

`verify_jwt` **nao diverge em nenhuma funcao do recorte**: `supabase/config.toml` so difere de
origin em um bloco — `[functions.invite-user] verify_jwt = true`, que existe so na origin e
esta **fora do recorte** (assunto do SYNC20-08). Os dois webhooks ficam `verify_jwt = false`
nos dois lados, de proposito: quem chama e a Evolution, que nao manda JWT.

## 3. Modulos `_shared` do recorte (contrato entre as edges)

| modulo | classe | hash HEAD | hash origin | importado por (HEAD) |
|---|---|---|---|---|
| `_shared/evolution-api-proxy.ts` | blob diferente | `ae337e436a` | `6d1b020517` | evolution-api, message-delivery, multiplix-send, talkx-send/process-recipient |
| `_shared/evolution-control-authz.ts` | blob diferente | `91c31a6a70` | `9ce9d645ea` | evolution-api, webhook-diagnostic |
| `_shared/evolution-types.ts` | blob diferente | `abab8e8ac0` | `c5adf47a74` | (tipos compartilhados) |
| `_shared/evolution-webhook-handlers.ts` | blob diferente | `e87a52316c` | `d2041583d8` | evolution-webhook |
| `_shared/evolution-webhook-messages.ts` | blob diferente | `ff3f9fb274` | `5f775c66f1` | evolution-webhook, classify-sticker, fetch-link-preview, recover-message-media |
| `_shared/talkx-tracking-token.ts` | **origin-only** | — | `d09cddee34` | (nao existe no dia) |
| `_shared/cors-origins.ts` | **origin-only** | — | `f281163b45` | (nao existe no dia; importado pelo `validation.ts` da origin, W6) |
| `_shared/validation.ts` | blob diferente | `6a1d3f7e89` | `b8e38c15d5` | (rate-limit/CORS de todas as edges) |
| `_shared/cron-secret-auth.ts` | blob diferente | `f03ec34cc0` | `7f1e2ba158` | (auth de cron das edges de envio) |
| `_shared/hmac-validation.ts` | **igual** | `df0a7dba80` | `df0a7dba80` | talkx-link (sem divergencia) |

`git log -1 --format=%cs` confirma a origin mais nova em 7 de 7 modulos com lado HEAD
mensuravel (HEAD entre `2026-09-30` e `2026-10-14`; origin `2026-10-16` em todos); os 2
origin-only nao tem lado HEAD.

## 4. Hooks de mensageria

37 arquivos no HEAD x 42 na origin: **0 HEAD-only**, 5 origin-only, 13 blobs diferentes = 18 divergentes.
O resgate dos hooks e do SYNC20-06 (hugo); aqui eles entram como **consumidores do contrato das edges**.

Origem-only (nao existem no `dia`):

- `src/hooks/integrations/useTalkXCampaignSummary.ts` (`1d693d8320`)
- `src/hooks/integrations/useTalkXServerResumePrecheck.ts` (`2041ccdf5d`)
- `src/hooks/integrations/useTalkXTemplatesConversion.ts` (`92a26f7cfd`)
- `src/hooks/evolution/__tests__/useEvolutionApiCore.test.ts` (`13803cdd8f`)
- `src/hooks/evolution/__tests__/useEvolutionApiCore.withToast.test.ts` (`2da62c5e16`)

Blob diferente (HEAD x origin):

| hook | hash HEAD | hash origin |
|---|---|---|
| `evolution/useEvolutionApiCore.ts` | `d69297f848` | `77244ba3c7` |
| `evolution/useEvolutionMessaging.ts` | `fc6c95c32c` | `b34152d506` |
| `evolution/__tests__/useEvolutionMessaging.test.ts` | `bc21929e72` | `311a5e5e88` |
| `integrations/useMultiplixAudience.ts` | `d9e61add8f` | `50cb8337bc` |
| `integrations/useMultiplixDispatches.ts` | `9c79b5a0e6` | `0b7a309d9f` |
| `integrations/useMultiplixReplies.ts` | `845670d502` | `461ce4c670` |
| `integrations/useTalkX.ts` | `8a94bb2167` | `a93eb61f40` |
| `integrations/useTalkXCommandItems.ts` | `a2537e00c1` | `4b9bd37fa0` |
| `integrations/useTalkXResumeChecklist.ts` | `db501f49b9` | `765f1eb11c` |
| `integrations/useTalkXSegments.ts` | `062ef6b2f5` | `9e36260310` |
| `integrations/useTalkXSuppression.ts` | `69c5cad5b8` | `a3f183f1cf` |
| `integrations/useTalkXTemplateStats.ts` | `1dfbc38b3b` | `7bb51a50c1` |
| `integrations/useTalkXTemplates.ts` | `8eac02b673` | `17d9e69957` |

Contrato que muda para a tela: `useTalkXSuppression` (supressao/opt-out) e
`useMultiplixDispatches` (lote/lease) sao os dois hooks cujo resgate precisa vir junto do
resgate da edge correspondente, senao a tela chama payload velho.

## 5. Risco de webhook (o que sobe junto ou nao sobe)

**W1 — os dois webhooks nao sao a mesma coisa.** `whatsapp-webhook` e o inbound da Meta:
o `index.ts` e identico nos dois lados (`b895135a15`) e ele importa so
`_shared/validation.ts` (divergente), `_shared/hmac-validation.ts` (igual) e
`_shared/evolution-helpers.ts` (igual, `344491561373`). Ja `evolution-webhook` e o inbound da
Evolution, e e ele — junto de `classify-sticker`, `fetch-link-preview` e
`recover-message-media` — que consome `_shared/evolution-webhook-messages.ts` e
`_shared/evolution-webhook-handlers.ts`, os dois divergentes. **Corolario:** o lote W muda o
inbound da Evolution e alcanca o inbound da Meta apenas pelo `validation.ts` (rate-limit/CORS);
nenhum dos dois pode ser tratado como "o webhook". E o teste de um nao cobre o outro.

**W2 — o rate-limit do `evolution-webhook` e mais fraco no `dia`.**
Unica divergencia de `evolution-webhook/index.ts` (`3+/4-`): o HEAD chama
`checkRateLimit("evowh:<ip>", 200, 60_000)` (Map em memoria, por isolate, zerado no cold start)
e nao devolve `Retry-After`; a origin chama `enforceRateLimit(...)` (persistente, via
`consume_rate_limit`) e devolve `Retry-After: 60` no 429. Como `verify_jwt = false` nos dois
lados, o rate-limit e a unica defesa de volume do endpoint aberto. O par
(`evolution-webhook/index.ts` + `_shared/validation.ts`, `6a1d3f7e89` x `b8e38c15d5`) sobe junto:
o `Retry-After` e a chamada persistente vem do `index.ts`, e quem as sustenta e o `validation.ts`.

**W3 — troca de contrato de idempotencia do "away message" (`_shared/evolution-webhook-messages.ts`, `46+/463-`).**
A origin tem um bloco inteiro que o `dia` nao tem — chatbot L1 (`CHATBOT_L1_WORKER`,
`chatbotReplyClientMessageId`, `readChatbotL1Flag`, `triggerChatbotL1IfNeeded`) — e o cooldown
de ausencia mudou de base: HEAD usa `awayWindowIndex(windowIndex)` como base do
`client_message_id`; a origin usa `awayDayKey(dayKey)` (`AWAY_MESSAGE_COOLDOWN_HOURS = 12` nos
dois). Arvore misturada (shared novo com edge velha ou vice-versa) faz o away-message
**duplicar ou sumir** — ou seja, mensagem real repetida para cliente real. Estes dois arquivos
(`evolution-webhook-messages.ts` e `evolution-webhook-handlers.ts`) so sobem como par, junto do
`evolution-webhook/index.ts`; e os outros consumidores do shared no `dia` (`classify-sticker`,
`fetch-link-preview`, `recover-message-media`) precisam ser rechecados no mesmo lote.

**W4 — contrato do clique do Talk X (`?r=` x `?t=`) quebra atribuicao se resgatado pela metade.**
A origin introduz `_shared/talkx-tracking-token.ts` (origin-only, `d09cddee34`) com
`encodeTalkxRecipientToken`/`decodeTalkxRecipientToken`, usada pelo `talkx-send` (codifica o
`?r=<token opaco>`) e pelo `talkx-link` (decodifica). O `dia` so conhece `?t=<hmac>` via
`verifyHmacSignature`. `talkx-link` diverge em `7+/68-` e `talkx-send` em `31+/172-`.
Resgatar so uma ponta = clique nao resolve: 401 e **nenhum** clique atribuido (perda de dado,
nao erro visivel). O `deployment-manifest.json` da origin lista o modulo novo
(`talkx-tracking-token.ts`) nas entradas de `talkx-link`/`talkx-send`; quem executar o resgate
precisa cuidar do manifest no mesmo lote (regerar manifest nao e do meu recorte).

**W5 — grafo de imports que trava o lote.** Varredura dos imports relativos dos 18 arquivos do
recorte (lado origin) contra o HEAD: so faltam `_shared/talkx-tracking-token.ts` (W4) e
`_shared/cors-origins.ts` (W6). Nenhuma edge do recorte importa outro arquivo que so exista na
origin. Mas as edges divergentes dependem de `_shared` divergente:
`evolution-api-proxy` <- evolution-api, message-delivery, multiplix-send,
talkx-send/process-recipient; `validation` <- (todas as edges); `cron-secret-auth` <- edges de
envio (o segredo do cron vem por variavel de ambiente, referida por nome). Subir uma edge antes
do `_shared` que ela importa quebra o deploy da funcao.

**W6 — `_shared/validation.ts` nao sobe sozinho (import ausente).** O `validation.ts` da origin
importa `./cors-origins.ts` (linha 29), que **nao existe no dia** (`isAllowedOrigin`/
`FALLBACK_ORIGIN` mudaram de casa; no HEAD as duas vivem dentro do proprio `validation.ts`).
Como o `validation.ts` e importado por praticamente toda edge, resgatar ele sem o
`cors-origins.ts` quebra o import de todas as funcoes (deploy falha). A varredura dos imports
relativos do recorte no lado origin contra o HEAD acha exatamente 3 dependencias ausentes
(`dados/mensageria_deps_ausentes.csv`):

```
supabase/functions/_shared/talkx-tracking-token.ts  <- talkx-link/index.ts, talkx-send/index.ts
supabase/functions/_shared/cors-origins.ts          <- _shared/validation.ts
```

Observacao fora do meu recorte (nao afirmo defeito): no `dia` quem importa `isAllowedOrigin`
**de** `validation.ts` e `approve-password-reset` (edge de auth); a origin moveu a funcao para
`cors-origins.ts`. Conferir no lote de Edge/auth.

## 6. Ordem de resgate proposta (lotes, para quem executar o sync)

1. **Lote S (`_shared`, sem os webhooks):** `_shared/cors-origins.ts` (novo, vem antes —
   dependencia de `validation.ts`, W6) + `evolution-types.ts`, `evolution-api-proxy.ts`,
   `evolution-control-authz.ts`, `validation.ts`, `cron-secret-auth.ts`.
2. **Lote W (webhook, par obrigatorio):** `evolution-webhook-messages.ts` +
   `evolution-webhook-handlers.ts` + `evolution-webhook/index.ts` no mesmo commit. Ver W1/W2/W3.
3. **Lote T (tracking, trio obrigatorio):** `_shared/talkx-tracking-token.ts` (novo) +
   `talkx-send` (index + process-recipient) + `talkx-link`. Ver W4.
4. **Lote M (envio):** `multiplix-send`, `talkx-scheduler`, `talkx-report`, `evolution-api`.
5. **Lote F (fronteira e-mail):** `send-email`, `send-scheduled-report` — ver secao 7.
6. **Testes:** os 14 arquivos de teste divergentes + `evolution-webhook/index.test.ts`
   (origin-only) sobem junto do respectivo lote, nunca antes.

## 7. Fora do recorte (registrado, nao tratado aqui)

- `[functions.invite-user]` no `config.toml` (origin-only) — SYNC20-08.
- `send-email` e `send-scheduled-report`: envio por **e-mail**, nao WhatsApp. Entram na lista
  porque o prefixo `send-` faz parte do recorte pedido, mas o risco de "mensagem real" deles e
  de outro assunto (SMTP/relatorio).
- Hooks de mensageria: resgate e verificacao sao do SYNC20-06 (dono: hugo); aqui so o mapa.
- `_shared` fora dos listados na secao 3 (ex.: `schemas.ts`, `secure-random.ts`,
  `ai-feature-flags.ts`):
  divergem, mas nao sao contrato direto das edges de mensageria — SYNC20-17 (`workeria`) e/ou
  o lote de Edge (SYNC20-08) cobrem.

## 8. Como reproduzir

```
python3 docs/plans/sync/dados/gerar_mapa_mensageria.py
# saida: dados/mensageria_funcoes.csv, mensageria_arquivos.csv,
#        mensageria_shared.csv, mensageria_deps_ausentes.csv,
#        mensageria_hooks.csv (e o resumo no stdout)
```

Leitura pura (`git ls-tree`, `git show`, `git rev-parse`, `git log -1`) contra
`origin/main`; nao ha `fetch`, `checkout` nem escrita fora de `dados/`.

## 9. Limites deste mapa

Este cartao e **mapa**, nao resgate: nada foi copiado da origin, nenhum deploy, nenhum push,
nenhuma migration, nenhuma mensagem disparada (nenhum teste toca Evolution real). A prova de
aceite e o proprio mapa + os CSVs gerados pelo script acima.


