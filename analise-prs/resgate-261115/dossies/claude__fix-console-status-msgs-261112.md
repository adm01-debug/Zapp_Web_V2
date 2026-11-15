# Dossiê — claude__fix-console-status-msgs-261112 (PR #2999)

**Ref:** `origin/claude/fix-console-status-msgs-261112` · tip `c06fadc2a` · merge-base `cfa8959b9` · 11 commits (inclui merges das branches irmãs `fix-evolution-rotas-orfas-261112` e `feat-evolution-rotas-pendentes-261112`).

## Propósito
Restaurar a rota `find-status-messages` na edge `evolution-api`, degradar o Status/Stories no cliente (`useWhatsAppStatus`) para não gerar 404 no console a cada abertura do contato, e (via merges irmãos) restaurar 8 rotas apagadas no #2054, offer-call, templates da Meta, catálogo e seletor de conexão.

Fechamento alegado: incorporada no pacote #3035 (squash `cb6576b2a`). **Verificado:** `git log --oneline origin/main --grep=3035` → `cb6576b2a Pacote: 20 PRs aprovadas integradas num único merge (#3035)`.

## Arquivo × achado × evidência

| Arquivo | Pré-classificação | Achado | Evidência |
|---|---|---|---|
| 29 arquivos `IDENTICAL_TO_MAIN` / `PRESENT_REVERSE_APPLIES` / `missing_in_main=0` | presente | Incorporados byte a byte ou com todas as linhas adicionadas presentes na main | JSON do item (`hunk: PRESENT_BYTE`, `missing_in_main: 0`) |
| `src/hooks/integrations/useWhatsAppStatus.ts` | CONFLICT, `removed_still_in_main=2` | **Incorporado.** Toda a lógica da branch está na main: `statusIndisponivelPorInstancia` (L137), `__resetStatusIndisponivelParaTestes` (L140), `STATUS_HTTP_PERMANENTES` (L144), `statusIndisponivelDefinitivo` (L146), `consultarStatus` (L246-249), marcação em L260/L264. As 2 linhas "removidas ainda na main" (`method: 'POST'` / `body: {...}`) são as mesmas linhas reindentadas dentro do ternário — falso positivo. A main ainda foi além: removeu o `send-chat-presence 'paused'` de propósito (comentário na main L242-245) e trocou `.maybeSingle()` por `withoutTestFixtureConnections` (P0-1). | `git grep -n statusIndisponivel origin/main -- src/hooks/integrations/useWhatsAppStatus.ts`; `git diff origin/claude/fix-console-status-msgs-261112 origin/main -- <arquivo>` mostra só adições da main |
| `src/hooks/connections/useConnectionOptions.ts` | BOTH_CHANGED, `missing_in_main=4` | **Incorporado e evoluído.** Main tem o mesmo hook com parâmetro extra `{ onlyConnected }` (queryKey ganhou sufixo `'connected'|'all'`, `let query = ...` em vez de `const { data, error } = await supabase`). As 4 linhas "faltando" são as reescritas pela assinatura nova. Hook em uso por 6 arquivos na main (`OfferCallButton`, `MetaTemplatesDialog`, `SendTemplateDialog`, `ConnectionSelect`, `evolutionUi`, `WhatsAppCatalogSection`). | `git show origin/main:src/hooks/connections/useConnectionOptions.ts`; `git log --oneline origin/main -- <arquivo>` → `cb6576b2a` (#3035) |
| `docs/audits/edge-functions-authz-coverage.md` | CONFLICT, `missing_in_main=2` | **Obsoleto.** Branch escrevia `evolution-control-authz.ts 119/170 70.0%`, total `255/402 63.4%`. Main tem números posteriores e maiores: `158/209 75.6%`, total `294/441 66.7%` (mais testes entraram). Régua N217 (≥50%) atendida. | `git show origin/main:docs/audits/edge-functions-authz-coverage.md` L7-14 |
| `ESTADO.md` | CONFLICT, `missing_in_main=1` | **Obsoleto.** Branch atualizava âncoras `evolution-api/index.ts:511/577/738`; main já tem âncoras regeneradas para o arquivo atual (`:635`, `:764`). Linha gerada por automação (`scripts/ci/docs-estado-registry-convention.unit.mjs`). | `git grep -n -F 'evolution-webhook\` | A' origin/main -- ESTADO.md` → L82 |
| `supabase/deployment-manifest.json` | CONFLICT, `missing_in_main=48` | **Obsoleto / ruído.** Artefato gerado (hashes `sha256`/`bytes` por função) regenerado pelo pipeline; main tem versão mais nova (último toque `dac285f62` #3138). Portar hashes antigos seria regressão. | `git log --oneline -3 origin/main -- supabase/deployment-manifest.json` |

Edge: rota `find-status-messages` presente na main — `supabase/functions/evolution-api/index.ts:1348-1349` e `_shared/evolution-control-authz.ts:90`.

## Veredito
**INCORPORADA** (confiança alta). Lacunas residuais são só docs/artefatos gerados já superados na main. Sem migration, sem workflow, sem custo externo, sem contradição de regra.

## Lacunas a recuperar
Nenhuma.

`apagar_branch_seguro = true`.

## Reexame de commits intermediários

**Veredito: REFATORACAO_INTERNA.** Os 6 achados mecânicos (27 linhas) são linhas que commits
intermediários da própria branch adicionaram e commits posteriores da mesma branch **substituíram por
versão corrigida/mais restritiva**. A intenção de cada uma sobrevive na `origin/main`, em forma melhor.
Nada a recuperar. `apagar_branch_seguro = true` confirmado.

Ordem dos commits (`git log --oneline --no-merges cfa8959b9..origin/claude/fix-console-status-msgs-261112`):
`8b146e285` → `97de666c9` → `a80ba8171` → `2b5c04d41` → `bef1623ea` → `125b39d39` → `d7a90d1c2` → `d124f5554` → merges.

### Achado por achado

| Achado | Adicionado em | Removido por | O que o removedor pôs no lugar | Está na main? |
|---|---|---|---|---|
| `/chat/markMessageAsUnread/${instance}` com `{ readMessages: [body.key] }` (`index.ts`) | `97de666c9` | `2b5c04d41` | `/chat/markChatUnread/${instance}` com `{ chat: key.remoteJid, lastMessage: { key } }` — a rota `markMessageAsUnread` **não existe** na Evolution v2 (`MarkChatUnreadDto`); mais `KEY_TARGET_ACTIONS` fechando o gate de `mark-read`/`mark-unread` só pela `key.remoteJid` | Sim: `origin/main:supabase/functions/evolution-api/index.ts:1321` (rota), `:172`/`:175` (`KEY_TARGET_ACTIONS`), `:1312` (`mark-read` sem `readMessages` livre) |
| `/message/sendTemplate/${instance}` com `{ number, template }` (`index.ts`) | `97de666c9` | `2b5c04d41` | corpo com campos no topo (`number`, `name`, `language`, `components`, `webhookUrl` opcional) conforme `templateMessageSchema` da v2, aceitando o formato antigo por compatibilidade | Sim: `origin/main:…/index.ts:1483-1494` |
| `/call/offerCall/${instance}` com `isVideo ?? false`, `callDuration ?? 5` (`index.ts`) | `a80ba8171` | `bef1623ea` + `d7a90d1c2` | `/call/offer/${instance}` (caminho certo da v2, `OfferCallDto`), `isVideo === true`, e o schema apertado de 60 s para 15 s (`offerCallSchema`) | Sim: `origin/main:…/index.ts:1514`; limite em `origin/main:supabase/functions/_shared/schemas.ts:831` (`max(15)`) |
| `/template/${create\|delete}` repassando `body` cru (`index.ts`) | `a80ba8171` | `d7a90d1c2` | `templateBody` sem `action`/`instanceName`/`instance` (campos do roteador não vazam para o provedor) | Sim: `origin/main:…/index.ts:1503-1504` |
| 17 linhas: `acoesDoRoteador` / `acoesChamadasPeloApp()` inline no teste (`rotas-chamadas-existem.test.ts`) | `97de666c9` | `2b5c04d41` | extraídas para o módulo `src/hooks/evolution/__tests__/evolutionRouterGuard.ts` e a guarda ficou **mais ampla**: varre todo `src/` (inclui `hooks/integrations`), cobre `invoke('evolution-api', { body: { action } })` e usos dinâmicos com `DINAMICOS_PERMITIDOS`, com simulação provando que apagar `find-chats`/`offer-call`/`get-catalog` faz a guarda falhar | Sim: `origin/main:src/hooks/evolution/__tests__/evolutionRouterGuard.ts:9,25` e `rotas-chamadas-existem.test.ts:20,41,52,69-71,92-116` |
| `"mark-unread", "invite-info", "toggle-ephemeral",` (`scripts/ci/evolution-edge-fixes.unit.mjs`) | `97de666c9` | `d124f5554` | mesma linha com `"find-status-messages"` acrescentado — **superconjunto** | Sim: `origin/main:scripts/ci/evolution-edge-fixes.unit.mjs:286` |
| 5 asserts de teste (`index.test.ts`: `markMessageAsUnread`, `{ readMessages: [key] }`, `{ number, template }`, `fake.calls[1].body.name`, `/call/offerCall/PRINCIPAL`) | `97de666c9`, `a80ba8171` | `2b5c04d41`, `bef1623ea`, `d7a90d1c2` | asserts do contrato novo, mais rígidos: `/chat/markChatUnread/PRINCIPAL` (`:1110`), corpo completo do template (`:1227`), `/call/offer/PRINCIPAL` (`:1421`, `:1470`), `callDuration` 0/16/61/3.5/"10" → 422 sem I/O (`:1446-1452`), e o teste de "carona" com JID de outra conversa em `readMessages` (`:1105`, `:1329`) | Sim, todos em `origin/main:supabase/functions/evolution-api/index.test.ts` |

### Por que não é reversão
O padrão de alerta (commit com título de segurança que **remove** validação) não se aplica: `2b5c04d41`,
`bef1623ea` e `d7a90d1c2` removeram linhas e, no mesmo hunk, puseram versão **mais** restritiva —
alvo do gate só pela `key`, `readMessages` livre eliminado, `isVideo === true` em vez de `?? false`,
`callDuration` de 60 s para 15 s, campos do roteador deixando de vazar ao provedor. Nenhuma guarda,
validação ou teste do commit intermediário ficou sem equivalente na `origin/main`.

## Verificação adversarial

**Concordo com a triagem: INCORPORADA, `apagar_branch_seguro = true`.** Tentei refutar e não achei um
único hunk de valor fora da `main` (`origin/main` em `dac285f62`).

### Método (independente do JSON do item)
Varri os **34** arquivos de `git diff cfa8959b9 origin/claude/fix-console-status-msgs-261112`, extraí
toda linha adicionada (normalizada por indentação, sem linhas vazias) e comparei com o conteúdo de
`git show origin/main:<arquivo>`. Resultado: **31 dos 34 com MISSING=0** (1.167 linhas adicionadas,
todas presentes na main). Só 3 arquivos acusaram lacuna — e os três são metadado gerado em que a main
está **mais nova**:

| Arquivo | Lacuna | Prova de que não é perda |
|---|---|---|
| `ESTADO.md` | 1 linha | Tabela **gerada** e recalculada pela guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` (`ESTADO.md:11-13`). Diferença é só a âncora: branch `index.ts:511/577/738`, main `:635/764` (`origin/main:ESTADO.md:82`). |
| `docs/audits/edge-functions-authz-coverage.md` | 2 linhas | Branch: `evolution-control-authz 119/170 70.0%`, total `255/402 63.4%`. Main **maior**: `158/209 75.6%` e total `294/441 66.7%` (`origin/main:docs/audits/edge-functions-authz-coverage.md:10,12`). Números da branch são obsoletos. |
| `supabase/deployment-manifest.json` | 48 linhas (`sha256`/`bytes`) | Artefato gerado dos hashes das fontes. Main tem hash posterior do mesmo arquivo: `source_sha256 97177988d0…` para `evolution-api` (branch: `b830e65364…`). |

E `src/hooks/connections/useConnectionOptions.ts` (4 linhas no JSON do item): a main é **superconjunto
estrito** — mesmo hook com o parâmetro extra `{ onlyConnected }` e `queryKey` por variante
(`origin/main:src/hooks/connections/useConnectionOptions.ts:7-21`). As 4 "linhas faltantes" são as
mesmas linhas com assinatura/`queryKey` ampliados. Nada a resgatar; regredir seria perda.

### O miolo do item (o fix do console) está na main
- Cliente: `origin/main:src/hooks/integrations/useWhatsAppStatus.ts` — `statusIndisponivelPorInstancia`
  `:137`, `__resetStatusIndisponivelParaTestes` `:140`, `STATUS_HTTP_PERMANENTES` `:144`,
  `statusIndisponivelDefinitivo` `:146`, `consultarStatus` `:246-249`, gravação do set `:260`/`:264`.
  O `removed_still_in_main=2` do JSON é falso positivo: `method: 'POST'` e `body: {…}` só foram
  reindentados para dentro do ternário.
- Edge: `origin/main:supabase/functions/evolution-api/index.ts:1348-1349` (`find-status-messages`,
  `goHistoryNotSupported` no GO).
- Autorização: `origin/main:supabase/functions/_shared/evolution-control-authz.ts:90`.
- As 18 ações restauradas pelos merges irmãos, **todas** na main: `set-settings`/`get-settings` `:1147`,
  `get-webhook` `:1195`, `mark-unread` `:1318`, `find-chats` `:1338`, `invite-info` `:1392`,
  `create-template`/`find-templates`/`delete-template` `:1499`, `get-catalog`/`get-collections` `:1506`,
  `offer-call` `:1512`, `set-presence`/`toggle-ephemeral` no authz `:66`/`:78`, `send-template` `:134`,
  `invite-info` `:182`. Schema do `offer-call`: `origin/main:supabase/functions/_shared/schemas.ts:831-832`
  (`callDuration` 1–15 s, `isVideo`).
- Testes: `supabase/functions/evolution-api/index.test.ts` (212 linhas adicionadas, MISSING=0),
  `src/hooks/__tests__/useWhatsAppStatus.test.ts` (32, MISSING=0),
  `src/hooks/evolution/__tests__/useEvolutionApiCore.test.ts` (20, MISSING=0).

### Checagem extra: a âncora do `ESTADO.md` que a main perdeu NÃO veio desta branch
A branch e o **merge-base** têm 3 ocorrências de `evolution-webhook` em `evolution-api/index.ts`; a main
tem 2. Quem consolidou foi a própria main, depois: `git log -S"subscribe: ['ALL'], immediate: true"
origin/main -- supabase/functions/evolution-api/index.ts` → `098a648f6 fix(evolution-api): connect da go
nunca mais devolve 500 … (#3045)`. Como a branch não tocou essas linhas (todas as suas 125 adições em
`index.ts` estão na main), não há nada da branch perdido aí.

### Prova do merge
`cb6576b2a Pacote: 20 PRs aprovadas integradas num único merge (#3035)`, `Fri Nov 13 13:27:15 2026`,
`git merge-base --is-ancestor cb6576b2a origin/main` → **SIM**.
