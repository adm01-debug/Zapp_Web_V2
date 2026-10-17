# SYNC20-01 — Causa-raiz do `CI/CD Pipeline` vermelho na main (run `38986918764`)

Autor: worker (geral) · Data: 2026-10-17 · Cartão: SYNC20-01
Escopo: **só diagnóstico** (medido no log real do run). Nenhum código de produto, CI ou doc foi alterado
por este cartão — a correção vai como proposta (§5), para os donos de cada área.

Este documento **corrige a linha CI/CD da auditoria F16** do `docs/audits/sync-ag5-qualidade-2026-10-17.md`
(commit `f36023c5ed`, §F16, tabela "main vermelha (a9b4d6c)").

---

## 1. Fato medido (fonte: API do GitHub, não relato)

```
$ gh run view 38986918764 --repo adm01-debug/Zapp_Web_V2 --json headSha,event,conclusion,createdAt,displayTitle
{"conclusion":"failure","createdAt":"2026-10-17T00:33:28Z",
 "displayTitle":"docs(rls): search_events INSERT-only por design — decisão arquitetura…",
 "event":"push","headSha":"a9b4d6c6fb35625e8a4794895f733ce696201b28"}
```

- `headSha = a9b4d6c6fb` = **tip de `origin/main`** (`git log -1 origin/main` → `a9b4d6c6fb`), isto é, a
  run vermelha é da **main de produção**, não de uma branch de trabalho.
- 5 jobs vermelhos, disparo por `push`, conclusão `failure`:

| Job | Passo que falhou | Resultado |
|---|---|---|
| 🧪 Unit Tests (1/3) | Run Vitest shard 1/3 | 64 arquivos / 170 testes falhos |
| 🧪 Unit Tests (2/3) | Run Vitest shard 2/3 | 59 arquivos / 192 testes falhos |
| 🧪 Unit Tests (3/3) | Run Vitest shard 3/3 | 58 arquivos / 148 testes falhos |
| 🔎 TypeCheck | Run TypeScript debt ratchet | 50 erros TS novos em 26 arquivos |
| 🧩 Node CI Scripts | Run Node CI scripts tests | 41 contratos falhos |

---

## 2. Causa-raiz por job (com trecho de log literal)

### 2.1 Unit Tests 1/3, 2/3, 3/3 — teste (dominante) + produto (uma veia real)

Números de fechamento de cada shard (log literal, cores removidas):

```
 Test Files  64 failed | 540 passed (604)
      Tests  170 failed | 4789 passed | 7 expected fail | 5 todo (4971)

 Test Files  59 failed | 543 passed | 2 skipped (604)
      Tests  192 failed | 4905 passed | 7 expected fail | 9 todo (5113)

 Test Files  58 failed | 543 passed | 3 skipped (604)
      Tests  148 failed | 4956 passed | 7 expected fail | 29 todo (5140)
```

São **181 arquivos distintos** e **510 testes** verdes→vermelhos — não os ~28 citados na F16 (§4).

Topo das causas (`FAIL <arquivo> > <teste>` → primeira linha de erro). As contagens do log **não** são
publicáveis linha a linha (o reporter repete cada bloco); listeio por ordem de frequência com casos
literais, sem número fabricado:

1. **Mock/harness desatualizado (classe teste, maior bloco):**
   - `Error: [vitest] No "createLogger" export is defined on the "@/lib/logger" mock` e
     `No "getLogger" export ...` — a lib ganhou `createLogger`/`getLogger` (`src/lib/logger.ts:89,100`).
   - `Error: No QueryClient set, use QueryClientProvider to set one`
   - `Error: useAuth must be used within an AuthProvider`
   - `Error: [vitest] No "useReducedMotion" export is defined on the "framer-motion" mock`
   - `Error: [vitest] No "AUDIT_PAGE_SIZE" export is defined on the "../useAdminData" mock`
   - `TypeError: supabase.from(...).select(...).order is not a function`,
     `channel.unsubscribe is not a function`, `supabase.channel is not a function`,
     `client.channel is not a function` — mocks do cliente supabase sem o builder encadeável/`channel`.
   - `TypeError: useTalkXSuppression is not a function`.
