# Dossiê — claude__feat-evolution-rotas-pendentes-261112 (PR #3020)

**Ref:** `origin/claude/feat-evolution-rotas-pendentes-261112` · tip `d7a90d1c2` · merge-base `cfa8959b9` · 7 commits à frente.

## Propósito
Restaurar na Edge `evolution-api` as rotas `find-chats`, `offer-call`, `create/find/delete-template`, `get-catalog`, `get-collections` (apagadas no #2054), com telas (OfferCallButton, MetaTemplatesDialog, DeviceChatsPanel, WhatsAppCatalogSection), hook `useConnectionOptions`, guarda de contrato front→Edge (`rotas-chamadas-existem.test.ts`) e testes da Edge.

## Veredito: **INCORPORADA** (confiança alta)
Integrada pelo pacote #3035 (squash `cb6576b2a` em `origin/main`, confirmado por `git log origin/main | grep '#3035'`; `git show --stat cb6576b2a` lista OfferCallButton.tsx, MetaTemplatesDialog.tsx, DeviceChatsPanel.tsx, useConnectionOptions.ts, rotas-chamadas-existem.test.ts, evolution-api/index.ts). 26 dos 32 arquivos são PRESENT_BYTE / sem linha faltante. Os 6 com "lacuna" mecânica são todos versões anteriores de conteúdo que a main já tem em forma mais nova:

| Arquivo | Achado | Evidência |
|---|---|---|
| `ESTADO.md` | Âncoras de linha geradas; main tem âncoras mais recentes (`evolution-go-routes.ts:263` vs `:221` na branch) | `git grep -n 'evolution-webhook. \| A' origin/main -- ESTADO.md` → linha 82 |
| `docs/audits/edge-functions-authz-coverage.md` | Números de cobertura; main já está acima (158/209 = 75,6%, total 66,7% vs 117/168 = 69,6% / 63,2% da branch) | `git show origin/main:docs/audits/edge-functions-authz-coverage.md` linhas 10 e 12 |
| `scripts/ci/evolution-edge-fixes.unit.mjs` | Teste "rotas … permanecem explícitas" existe na main com lista **maior** (inclui `find-status-messages`); as 2 linhas "faltantes" são o comentário "entra aqui quando o PR #2999…" (obsoleto, #2999 já integrado) e a linha de lista que ganhou o item novo | `origin/main:scripts/ci/evolution-edge-fixes.unit.mjs:279-296` |
| `src/hooks/connections/useConnectionOptions.ts` | Main tem superconjunto: mesmo hook + opção `onlyConnected` (filtra `status = 'connected'`) | `git diff <branch> origin/main -- src/hooks/connections/useConnectionOptions.ts` só adiciona `onlyConnected` |
| `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` | Idêntico exceto `ORFAS_COM_CORRECAO_PENDENTE`: branch `['find-status-messages']`, main `[]` porque a rota foi restaurada | `origin/main:supabase/functions/evolution-api/index.ts:1348` tem `action === 'find-status-messages'`; `origin/main:…/rotas-chamadas-existem.test.ts:38` |
| `supabase/deployment-manifest.json` | Artefato gerado (`scripts/edge-deploy/generate-manifest.mjs`); só sha256/bytes; main regerada com 179 arquivos-fonte vs 176 da branch | `git diff MB..branch -- supabase/deployment-manifest.json \| grep -v 'sha256\|bytes'` → vazio além de cabeçalhos |

Sem migration, sem workflow, sem segredo. Nenhuma lacuna a recuperar.

## Lacunas a recuperar
Nenhuma.

## Branch pode ser apagada
Sim — todo conteúdo útil está em `origin/main` em versão igual ou mais nova.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** As 25 linhas significativas apontadas pela varredura mecânica (2 achados em `97de666c9`, 1 em `a80ba8171`, mais os pares de teste) são **versões anteriores** das mesmas rotas, substituídas na própria branch por versões **mais restritivas e corretas**, e essas versões finais **estão em `origin/main`**. Nada a recuperar. Apagar a branch continua seguro.

Commits da branch (`cfa8959b9..d7a90d1c2`):
```
d7a90d1c2 fix(evolution): offer-call limitado a 15 s e templates sem campos do roteador
125b39d39 docs(estado): atualizar âncoras de evolution-webhook em evolution-api/index.ts
2b5c04d41 fix(evolution): alvo de mark-read/unread só pela key, contratos v2 e guarda mais ampla
a80ba8171 feat(evolution): restaurar e completar find-chats, offer-call, templates da meta e catálogo
97de666c9 fix(evolution): restaurar 8 rotas apagadas no #2054 e travar ações órfãs
```
(`bef1623ea` também toca `index.ts`/`index.test.ts`; é commit intermediário na mesma linha do `d7a90d1c2`.)

### Achado 1 — `mark-unread`: `/chat/markMessageAsUnread` → `/chat/markChatUnread` (`index.ts`, 2 linhas)
- Adicionado por `97de666c9`: `proxy('/chat/markMessageAsUnread/${instance}', 'POST', { readMessages: [body.key] })`.
- Removido por `2b5c04d41`, que no mesmo hunk troca por `proxy('/chat/markChatUnread/${instance}', 'POST', { chat: key.remoteJid, lastMessage: { key } })` — `MarkChatUnreadDto` da Evolution v2; o endpoint antigo **não existe na v2** (comentário no próprio diff).
- Sobrevive na main: `origin/main:supabase/functions/evolution-api/index.ts:1321` (`markChatUnread`) e `:1315-1316` (comentário). Teste correspondente: `origin/main:supabase/functions/evolution-api/index.test.ts:1110`.
- O mesmo commit **endurece** `mark-read`: tira o `body.readMessages ||` (que aceitava lista livre de JIDs) e passa a resolver o alvo do gate só por `key.remoteJid` via `KEY_TARGET_ACTIONS` — presente na main em `index.ts:172-175` e `:1312`. Ou seja, o commit posterior **não** desfez proteção: ampliou-a.

### Achado 2 — `send-template`: corpo aninhado → campos no topo (`index.ts`, 1 linha + 1 asserção)
- Adicionado por `97de666c9`: `proxy('/message/sendTemplate/...', 'POST', { number, template })`.
- Removido por `2b5c04d41`: passa a enviar `number, name, language, components, webhookUrl?` no topo (`templateMessageSchema` da v2), aceitando o formato antigo por compatibilidade.
- Sobrevive na main: `origin/main:…/index.ts:1488` e asserção `origin/main:…/index.test.ts:1227` (`{ number, name: "boas_vindas", language: "pt_BR", components: [] }`).

### Achado 3 — `offer-call`: `/call/offerCall` → `/call/offer`, duração 60 s → 15 s (`index.ts`, 1 linha + 1 asserção)
- Adicionado por `a80ba8171`: `proxy('/call/offerCall/${instance}', 'POST', { number, isVideo: body.isVideo ?? false, callDuration: body.callDuration })`.
- Removido/substituído por `bef1623ea` + `d7a90d1c2`: rota real `/call/offer` (`OfferCallDto`), `isVideo: body.isVideo === true` (mais estrito) e teto de `callDuration` reduzido de 60 para **15 s** no schema, conforme `offerCallSchema` da v2.
- Sobrevive na main: `origin/main:…/index.ts:1510-1514`; teto em `origin/main:supabase/functions/_shared/schemas.ts:831` (`.max(15, …)`); testes de 422 para `0, 16, 61, 3.5, "10"` em `origin/main:…/index.test.ts:1446-1471`.

### Achado 4 — `create/delete-template` deixam de repassar campos do roteador (`index.ts`, 1 linha)
- `a80ba8171` repassava `body` inteiro ao provedor; `d7a90d1c2` remove `action`/`instanceName`/`instance` antes do proxy. Versão final na main: `origin/main:…/index.ts:1507-1509`; asserção `origin/main:…/index.test.ts:1386` (`{ name: "boas_vindas" }`).

### Achado 5 — guarda de rotas órfãs (`src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts`, 16 linhas)
- `97de666c9` definiu `acoesDoRoteador` e `acoesChamadasPeloApp()` dentro do próprio teste.
- `2b5c04d41` extraiu as duas para `src/hooks/evolution/__tests__/evolutionRouterGuard.ts` (`acoesDoRoteador`, `acoesChamadas`) e **ampliou** a cobertura: além de `'evolution-api/<ação>'` e `callApi/withToast`, passa a varrer `invoke('evolution-api', { body: { action } })` e usos dinâmicos `` `evolution-api/${…}` `` (com `DINAMICOS_PERMITIDOS` justificado), em todo `src/` e não só em `hooks/evolution/`; acrescenta 5 testes de simulação que provam que apagar `find-chats`/`offer-call`/`get-catalog` do roteador faz a guarda falhar.
- Sobrevive na main: `git ls-tree origin/main src/hooks/evolution/__tests__/` lista `evolutionRouterGuard.ts` (blob `a428754dd`) e `rotas-chamadas-existem.test.ts` (blob `f662b2fe8`); `git diff 97de666c9 origin/main -- …/rotas-chamadas-existem.test.ts` mostra só a extração + os testes novos. A única diferença de regra é `ORFAS_COM_CORRECAO_PENDENTE` vazio na main (a `find-status-messages` foi restaurada), o que torna a guarda **mais** rígida, não menos.

### Conclusão
Nenhum commit posterior desfez proteção, correção ou funcionalidade entregue pelos anteriores. Em todos os 5 achados o removedor substituiu a implementação por outra equivalente ou mais restritiva, e a versão final está em `origin/main`. Veredito da triagem (**INCORPORADA**) mantido; branch pode ser apagada.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA procurando qualquer hunk de valor ≥ médio de
`git diff cfa8959b9 origin/claude/feat-evolution-rotas-pendentes-261112` que não esteja em
`origin/main` (HEAD `dac285f62`). **Não encontrei nenhum.** Os 6 arquivos com `missing_in_main > 0`
são todos artefato gerado ou versão *anterior* de um conteúdo que a main tem em forma mais nova —
em 2 casos aplicar a branch seria regressão de proteção de CI.

Entrega funcional (o que a branch existia para fazer) — presente na main, ponta a ponta:

1. **Rotas na Edge**: as 16 ações adicionadas pela branch em `supabase/functions/evolution-api/index.ts`
   existem na main (`create-template`, `delete-template`, `find-chats`, `find-templates`, `get-catalog`,
   `get-collections`, `get-settings`, `get-webhook`, `invite-info`, `mark-read`, `mark-unread`,
   `offer-call`, `send-template`, `set-presence`, `set-settings`, `toggle-ephemeral`) — contagem de
   `action === '<x>'` em `git show origin/main:supabase/functions/evolution-api/index.ts` ≥ 1 para todas,
   mais `find-status-messages`, que a branch não tinha. `offer-call` em
   `origin/main:supabase/functions/evolution-api/index.ts:1512-1515`; templates e catálogo em
   `:1499-1509`, incluindo o descarte de `action/instanceName/instance` antes do provedor (`:1503`) —
   que era justamente o conteúdo do último commit da branch (`d7a90d1c2`).
2. **Limite de 15 s do `offer-call`** (commit `d7a90d1c2`): `origin/main:supabase/functions/_shared/schemas.ts:831`
   tem `callDuration: z.number().int().min(1,…).max(15, 'callDuration máximo: 15 s (offerCallSchema da Evolution v2)')`
   — byte a byte igual à branch (`:819`).
3. **UI ligada de verdade** (`git grep … origin/main -- src`): `NewCallPanel.tsx:13,240` → `OfferCallButton`;
   `WhatsAppTemplatesManager.tsx:20,66` → `MetaTemplatesDialog`; `ContactSidebarSections.tsx:12,66` →
   `WhatsAppCatalogSection`; `EvolutionMonitoringDashboard.tsx:25,358` → `DeviceChatsPanel`.
4. **Hook `useConnectionOptions`**: a main é **superconjunto** —
   `origin/main:src/hooks/connections/useConnectionOptions.ts:10` acrescenta o parâmetro
   `{ onlyConnected }` e a `queryKey` derivada; já consumido por
   `origin/main:src/components/catalog/SendTemplateDialog.tsx:43`. As 4 linhas "faltantes" do
   `line_check` são a assinatura e a `queryKey` **antigas**.

As duas "lacunas" que seriam regressão se aplicadas:

- `scripts/ci/evolution-edge-fixes.unit.mjs`: a lista da main inclui `"find-status-messages"` e já
  apagou o comentário "entra aqui quando o PR #2999 … for integrado". `git diff branch origin/main`
  nesse arquivo é +1 item na lista / −1 comentário obsoleto → a guarda da main cobre **mais** rotas.
- `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts`: na main
  `ORFAS_COM_CORRECAO_PENDENTE = new Set<string>([])`; na branch contém `'find-status-messages'`.
  Conjunto vazio = **nenhuma** órfã tolerada → teste mais rígido.

Artefatos gerados (sem valor de negócio):
- `supabase/deployment-manifest.json`: `git diff cfa8959b9 branch -- …manifest.json` filtrado de
  `sha256|bytes|generated_at` é **vazio** (só hashes); 92 `source_sha256` na main e na branch.
- `ESTADO.md`: tabela de âncoras gerada; a main tem as linhas atuais
  (`evolution-go-routes.ts:263` vs `:221` na branch, `evolution-api/index.ts:635/764` vs `:511/577/738`).
- `docs/audits/edge-functions-authz-coverage.md`: main `evolution-control-authz.ts` 158/209 = **75,6%**
  e total 294/441 = **66,7%**, contra 117/168 = 69,6% e 63,2% da branch → números da branch são os velhos.

Testes — conferi se a main perdeu algum caso da branch: `git diff branch origin/main --stat` em
`supabase/functions/evolution-api/index.test.ts` (+368/−0), `useEvolutionApiCore.test.ts` (+66/−0) e
`rotasPendentesUi.test.tsx` (idêntico). Em `evolution-control-authz.test.ts` (+57/−6) as 6 linhas
removidas foram reescritas, não perdidas: a main divide o caso em
`:34` (pareamento/logout) e `:44` (`delete-message`/`update-message`/`edit-message`/`delete-for-everyone`
viram `'message'`, P1-GO-5), mantém `find-contacts/find-messages` (agora com `find-status-messages`,
`:142`) e mantém a matriz exaustiva (`:176,196-197`), com 4 conjuntos em vez de 3.
`src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts`: a main acrescenta
`syncInstanceToken` e troca `it.fails(...)` por `it(...)` no caso do 403 em pt-BR — a branch é a
versão mais fraca.

O tip `d7a90d1c2` não é ancestral de `origin/main` (squash `cb6576b2a`, "Pacote: 20 PRs aprovadas
integradas num único merge (#3035)"), então a segurança de apagar não vem da topologia e sim da
comparação de conteúdo acima.

**Parecer: concordo com INCORPORADA.** Nenhuma lacuna ≥ média. Branch segura para apagar.
