# Dossiê — claude__fix-evolution-rotas-orfas-261112 (PR #3008)

**Propósito** (3 commits, 97de666c9..125b39d39): restaurar no roteador da Edge `evolution-api` as 8 rotas apagadas no #2054 que o front ainda chamava (set-settings, get-settings, get-webhook, set-presence, send-template, mark-unread, invite-info, toggle-ephemeral), criar a guarda `rotas-chamadas-existem.test.ts` (front → roteador lidos do fonte) e a guarda em `scripts/ci/evolution-edge-fixes.unit.mjs`; ajustes em `evolution-control-authz.ts`, `useEvolutionApiCore.ts`, testes e artefatos gerados.

**Veredito: INCORPORADA** (via pacote #3035, squash `cb6576b2a`, e evoluída depois em #3064/#3113/#3135).

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado |
|---|---|---|
| `supabase/functions/evolution-api/index.ts` | CONFLICT, missing 0 | As 9 rotas (8 + find-status-messages) existem na main: `git grep -c "action === '<a>'" origin/main -- supabase/functions/evolution-api/index.ts` devolve ≥1 para cada; `find-status-messages` em `index.ts:1348`. Main tem +462 linhas além da branch (evolução posterior). |
| `supabase/functions/_shared/evolution-control-authz.ts` (+teste) | CONFLICT, missing 0 | Nada da branch falta; main avançou (+103 linhas). |
| `src/hooks/evolution/useEvolutionApiCore.ts` (+teste) | CONFLICT, missing 0 | Idem. |
| `supabase/functions/evolution-api/index.test.ts` | CONFLICT, missing 0 | Idem (main +504). |
| `src/hooks/evolution/__tests__/evolutionRouterGuard.ts`, `useEvolutionMessaging.ts`, `useEvolutionMessaging.test.ts` | IDENTICAL_TO_MAIN | byte a byte. |
| `src/hooks/__tests__/useEvolutionApi.test.ts` | PRESENT_REVERSE_APPLIES | já na main. |
| `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` | CONFLICT, missing 4 | Só diferença: branch tinha `ORFAS_COM_CORRECAO_PENDENTE = new Set(['find-status-messages'])` (exceção temporária até #2999); main (linha 38) tem `new Set<string>([])` porque #2999 já foi integrada e a rota existe (`index.ts:1348`). Main é a forma final; a versão da branch seria regressão. |
| `scripts/ci/evolution-edge-fixes.unit.mjs` | CONFLICT, missing 2 | Teste "rotas ... permanecem explícitas" existe na main (linha 279) com a mesma lista das 8 rotas **mais** `find-status-messages`, `find-chats`, `offer-call`, `create-template`, `find-templates`, `delete-template`, `get-catalog`, `get-collections` (decisão do dono 12/11). Linhas "faltantes" são só o comentário sobre #2999 pendente (obsoleto) e quebra de linha diferente da lista. |
| `ESTADO.md` | CONFLICT, missing 1 | Linha de âncoras `evolution-webhook` gerada automaticamente; main (linha 82) já tem âncoras mais novas (`evolution-go-routes.ts:263`, etc.). Artefato gerado. |
| `docs/audits/edge-functions-authz-coverage.md` | CONFLICT, missing 2 | Branch: 110/161 (68.3%), total 62.6%. Main (linhas 10 e 12): 158/209 (75.6%), total 66.7% — números mais novos que superam os da branch. Artefato gerado. |
| `supabase/deployment-manifest.json` | CONFLICT, missing 46 | Hashes sha256/bytes gerados; main regenerou em #3113, #3135, #3138. Artefato gerado. |

## Lacunas a recuperar
Nenhuma. Tudo com valor funcional está na main; o residual são artefatos gerados (ESTADO.md, manifest, cobertura) e uma exceção temporária de teste que a main já retirou de propósito.

**apagar_branch_seguro: true**

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA. Nada a recuperar. `apagar_branch_seguro` continua true.**

Os 3 achados (21 linhas) vêm todos do 1º commit `97de666c9` e foram removidos pelo 2º,
`2b5c04d41` ("alvo de mark-read/unread só pela key, contratos v2 e guarda mais ampla"),
que **endureceu** o que o 1º havia entregue. A forma final do `2b5c04d41` está na main.

| Achado (97de666c9) | Quem removeu | O que entrou no lugar | Está na main? |
|---|---|---|---|
| `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` (16 ln: `acoesDoRoteador`, `acoesChamadasPeloApp` inline) | `2b5c04d41` | lógica extraída para `__tests__/evolutionRouterGuard.ts` (`acoesDoRoteador`, `acoesChamadas`) e **ampliada**: varre todo `src/` (inclui `hooks/integrations`), lê também `invoke('evolution-api', { body: { action } })`, usos dinâmicos com justificativa (`DINAMICOS_PERMITIDOS`) e ganhou suíte de simulação do #2054 | Sim — `origin/main:src/hooks/evolution/__tests__/evolutionRouterGuard.ts:9,25` e `rotas-chamadas-existem.test.ts:20,52,62,69` (dossiê já marcava o guard como IDENTICAL_TO_MAIN) |
| `supabase/functions/evolution-api/index.ts` (2 ln: `/chat/markMessageAsUnread` com `{ readMessages: [key] }` e `/message/sendTemplate` com `{ number, template }`) | `2b5c04d41` | `/chat/markChatUnread` com `{ chat: key.remoteJid, lastMessage: { key } }` (o endpoint antigo **não existe** na Evolution v2) e `sendTemplate` com `number/name/language/components/webhookUrl` no topo (`templateMessageSchema`), aceitando o formato antigo | Sim — `origin/main:supabase/functions/evolution-api/index.ts:1321` e `:1488-1494` |
| `supabase/functions/evolution-api/index.test.ts` (3 ln: asserts dos contratos antigos) | `2b5c04d41` | asserts dos contratos v2 | Sim — `origin/main:...index.test.ts:1110` e `:1227` |

Pontos checados contra o padrão de alerta (commit que promete correção e remove proteção):
- `mark-read`: o 1º commit mandava `{ readMessages: body.readMessages || [body.key] }`; o 2º
  fechou para `{ readMessages: [body.key] }` (sem `readMessages` livre). É **aperto**, não reversão.
- gate de alvo: o 2º commit acrescentou `KEY_TARGET_ACTIONS` para `mark-read`/`mark-unread`
  resolverem o alvo só por `key.remoteJid` (antes um `number` visível passava com a `key` de
  outra conversa). Presente na main: `index.ts:172,175`.
- guarda de órfãs: não foi enfraquecida — ficou mais ampla e com simulação provando que apagar
  `find-chats`/`offer-call`/`get-catalog` do roteador faz o teste falhar.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. `apagar_branch_seguro = true`.** Tentei refutar e não achei
um único hunk de valor ≥ médio fora da `main`.

Refiz o line-check por conta própria (não reaproveitei o `line_check` do JSON): para cada arquivo,
`git diff cfa8959b9 origin/claude/fix-evolution-rotas-orfas-261112 -- <arquivo> | grep '^+'` e
`grep -F` de cada linha (trim) contra `git show origin/main:<arquivo>`:

| Arquivo | linhas add | faltando na main |
|---|---|---|
| `supabase/functions/evolution-api/index.ts` | 103 | 0 |
| `supabase/functions/evolution-api/index.test.ts` | 350 | 0 |
| `supabase/functions/_shared/evolution-control-authz.ts` | 11 | 0 |
| `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` | 4 | 0 |
| `src/hooks/evolution/useEvolutionApiCore.ts` | 16 | 0 |
| `src/hooks/evolution/__tests__/useEvolutionApiCore.test.ts` | 27 | 0 |
| `src/hooks/evolution/useEvolutionMessaging.ts` (+teste) | 3 / 11 | 0 / 0 |
| `src/hooks/__tests__/useEvolutionApi.test.ts` | 3 | 0 |

Ou seja: todo o código funcional (roteador, authz, hook, suítes) está na `main` linha a linha,
incluindo o aperto do 2º commit — `KEY_TARGET_ACTIONS` em `origin/main:supabase/functions/evolution-api/index.ts:172,175`.

As 9 rotas existem como tratador explícito na `main`, não só em comentário:
`set-settings`/`get-settings` em `index.ts:1147`, `mark-unread` em `:1318`,
`find-status-messages` em `:1348`, `toggle-ephemeral` em `:1396`; contagem de `'<acao>'` ≥1 para
todas as 8 + `find-status-messages`.

Os 5 arquivos com "lacuna" examinados um a um — nenhum é perda:
- `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` (4 ln): as 4 são o comentário e
  `ORFAS_COM_CORRECAO_PENDENTE = new Set(['find-status-messages'])`. `origin/main:...:38` tem
  `new Set<string>([])` com o comentário "Vazia: find-status-messages foi restaurada no #2999" e a
  rota de fato existe (`index.ts:1348`). Trazer a linha da branch **reintroduziria** a exceção e
  cegaria a guarda: é regressão, não resgate.
- `scripts/ci/evolution-edge-fixes.unit.mjs` (2 ln): só o comentário "#2999 pendente" (obsoleto) e
  quebra de linha diferente. O teste existe em `origin/main:...:279-296` com as 8 rotas +
  `find-status-messages` + 7 da decisão do dono 12/11 — superset da branch.
- `ESTADO.md` (1 ln): âncoras geradas. Branch aponta `evolution-api/index.ts:511,577,738`;
  `origin/main:ESTADO.md:82` já tem `evolution-go-routes.ts:263`, `index.ts:635,764` — mais novas.
  A linha da branch é stale.
- `docs/audits/edge-functions-authz-coverage.md` (2 ln): branch 110/161 (68.3%) e total 62.6%;
  `origin/main` linhas 10 e 12 trazem 158/209 (75.6%) e total 294/441 (66.7%) — medição posterior
  e maior.
- `supabase/deployment-manifest.json` (46 ln): hashes/bytes gerados; `main` regenerou em
  `41853318c` (#3113), `2cf0153ae` (#3135) e `dac285f62` (#3138). Hash antigo não tem valor.

Também confirmei o lado das remoções: os 4 trechos que a branch apagou de `index.ts` não voltaram
na `main` (`removed_still_in_main = 0` reproduzido), logo o endurecimento não foi revertido.