2. **Produto (código real quebrado nesta ref):**
   - `ReferenceError: handleDisconnectDialogOpenChange is not defined` — confirmado por `TS2304` no
     TypeCheck (§2.2).
   - `AssertionError: expected 'Público total (estimado)0' to contain '—'` — formatação de provider TalkX.
   - `Error: Failed to resolve import "@/hooks/gamification/mutations"` — módulo ausente.
3. **Assertivas de comportamento** (`expected "vi.fn()" to be called 1 times, but got 0 times`,
   `expected [] to have a length of 1 but got +0`, `expect(element).not.toBeInTheDocument()`) — mistura de
   teste e produto caso a caso; não dá para fechar classe sem abrir cada arquivo, e não é o alvo deste
   cartão.

Causa-raiz: a lib `src/lib/logger.ts` passou a exportar `createLogger`/`getLogger`
(`src/lib/logger.ts:89,100`) e o harness/mocks dos testes não foram reconciliados; idem mocks de
`framer-motion` (`useReducedMotion`), `@/hooks/business/useQueueGoal*` e do cliente supabase
(`channel`, `unsubscribe`, builder encadeável). Ou seja: **o grosso é dívida de TESTE** (mock velho),
mais uma veia real de **produto** — o `ReferenceError: handleDisconnectDialogOpenChange is not defined`
é bug de código, confirmado pelo TypeCheck (§2.2).

### 2.2 TypeCheck — produto

