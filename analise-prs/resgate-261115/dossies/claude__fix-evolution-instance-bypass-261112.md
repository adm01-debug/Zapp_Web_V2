# Dossiê — claude__fix-evolution-instance-bypass-261112 (PR #3024)

**Ref:** `origin/claude/fix-evolution-instance-bypass-261112` · tip `7379d8fcd` · merge-base `7bdbe2e3f` · 15 commits (inclui merges de `fix-console-status-msgs`, `feat-evolution-rotas-pendentes`, `fix-evolution-rotas-orfas`).

## Propósito
Edge `evolution-api`: validar a instância realmente usada (schema `evolutionApiRequiresInstance`), codificar `groupJid`/`number` nas rotas GET, não vazar a mensagem crua da exceção ao cliente (`internalErrorResponse`), restaurar rotas apagadas (find-status-messages, offer-call, templates Meta, catálogo, find-chats), degradar Status/Stories no cliente (`useWhatsAppStatus`), hook `useConnectionOptions` e UI de rotas pendentes. Fechada com alegação de incorporação pelo pacote #3035 (squash `cb6576b2a`, ancestral de `origin/main` — verificado com `git merge-base --is-ancestor`).

## Veredito: **INCORPORADA** (confiança alta) · apagar branch: **seguro**

28 de 34 arquivos: `PRESENT_BYTE`/`PRESENT_REVERSE_APPLIES` (prova mecânica). Os 6 com "lacuna" mecânica:

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/connections/useConnectionOptions.ts` (novo) | Incorporado e evoluído: main tem o mesmo hook com parâmetro extra `onlyConnected` | `git show origin/main:src/hooks/connections/useConnectionOptions.ts` — `export function useConnectionOptions(enabled = true, { onlyConnected = false } ...)`, queryKey `['whatsapp-connection-options', ...]`, mesma query em `whatsapp_connections` |
| `src/hooks/integrations/useWhatsAppStatus.ts` | Incorporado byte a byte na lógica; "removed_still_in_main" são as linhas `method: 'POST'`/`body: {...}` que a branch só reindentou dentro do ternário — main tem exatamente o ternário | `origin/main:src/hooks/integrations/useWhatsAppStatus.ts:137` (`statusIndisponivelPorInstancia`), `:144` (`STATUS_HTTP_PERMANENTES`), `:246-252` (`consultarStatus ? invoke('evolution-api/find-status-messages', { method: 'POST', body: {...} }) : Promise.resolve(...)`), `:258-264` |
| `supabase/functions/evolution-api/index.ts` | Incorporado: catch final usa `internalErrorResponse(error, req)`; a linha `status: 500, headers` que "sobrou" na main é outro bloco (auditoria de `send-status`, não o catch). Rotas `find-status-messages` e `offer-call` presentes | `origin/main:...index.ts:3` (import `internalErrorResponse`), `:1530-1533` (catch), `:1302-1306` (bloco send-status), `:1348` (`find-status-messages`), `:1512` (`offer-call`); 19 ocorrências dos conceitos da branch (`goActionNotSupported`, `evolutionApiRequiresInstance`, `resolveSendTarget`, encode de groupJid). Linhas da branch ausentes na main = trechos do fluxo `connect` que a main refatorou depois (#3045 etc.), não trabalho da branch |
| `ESTADO.md` | Obsoleto: a branch só atualizava âncoras de linha (`index.ts:529/595/756`); main tem âncoras regeneradas para o código atual (`index.ts:635/764`) | `origin/main:ESTADO.md:82`; `git grep -n evolution-webhook origin/main -- supabase/functions/evolution-api/index.ts` → 635, 764 |
| `docs/audits/edge-functions-authz-coverage.md` | Obsoleto: números de cobertura da branch (119/170, 70,0%) superados pela medição da main (158/209, 75,6%; total 66,7%) | `git show origin/main:docs/audits/edge-functions-authz-coverage.md` linhas 10, 12 |
| `supabase/deployment-manifest.json` | Artefato gerado (hashes/bytes); main tem versão mais recente | `git log origin/main -- supabase/deployment-manifest.json` → `dac285f62` (#3138), posterior ao pacote #3035 |

## Lacunas a recuperar
Nenhuma. Nada de valor fora da main.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** Os 33 linhas significativas apontadas pela varredura são, nos 7 achados, a
própria branch corrigindo contrato ou extraindo helper em commit seguinte — e a versão **final** está na main.
Apagar a branch continua seguro. Nada a recuperar.

Commits (`git log --oneline --no-merges 7bdbe2e3f..origin/claude/fix-evolution-instance-bypass-261112`):
`8b146e285` → `97de666c9` → `a80ba8171` → `2b5c04d41` → `72a22317d` → `125b39d39` → `5479948cc` → `d7a90d1c2`.

| Achado | Removedor | Intenção sobrevive? | Evidência |
|---|---|---|---|
| `72a22317d` · `index.ts` · 6 linhas (validação+encode de `groupJid` em `group-invite-code`, import de `GROUP_JID_PATTERN`) | `5479948cc` "validar e codificar groupJid/number nas demais rotas com query" | **Sim, ampliada** — a validação inline virou helper `queryParamOrNull`/`invalidQueryParam` e passou a cobrir `group-info`, `group-participants` e `fetch-profile-picture` | `git show 5479948cc -- supabase/functions/evolution-api/index.ts`; main: `origin/main:supabase/functions/evolution-api/index.ts:308,310,1375-1376,1384-1385,1415-1416`, import em `:31` |
| `97de666c9` · `index.ts` · 2 linhas (`/chat/markMessageAsUnread` com `{readMessages:[key]}`; `/message/sendTemplate` com `{number, template}`) | `2b5c04d41` "alvo de mark-read/unread só pela key, contratos v2" | **Sim, corrigida** — `/chat/markMessageAsUnread` **não existe na v2**; virou `/chat/markChatUnread` com `MarkChatUnreadDto`. `send-template` passou a mandar `name/language/components` no topo (`templateMessageSchema`), aceitando o formato antigo | `origin/main:...index.ts:1318-1321` (`markChatUnread`), `:1482-1495` (`sendTemplate` com campos no topo) |
| `a80ba8171` · `index.ts` · 2 linhas (`/call/offerCall` sem limite de duração; `/template/create|delete` com o corpo inteiro) | `bef1623ea`/`d7a90d1c2` "offer-call limitado a 15 s e templates sem campos do roteador" | **Sim, endurecida** — rota correta `/call/offer`, `callDuration` validado 1–15 s, e `action`/`instanceName`/`instance` removidos do corpo enviado ao provedor | `origin/main:...index.ts:1499-1504` (destructuring que tira os campos do roteador), `:1512-1515` (`/call/offer`, `callDuration ?? 5`) |
| `97de666c9` · `index.test.ts` · 3 linhas e `a80ba8171` · `index.test.ts` · 2 linhas (asserts dos paths/bodies antigos) | mesmos commits acima | **Sim** — os asserts acompanharam a correção, não desapareceram | `origin/main:supabase/functions/evolution-api/index.test.ts:1110` (`markChatUnread`), `:1227` (`sendTemplate` campos no topo), `:1375-1386` (`/template/create` e `/delete`), `:1421` e `:1470` (`/call/offer`, incl. teste de `callDuration=15`) |
| `97de666c9` · `rotas-chamadas-existem.test.ts` · 17 linhas (`acoesDoRoteador`, `acoesChamadasPeloApp`, `matchAll`) | `2b5c04d41` (+78 / −27) | **Sim** — helpers extraídos para `./evolutionRouterGuard`, compartilhados com o guard de CI; a guarda ficou mais ampla (varre `callApi`/`withToast`, `invoke('evolution-api', …)` e usos dinâmicos) | blob final idêntico na main e na ponta: `git ls-tree origin/main -- src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` = `f662b2fe8…` = mesmo blob da ponta; `origin/main:…:20,52,92` |
| `97de666c9` · `scripts/ci/evolution-edge-fixes.unit.mjs` · 1 linha (`"mark-unread", "invite-info", "toggle-ephemeral",`) | `d124f5554` (merge que acrescentou `find-status-messages` na mesma linha) | **Sim** — a linha existe na main com as três ações **mais** `find-status-messages` | `origin/main:scripts/ci/evolution-edge-fixes.unit.mjs:286` |

Nenhum commit desta branch remove proteção, validação, teste ou funcionalidade que não exista na main —
o padrão da PR #2879 (último commit desfazendo a validação dos anteriores) **não** se repete aqui.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Apagar a branch é seguro. Tentei refutar e não achei um único hunk de valor fora da `main`.

Provas levantadas por mim (independentes do JSON da triagem):

1. **Varredura própria de TODAS as linhas adicionadas** (`git diff 7bdbe2e3f origin/claude/fix-evolution-instance-bypass-261112` → cada linha `+` com ≥8 chars conferida com `grep -F` contra `git show origin/main:<arquivo>`), nos 33 arquivos (todos menos o manifest gerado): **só 3 arquivos com ausência**, e nenhum de código ativo:
   - `src/hooks/connections/useConnectionOptions.ts` — 4/16: a `main` tem o mesmo hook **evoluído** (`useConnectionOptions(enabled = true, { onlyConnected = false })`, queryKey `['whatsapp-connection-options', onlyConnected ? 'connected' : 'all']`, mesma query em `whatsapp_connections`). Superconjunto, não lacuna.
   - `ESTADO.md` — 1/1: só âncoras de linha; `origin/main:ESTADO.md:82` traz `evolution-api/index.ts:635/764` (regeneradas para o código atual) contra `529/595/756` da branch. Obsoleto.
   - `docs/audits/edge-functions-authz-coverage.md` — 2/2: a `main` mede `evolution-control-authz.ts` **158/209 (75,6%)** e total **294/441 (66,7%)**, acima dos **119/170 (70,0%)** / **255/402 (63,4%)** da branch. Obsoleto.
   - Os outros 30 arquivos: `tot=5..577`, `miss=0`. Inclui `supabase/functions/evolution-api/index.ts` (157 linhas, 0 faltando) e `index.test.ts` (577 linhas, 0 faltando).
2. **Fix de segurança central presente na main**: `origin/main:supabase/functions/evolution-api/index.ts:169-177` tem o comentário e o `KEY_TARGET_ACTIONS = new Set(['mark-read','mark-unread'])` com o `resolveSendTarget` endurecido idêntico à branch. Os 3 "removidos ainda na main" que apareceram na minha varredura reversa são **falsos positivos de substring** (`const resolveSendTarget = (): string =>` casa como prefixo de `... => {` na linha 173; as linhas de `jidToDigits` casam dentro do novo corpo em `:177`).
3. **Catch final não vaza erro**: `origin/main:...index.ts:3` importa e `:1533` usa `internalErrorResponse(error, req)`. A linha `status: 500, headers: {...}` que "sobrou" é `:1305`, dentro do bloco de auditoria de `send-status` (`'send-status: falha ao registrar a auditoria'`) — outro caminho, não o catch. Triagem correta.
4. **Rotas/validações restauradas, conferidas na main**: `find-status-messages`, `offer-call`, `find-chats`, `evolutionApiRequiresInstance`, `GROUP_JID_PATTERN`, `queryParamOrNull`, `resolveSendTarget`, `markChatUnread` — todas com ocorrências em `origin/main` (`index.ts` e/ou `_shared/schemas.ts`).
5. **`useWhatsAppStatus` byte a byte**: `origin/main:src/hooks/integrations/useWhatsAppStatus.ts:126-149` traz o comentário, `statusIndisponivelPorInstancia`, `__resetStatusIndisponivelParaTestes`, `STATUS_HTTP_PERMANENTES` e `statusIndisponivelDefinitivo` idênticos; `:246-265` traz o ternário `consultarStatus ? invoke(...) : Promise.resolve({ data: [], error: null })` e os dois ramos do `if`. Os 2 `removed_still_in_main` são as linhas `method: 'POST'` / `body: {...}` que a branch só reindentou dentro do ternário — a `main` as mantém porque mantém o ternário. A `main` ainda vai além (tirou o `send-chat-presence` 'paused' automático).
6. **Todos os 34 arquivos do diff existem em `origin/main`** (`git cat-file -e origin/main:<path>` para cada um) — nenhum arquivo novo da branch ficou de fora.
7. **Manifest**: comparando `origin/main` × ponta em `supabase/deployment-manifest.json`, as únicas diferenças de estrutura são 3 `path` que **só a main tem** (`_shared/copilot-tick.ts`, `_shared/evolution-go-token-sync.ts`, `_shared/instance_pause.ts`) + `bytes`/`sha256`/`source_file_count`. Nenhuma entrada presente na branch e ausente na main. Artefato gerado, main mais nova (`dac285f62`, #3138).
8. **Ancestralidade**: `git merge-base --is-ancestor cb6576b2a origin/main` → verdadeiro; `cb6576b2a3a0d3f8b5b091878314cf5087fa10b1` "Pacote: 20 PRs aprovadas integradas num único merge (#3035)", 2026-11-13.

Lacunas adicionais encontradas: **nenhuma**.
