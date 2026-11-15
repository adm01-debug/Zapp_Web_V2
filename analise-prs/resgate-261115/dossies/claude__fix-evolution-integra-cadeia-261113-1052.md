# Dossiê — claude/fix-evolution-integra-cadeia-261113-1052 (PR #3030)

**Veredito: INCORPORADA** (confiança alta) · apagar branch: **seguro**

## Propósito
Branch integradora (16 commits, MB `7c3ef80de` → tip `1c341407a`) da cadeia Evolution #3008 → #3020 → #2999 → #3024:
restaura rotas da `evolution-api` apagadas no #2054 (find-status-messages, find-chats, offer-call, templates da Meta,
catálogo), valida/codifica `groupJid`/`number`, não vaza erro interno no catch global, degrada Status/Stories no cliente
(`useWhatsAppStatus`) e cria `useConnectionOptions`. Fechada como coberta pelo pacote #3035 (squash `cb6576b2a`).

## Arquivo × achado × evidência
| Arquivo | Pré-classificação | Achado | Evidência |
|---|---|---|---|
| 28 arquivos `IDENTICAL_TO_MAIN` / `PRESENT_REVERSE_APPLIES` | presente | Já na main byte a byte / patch reverso aplica | JSON do item |
| `src/hooks/connections/useConnectionOptions.ts` | 4 linhas "faltando" | Arquivo entrou na main em `cb6576b2a` (#3035) e foi **evoluído**: mesma função, mesmo `queryKey` base, mesma query; ganhou opção `onlyConnected`. As 4 linhas "faltantes" são só o texto antigo (docstring de 1 linha, assinatura sem opção, queryKey sem sufixo, `const { data, error } = await supabase` → `await query`) | `git show origin/main:src/hooks/connections/useConnectionOptions.ts` linhas 6-10, 12, 16-21 |
| `src/hooks/integrations/useWhatsAppStatus.ts` | 2 linhas removidas ainda na main | As linhas `method: 'POST'` / `body: { instanceName..., page: 1, offset: 200 }` existem na main **dentro do ternário `consultarStatus ? invoke(...) : Promise.resolve`** exatamente como a branch escreveu; `statusIndisponivelPorInstancia`, `STATUS_HTTP_PERMANENTES`, `statusIndisponivelDefinitivo`, `__resetStatusIndisponivelParaTestes` todos presentes | `origin/main:src/hooks/integrations/useWhatsAppStatus.ts:140,144,146,246-253,258-264` |
| `supabase/functions/evolution-api/index.ts` | 1 linha removida ainda na main | O catch global da main já usa `internalErrorResponse(error, req)` (o que a branch fez). A linha `status: 500, headers: {...corsHeaders...}` que sobrou é de **outro contexto** (auditoria do `send-status`, linha 1305), não do catch | `origin/main:supabase/functions/evolution-api/index.ts:1529-1534` (catch) e `:1304-1306` (send-status) |
| `ESTADO.md` | 1 linha | Linha de âncoras geradas (`evolution-webhook`); main tem âncoras mais novas (`evolution-api/index.ts:635`, `:764`) porque o código andou. A versão da branch (529/595/756) está obsoleta | `origin/main:ESTADO.md:82`; último commit `41853318c` 2026-11-14 |
| `docs/audits/edge-functions-authz-coverage.md` | 2 linhas | Números de cobertura medidos; main já tem medição mais recente (evolution-control-authz 158/209 = 75,6%, total 66,7%) que **supera** a da branch (119/170) | `origin/main:docs/audits/edge-functions-authz-coverage.md:10,12` |
| `supabase/deployment-manifest.json` | 48 linhas | Artefato derivado (sha256/bytes das edges), regenerado pelo `deploy-functions.yml`; main tem hash mais novo para `evolution-api` (`97177988…` vs `07ca52c7…` da branch) porque a função mudou depois (#3045 etc.) | `.github/workflows/deploy-functions.yml:253,457,466,567`; manifest main linha 1942 |

Linhas que a branch tem e a main não (239) são, fora os itens acima, **código que a main substituiu depois** do merge
do #3035 (ex.: fluxo `connect` da GO reescrito no #3045 `098a648f6`; `send-chat-presence` retirado do
`useWhatsAppStatus`), não trabalho da branch perdido: `line_check.missing_in_main = 0` em todos os arquivos de código
`CONFLICT` (`index.ts`, `index.test.ts`, `useEvolutionApiCore.ts`, `NewCallPanel.tsx`, `WhatsAppTemplatesManager.tsx`,
`useWhatsAppStatus.test.ts`, `useEvolutionApiCore.test.ts`).

## Lacunas a recuperar
Nenhuma. Nada a portar.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** · apagar a branch continua **seguro**. Nenhum dos 33 achados é reversão: em
todos os 7 casos um commit posterior da própria branch **corrigiu ou extraiu** o que o anterior havia escrito, e o
estado final está na `origin/main`.

Sequência (`git log --oneline --no-merges 7c3ef80de..origin/claude/fix-evolution-integra-cadeia-261113-1052`):
`8b146e285` → `97de666c9` → `a80ba8171` → `2b5c04d41` → `72a22317d` → `125b39d39` → `5479948cc` → `d7a90d1c2`.
Nenhum título promete segurança e remove guarda; os removedores são `2b5c04d41` (contratos v2), `5479948cc`
(valida/codifica query) e `d7a90d1c2` (limites do offer-call) — todos **ampliam** o que removeram.

| # | Achado (commit · arquivo) | Removedor | Destino da intenção | Classificação |
|---|---|---|---|---|
| 1 | `97de666c9` · `scripts/ci/evolution-edge-fixes.unit.mjs` (1 linha: `"mark-unread", "invite-info", "toggle-ephemeral",`) | `a80ba8171` só **acrescentou** itens à mesma lista; a linha foi reescrita depois como `… "toggle-ephemeral", "find-status-messages",` | `origin/main:scripts/ci/evolution-edge-fixes.unit.mjs:279-296` — bloco **byte a byte igual** à ponta, com as 16 ações | REFATORACAO_INTERNA (falso positivo de linha) |
| 2 | `97de666c9` · `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` (17 linhas: `acoesDoRoteador`, `acoesChamadasPeloApp`) | `2b5c04d41` **extraiu** as funções para `src/hooks/evolution/__tests__/evolutionRouterGuard.ts` e ampliou a varredura (4 formas: caminho, callApi/withToast em todo `src/`, corpo `action:`, dinâmico justificado) + simulação que prova a guarda pegando o #2054 | `origin/main:src/hooks/evolution/__tests__/evolutionRouterGuard.ts:9-11,30-39` + o teste; `git diff` ponta↔main nos dois arquivos = **vazio** | REFATORACAO_INTERNA (extração, guarda mais forte) |
| 3-4 | `97de666c9` · `index.ts`/`index.test.ts` (`/chat/markMessageAsUnread` com `{readMessages:[key]}`) | `2b5c04d41`: *"/chat/markMessageAsUnread não existe na v2"* → `POST /chat/markChatUnread` com `{chat, lastMessage:{key}}` (MarkChatUnreadDto) | `origin/main:supabase/functions/evolution-api/index.ts:1315-1321`; teste em `index.test.ts:1109-1110` | REFATORACAO_INTERNA (endpoint errado corrigido — manter o antigo daria 404 na Evolution v2) |
| 3-4 | `97de666c9` · `index.ts`/`index.test.ts` (`/message/sendTemplate` com envelope `{number, template}`) | `2b5c04d41`: campos no topo do corpo (`templateMessageSchema`), formato antigo ainda aceito | `origin/main:index.ts:1481-1488`; `index.test.ts:1225-1229` | REFATORACAO_INTERNA |
| 5 | `a80ba8171` · `index.ts`/`index.test.ts` (`/template/create|delete`, `fake.calls[1].body.name`) | `d7a90d1c2` (templates sem campos do roteador) | `origin/main:index.ts:1499-1504`; `index.test.ts:1364-1386` — mesma linha ternária, agora com `find-templates` | REFATORACAO_INTERNA |
| 5 | `a80ba8171` · `index.ts`/`index.test.ts` (`/call/offerCall`, `isVideo ?? false`) | `d7a90d1c2`: rota real da v2 é `/call/offer` e `offerCallSchema` limita `callDuration` a 15 s | `origin/main:index.ts:1510-1514`; `index.test.ts:1421,1445,1462-1470` | REFATORACAO_INTERNA (corrige rota inexistente + aplica limite do provedor) |
| 6 | `72a22317d` · `index.ts` (6 linhas: validação inline de `groupJid` com `GROUP_JID_PATTERN` em `group-invite-code`) | `5479948cc` **extraiu** para os helpers `queryParamOrNull(value, pattern)` + `invalidQueryParam(path, message)` e aplicou também a `group-info`, `group-participants` e `number` | `origin/main:index.ts:308-311` (helpers), `:1375-1376`, `:1384-1386`, `:1415` — mesmo `GROUP_JID_PATTERN`, mesma mensagem, mesmo `encodeURIComponent` | REFATORACAO_INTERNA (validação preservada e **ampliada**) |

Nada a recuperar. `a_recuperar` vazio.

## Verificação adversarial

**Concordo com INCORPORADA** · apagar a branch: **seguro** · main de referência `dac285f62`.

Tentei refutar procurando qualquer hunk de valor da branch ausente na `main`. Não achei nenhum.

Checagem independente (não reusei o `line_check` do JSON): para cada um dos 34 arquivos do
`git diff 7c3ef80de..origin/claude/fix-evolution-integra-cadeia-261113-1052`, extraí as linhas `+`
(as que a branch introduziu) e testei cada uma, por conteúdo, contra `git show origin/main:<arquivo>`.

| Arquivo | Linhas adicionadas pela branch ausentes na main |
|---|---|
| `supabase/functions/evolution-api/index.ts` (159 add) | **0** |
| `supabase/functions/evolution-api/index.test.ts` (614 add) | **0** |
| `supabase/functions/_shared/schemas.ts` | **0** |
| `supabase/functions/_shared/evolution-control-authz.ts` (+ teste) | **0** |
| `src/hooks/integrations/useWhatsAppStatus.ts` (+ teste) | **0** |
| `src/hooks/evolution/useEvolutionApiCore.ts` (+ teste) | **0** |
| `src/components/calls/NewCallPanel.tsx`, `WhatsAppTemplatesManager.tsx` | **0** |
| `src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts` | **0** |
| 17 arquivos `IDENTICAL_TO_MAIN` | 0 (byte a byte) |
| `src/hooks/connections/useConnectionOptions.ts` | 4 — só o texto **antigo**, ver abaixo |

Provas adicionais que fechei eu mesmo:

1. **`useConnectionOptions.ts` não é lacuna, é superconjunto.** `origin/main:src/hooks/connections/useConnectionOptions.ts:6-25`
   tem a mesma função exportada, mesmo `staleTime`, mesma query (`whatsapp_connections` → `id, name, instance_id`,
   `order('name')`), e **mais**: segundo parâmetro `{ onlyConnected }`, `queryKey` com sufixo e `query.eq('status','connected')`.
   As 4 linhas "faltantes" são a assinatura/queryKey/docstring de 1 linha que a main substituiu. Portar a versão da branch
   seria regressão.
2. **Nenhuma ação nem rota da Evolution se perdeu.** Comparei o conjunto de `case '<ação>'` e de endpoints
   `/(chat|message|call|template|group|instance|catalog)/X` entre ponta e main: `comm -23` = vazio nos dois.
   Conferido um a um: `find-status-messages`, `find-chats`, `offer-call`, `find-templates`, `create-template`,
   `delete-template`, `group-invite-code`, `group-info`, `group-participants`, `internalErrorResponse`,
   `GROUP_JID_PATTERN`, `queryParamOrNull`, `invalidQueryParam` — contagem idêntica em main e na ponta.
3. **Os 2 nomes de teste do `useWhatsAppStatus.test.ts` e 1 do `evolution-control-authz.test.ts` que não existem
   mais na main já existiam no merge-base** (`7c3ef80de:src/hooks/__tests__/useWhatsAppStatus.test.ts:86,194`;
   `7c3ef80de:…/evolution-control-authz.test.ts:31`) — não são trabalho desta branch; foram reescritos pelos
   pacotes #3063 (`d084ca753`) e #3064 (`ab657aa34`) depois do merge. Não contam contra esta branch.
4. **`ESTADO.md` e `docs/audits/edge-functions-authz-coverage.md`: a main está melhor, não pior.**
   As 13 linhas divergentes do ESTADO.md são só âncoras `arquivo:linha` geradas (a main aponta linhas mais novas);
   a auditoria da main marca `evolution-control-authz.ts` 158/209 = 75,6% e total 294/441 = 66,7%, contra 119/170 e
   63,4% da branch. `supabase/deployment-manifest.json` é derivado (sha256/bytes das edges).
5. **O pacote que absorveu a PR está na main:** `git merge-base --is-ancestor cb6576b2a origin/main` = verdadeiro
   (`cb6576b2a` "Pacote: 20 PRs aprovadas integradas num único merge (#3035)"). A ponta `1c341407a` não é ancestral
   da main, o que é o esperado para PR fechada por squash de pacote — e não prova perda, já que o conteúdo linha a
   linha está lá.

Sem lacunas adicionais. Nada a portar.