O ratchet (`node scripts/ci/typecheck-ratchet.mjs`) falha só com dívida **nova** ("Corrija os novos
erros. Atualize o baseline somente quando a nova divida tiver aprovacao explicita."). Trecho literal:

```
  src/adapters/evolutionAdapter.ts(189,5) error TS2353 - Object literal may only specify known properties, and 'presence_status' does not exist in type 'ContactRow'.
  src/components/admin/useTarefasAgendadas.ts(45,72) error TS2345 - Argument of type '"admin_list_cron_jobs"' is not assignable to parameter of type ...
  src/components/connections/ConnectionCard.tsx(221,23) error TS2304 - Cannot find name 'handleDisconnectDialogOpenChange'.
  src/components/connections/ConnectionsView.tsx(220,73) error TS2322 - Type '(connection: WhatsAppConnection) => Promise<boolean>' is not assignable to type '(c: WhatsAppConnection) => void | Promise<void>'.
  src/components/queues/QueueAlertsDisplay.tsx(94,19) error TS17001 - JSX elements cannot have multiple attributes with the same name.
  src/components/talkx/TalkXView.tsx(96,56) error TS2345 - ... Type '"paused"' is not assignable to type 'TalkXTopView'.
Corrija os novos erros. Atualize o baseline somente quando a nova divida tiver aprovacao explicita.
##[error]Process completed with exit code 1.
```

Distribuição: `TS2322` 21 · `TS2339` 14 · `TS2353` 7 · `TS2345` 5 · `TS2304` 1 · `TS17001` 1 · `TS2739` 1
(50 linhas, 26 arquivos). Prova de que é produto e não teste: `ConnectionCard.tsx:221` usa
`handleDisconnectDialogOpenChange`, nome que **não existe nem é importado** no arquivo
(`git show a9b4d6c6fb:src/components/connections/ConnectionCard.tsx` → só há os imports
`ConnectionDisconnectDialog`/`ConnectionDeleteDialog`/`ConnectionAuditDialog`; `onOpenChange` do Delete e do
Audit aponta para `setConfirmDelete`/`setAuditOpen`, o do Disconnect aponta para o símbolo inexistente).
É `ReferenceError` em runtime, não só erro de tipo.

### 2.3 Node CI Scripts — contrato/configuração de CI + documentação + ambiente

O job roda `node --test scripts/ci/*.unit.mjs`. Falharam **41 testes** de contrato. Causas medidas:

```
test at scripts/ci/ci-artifacts.unit.mjs:191:1
✖ E72: `dist` so sai em workflow_dispatch (1.360502ms)
  AssertionError [ERR_ASSERTION]: step "Upload build artifacts" nao encontrado em .github/workflows/ci.yml

test at scripts/ci/check-workflow-pins.unit.mjs:237:1
✖ os workflows reais do repositório batem com a fonte única (0.39093ms)
  Error: fonte única de versões incompleta em .github/toolchain.json: falta a versão de "playwright"

test at scripts/ci/check-talkx-docs.unit.mjs:291:1
✖ docs/talkx: predecessores arquivados e documentos correntes sem citação falsa (13.356709ms)
  AssertionError [ERR_ASSERTION]: a documentação do módulo Talk X ainda mistura história/plano ou cita código inexistente
  + actual - expected
  + [ 'documento não classificado na raiz do módulo: docs/talkx/ESTADOS.md ...' ]

test at scripts/ci/docs-estado-registry-convention.unit.mjs:344:1
✖ TESTING_CONVENTION.md descreve os runners reais (configs, scripts e CI) (0.919879ms)
  AssertionError [ERR_ASSERTION]: ci.yml não tem mais o passo `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1`

✖ N217: medição do zero via deno agrega >= 50% e inclui os 5 helpers (2.978677ms)
  Error: deno não executou: spawnSync deno ENOENT
      at medirDoZero (file:///.../scripts/ci/edge-coverage-authz.unit.mjs:192:28)
```

Causa-raiz: o `ci.yml` foi **reduzido em 16/10/2026** (cabeçalho do próprio arquivo na main:
`# CI minimo (16/10/2026, decisao do Joaquim): tipos + testes de unidade + build. Guardas de banco, E2E,
auditorias e contratos de workflow sairam do CI por PR.`) e os artefatos de fonte-única que descrevem o CI
**não foram reconciliados**: `scripts/ci/ci-artifacts.unit.mjs` (passos de upload que não existem mais),
`scripts/ci/docs-estado-registry-convention.unit.mjs` (passo `deno test` que saiu), `.github/toolchain.json`
(falta `playwright`), registries de docs (`ESTADO.md`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`,
`docs/DB-INVENTORY.md`, `docs/talkx/ESTADOS.md`), contratos de migration (`E62: contrato
20261004195051.sql: nenhuma invocacao declarada`) e um mock do `github.rest.issues.update`.
Em cima disso, 3 testes `N217` falham por **ambiente**: o runner `ubuntu-24.04` do job `node-scripts` não
tem `deno` instalado (`spawnSync deno ENOENT`).

---

## 3. Classificação (todos os dentes do run)

| Job | Causa-raiz | Classe |
|---|---|---|
| Unit 1/3, 2/3, 3/3 | mocks/harness desatualizados (logger `createLogger`, `framer-motion`, cliente supabase) — dominante | **teste** |
| Unit (mesmo job) | `handleDisconnectDialogOpenChange` inexistente; formatação `Público total (estimado)`; import `@/hooks/gamification/mutations` ausente | **produto** |
| TypeCheck | 50 erros TS novos em 26 arquivos (ratchet) | **produto** |
| Node CI Scripts | 41 contratos de fonte-única (ci.yml/toolchain/docs/migration) fora de sincronia com a árvore | **contrato de CI + documentação** |
| Node CI Scripts (`N217`) | `deno` ausente no runner `ubuntu-24.04` | **ambiente** |
| — | nada indica falha de host/rede/segredo do GitHub Actions em si | infra do runner **OK** |

Resumo: **não há uma causa-raiz única**. A run é vermelha por três frentes independentes, com pesos
distintos: **teste** (maior volume), **produto** (TypeCheck + bug de conexões) e **contrato/ambiente** no job
de scripts de CI.

---

## 4. O que a auditoria F16 afirmou × o que o log mostra

A F16 (`docs/audits/sync-ag5-qualidade-2026-10-17.md`, §F16) traz:

> | CI/CD Pipeline `38986918764` | Unit 1/3, 2/3, 3/3; TypeCheck; Node CI Scripts | **código/teste** | TalkXOverview.table 13 falhas, TalkXA11y 3, AuditLogDashboard 9, filesPeriod.adversarial 2, TalkXTemplatesRail 1 e tsc com erro |

Três correções:

1. **Volume subestimado.** O "Trecho" lista ~28 falhas nominais; o run real tem **181 arquivos / 510 testes**
   falhos nos 3 shards. `TalkXOverview.table`, `TalkXA11y`, `AuditLogDashboard`, `filesPeriod.adversarial` e
   `TalkXTemplatesRail` **existem** no log, mas são uma fração pequena do total.
2. **Classe incompleta.** "código/teste" ignora duas classes presentes: **ambiente** (`deno não executou:
   spawnSync deno ENOENT`, job Node CI Scripts) e **contrato de CI + documentação** (41 testes de
   fonte-única). Por isso a linha "Infra=0 / main vermelha" da auditoria não se sustenta para o job
   `Node CI Scripts`.
3. **Natureza de "main vermelha".** Correto o que a F16 diz na observação (§F16, linha 48): na árvore
   final `dia/2026-10-17` os unit estão verdes (a árvore integrada **não contém** `a9b4d6c6fb`; o
   `ConnectionCard.tsx` de `dia/2026-10-17` não tem o símbolo quebrado). A run vermelha é da **main de
   produção** `a9b4d6c6fb` — o defeito é real e vivo **nessa** ref, ainda que já ausente na árvore integrada.

---

## 5. Proposta de correção (NÃO implementada — só proposta, por área)

Nada aqui foi tocado por este cartão. Sugestão de donos, em ordem de valor:

1. `iris` (telas/componentes) — P0: definir/ligar `handleDisconnectDialogOpenChange` em
   `src/components/connections/ConnectionCard.tsx` (ou remover o `onOpenChange`), e ajustar
   `ConnectionsView.tsx:220` (`Promise<boolean>` → `void`). Elimina 21 falhas de unit + 2 erros TS.
2. `workertestes` — reconciliar os mocks/harness com os exports reais: `@/lib/logger`
   (`createLogger`/`getLogger`), `framer-motion` (`useReducedMotion`), builder do cliente supabase
   (`channel`/`unsubscribe`/encadeamento), `../useAdminData` (`AUDIT_PAGE_SIZE`), `QueryClientProvider` e
   `AuthProvider` nos renders. É o maior bloco de vermelho.
3. `vera` (CI) — reconciliar `scripts/ci/*.unit.mjs` com o `ci.yml` mínimo de 16/10 (remover asserções de
   passos que saíram: upload de `dist`/coverage, `deno test`), completar `.github/toolchain.json`
   (`playwright`) e atualizar o mock `github.rest.issues.update`.
4. `edgar` (Edge) — instalar `deno` (ou `denoland/setup-deno`) no job `node-scripts`, ou tornar o `N217`
   pulável quando `deno` não está no PATH.
5. `workersql` (banco) — reconciliar os contratos de migration (`contrato 20261004195051.sql: nenhuma
   invocacao declarada`).
6. Documentação — atualizar os registries (`ESTADO.md`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`,
   `docs/DB-INVENTORY.md`, `docs/talkx/ESTADOS.md`) para descreverem os runners reais.

---

## 6. Como reproduzir (comandos usados)

```
gh run view 38986918764 --repo adm01-debug/Zapp_Web_V2
gh run view 38986918764 --repo adm01-debug/Zapp_Web_V2 --log-failed
git log -1 --format='%H %ci %s' origin/main
git show a9b4d6c6fb:src/components/connections/ConnectionCard.tsx | grep -n handleDisconnectDialogOpenChange
```
