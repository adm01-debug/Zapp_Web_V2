# claude__tender-heisenberg-a4jk3s (PR #1979)

- ref: `origin/claude/tender-heisenberg-a4jk3s` · tip `dec13f873` · merge_base `5a4632c87` (22/10/2026)
- 27 commits, 19 arquivos, +747/-217. Nenhuma migration, nenhuma edge.

## Propósito
Lote de "CI verde" de 22/10: corrige falhas de testes unitários e de guards de CI acumuladas no
lote #1976 (reverte parte dele), reescreve o baseline de typecheck, ajusta contratos de workflow,
mocks de jsdom e 4 bugs pequenos de hooks (`useInboxFilters`, `useDiagnosticsData`,
`useUserSettings`, `useInboxBulkActions`), e adiciona um plano documental de 200 etapas para os
workflows em falha (`4a007578e docs: plano de correções dos workflows em failure`).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/inbox/useInboxFilters.ts` | **INCORPORADA (main foi além)** — intenção inteira (`useSearchParams`, `?type=` explícito prevalece sobre o stored pref, `setSearchParams(..., {replace:true})`) já na main; só faltam linhas de comentário e o nome da variável (`params` vs `next`). Main ainda acrescenta sync de back/forward. | `origin/main:src/hooks/inbox/useInboxFilters.ts:2,97,106-108,151,159` e efeito extra em `:122-136` |
| `src/hooks/system/useDiagnosticsData.ts` | **INCORPORADA (forma diferente)** — branch parava de lançar e empurrava o erro para `dbError`; main não lança e passa `connectionsCountError ?? dbError` ao `classifyHealth`. Mesmo comportamento ('down' em vez de pular o `setHealth`). | `origin/main:src/hooks/system/useDiagnosticsData.ts:293-294` (comentário) e `:317` |
| `src/hooks/system/useUserSettings.ts` | **INCORPORADA** — `isError` completo na main (estado, reset, 2 pontos de set, retorno). `missing_in_main=0`. | `origin/main:src/hooks/system/useUserSettings.ts:88,110,123,166,326` |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | **INCORPORADA (main foi além)** — bulkArchive por `conversation_status` já é o teste da main, com asserts extras (`not.toHaveProperty('assigned_to')`, RPC de lote, `p_expected_current`). | `origin/main:src/hooks/inbox/__tests__/useInboxBulkActions.test.ts:571-614,657-698`; hook em `:188-250` |
| `src/hooks/team-chat/__tests__/useTeamMessages.canal-e-reconexao.test.tsx` | **INCORPORADA (superset)** — mock de `useTeamReadState` na main com `isLoading:false` a mais. | `origin/main:...:47-48` |
| `scripts/db-audit/dashboard-rls-authorization.test.sh` | **OBSOLETA** — a main já tem `20261007013217` na lista de migrations e na extração final de `dashboard_kpi`, e já avançou o `assert_last_definer` de `dashboard_kpi` para `20261026210000_dashboard_kpi_periodo_aditivo.sql` (posterior ao da branch). `is_admin_or_supervisor` → `20261016170000` idem. Resto do diff é 1 espaço extra (ruído). | `origin/main:scripts/db-audit/dashboard-rls-authorization.test.sh:102,134-135,165-166,439-449` |
| `scripts/db-audit/known-violations.json` | **OBSOLETA** — a branch reacrescenta 2 exceções (`rpc:talk_me_list_pending_messages`, `from:connection_alert_preferences`); na main o ratchet foi zerado: `"known": []`. Os alvos existem (migration `20261011010003_talk_me_list_pending_messages.sql`, tabela usada em `useConnectionAlertPreferences.ts`), então reinserir afrouxaria o guard. | `origin/main:scripts/db-audit/known-violations.json:5`; `origin/main:scripts/db-audit/talk-me-queue-contract.test.sh:12` |
| `.github/workflows/ci.yml` | **OBSOLETA** — branch renomeia o job para `🔍 Lint & TypeCheck`; a main manteve a chave `typecheck` com `name: 🔎 TypeCheck`. | `origin/main:.github/workflows/ci.yml:38-39` |
| `scripts/ci/workflow-contracts.unit.mjs` | **OBSOLETA** — o par do rename acima: a branch renomeia o teste E69 para "lint-and-typecheck"; a main mantém `E69: unit-tests/node-scripts não esperam o typecheck`, coerente com a chave real do ci.yml. Resto é um sufixo " — SL-095" em comentário. | `origin/main:scripts/ci/workflow-contracts.unit.mjs:548` |
| `scripts/ci/ci-docs-baseline.unit.mjs` | **OBSOLETA (regressiva)** — a branch REMOVE `/14\s+workflows/i` e `/14\s+arquivos/i` de `CONTAGEM_ANTIGA`; a main tem os 4 padrões. Aplicar afrouxaria o guard de contagem antiga em docs. | `origin/main:scripts/ci/ci-docs-baseline.unit.mjs:29` |
| `scripts/ci/typecheck-baseline.json` | **OBSOLETA** — artefato gerado (ratchet). O baseline da main é a verdade do estado atual da main; a lista da branch (-116 entradas) é de 22/10. | arquivo gerado por `tsc -b --force`; `origin/main:scripts/ci/typecheck-baseline.json` |
| `scripts/ci/eslint-baseline.json` | **INCORPORADA** — `PRESENT_REVERSE_APPLIES` (prova mecânica: já está na main). | item JSON, `hunk: PRESENT_REVERSE_APPLIES` |
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | **INCORPORADA** — `PRESENT_REVERSE_APPLIES`; main usa `vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')`. | `origin/main:...:103` |
| `src/hooks/tasks/__tests__/workItemFormat.test.ts` | **INCORPORADA** — `IDENTICAL_TO_MAIN` / `PRESENT_BYTE`. | item JSON |
| `src/hooks/tasks/workItemAggregates.ts` | **OBSOLETA (valor nenhum)** — único hunk troca `/[̀-ͯ]/g` por os caracteres combinantes literais. Comportamento idêntico; a forma da main é a legível. | `origin/main:src/hooks/tasks/workItemAggregates.ts:102` |
| `src/test/setup.ts` | **LACUNA SEM VALOR** — mocks globais de `clientHeight`/`clientWidth` (600×800) não estão na main e não são necessários: `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` → **1 arquivo / 9 testes passando** com `grep -c clientHeight src/test/setup.ts` = 0. | saída do vitest (15/11, duração 5,14s) |
| `docs/audits/PLANO_WORKFLOWS_FAILURE_200_ETAPAS_2026-10-16.md` | **OBSOLETA** — plano de 635 linhas medido em 16/10 sobre "os 14 arquivos de `.github/workflows/`"; a main tem **21** workflows hoje, inclusive `settings-guard.yml`, que o plano declara deletado em 16/10 (linha 102 do doc). Premissa e números não correspondem mais. | `git ls-tree --name-only origin/main -- .github/workflows/` = 21 arquivos; doc linhas 142,146,156,225,541,635 citam "14 workflows/arquivos" |
| `.github/workflows/types-sync.yml` | **PERDIDA (valor baixo)** — única lacuna funcional real. Ver abaixo. | `origin/main:.github/workflows/types-sync.yml:574-575` (rotação) vs `:594-605` (dedupe) |

## Lacuna a recuperar (a única)

`.github/workflows/types-sync.yml` — E20: mover o dedupe de comentário para **antes** da rotação de
issue. Na main, quando a issue de alerta passa de 20 páginas de comentários, o bloco de rotação
(`if (ultimaPagina > 20)`) cria comentário e dá `return` antes de o dedupe rodar — logo o mesmo gate
vermelho volta a comentar mesmo com < 6h e mesma causa. Efeito: ruído de CI, nada de negócio.

Patch (branch `dec13f873`, aplica-se na main porque o bloco está intacto):

```diff
               const ultimaPagina = ultimaPaginaMatch ? Number(ultimaPaginaMatch[1]) : 1;
+              // E20: dedupe ANTES da rotacao — se a causa nao mudou e tem < 6h,
+              // suprimir sem criar comentario, independente do numero de paginas.
+              const { data: comentarios } = await github.rest.issues.listComments({
+                owner: context.repo.owner,
+                repo: context.repo.repo,
+                issue_number: existing.number,
+                per_page: 1,
+                page: ultimaPagina
+              });
+              const ultimo = comentarios[0];
+              const causaAnterior = ultimo?.body?.match(/<!-- causa:([a-z-]+) -->/)?.[1] ?? null;
+              const idadeUltimoMs = ultimo ? Date.now() - new Date(ultimo.created_at).getTime() : Infinity;
+              if (causaAnterior === causa && idadeUltimoMs < 6 * 60 * 60 * 1000) {
+                core.info(`Dedupe: mesma causa (${causa}) ha menos de 6h; comentario suprimido.`);
+                return;
+              }
               // W91/E51: rotacionar issue apos 20 comentarios para manter legibilidade.
               if (ultimaPagina > 20) {
                 ...
               }
-              const { data: comentarios } = await github.rest.issues.listComments({ ... });  // bloco antigo de dedupe
-              const ultimo = comentarios[0];
-              const causaAnterior = ...;
-              const idadeUltimoMs = ...;
-              if (causaAnterior === causa && idadeUltimoMs < 6 * 60 * 60 * 1000) { ...; return; }
```

Ou seja: deletar as linhas 594–606 da main e inserir o mesmo bloco logo após `const ultimaPagina =`
(linha 573). Mexe em workflow → PR fica aberta para o dono (regra de `AGENTS.md`).

## Veredito

**PERDIDA_PARCIAL** — tudo de valor real já está na main (4 fixes de hooks e 4 de testes,
INCORPORADOS, em vários casos com a main já tendo ido além); o que falta é 1 reordenação de dedupe
em `types-sync.yml` (valor baixo, só ruído de alerta) e lacunas sem valor (baselines gerados, mocks
de jsdom dispensáveis, renames de job superados, plano documental com premissa de 14 workflows
contra 21 na main hoje).

`apagar_branch_seguro`: **false** — o hunk E20 do `types-sync.yml` não está na main e ainda se
aplica; porte primeiro (ou registre descarte explícito) e só então apague a branch.

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL` e com `apagar_branch_seguro=false`. Tentei refutar por
dois caminhos (derrubar a lacuna do `types-sync.yml` e achar lacuna de valor que a triagem
descartou); nenhum dos dois se sustentou. `origin/main` em `dac285f62`.

### 1. A lacuna alegada é real (tentativa de refutar: falhou)

- `origin/main:.github/workflows/types-sync.yml:573-575` — `const ultimaPagina =` seguido
  imediatamente de `// W91/E51` + `if (ultimaPagina > 20)`; o bloco de dedupe só começa em `:594`
  (`const { data: comentarios }`) e o `return` do dedupe está em `:605-606`. Ordem da main =
  rotação ANTES do dedupe, exatamente como a triagem descreveu.
- Não foi removido de propósito: `git log -S'E20: dedupe ANTES da rotacao' origin/main --
  .github/workflows/types-sync.yml` → **zero commits**. A reordenação nunca entrou na main; não há
  revert, "remove" ou "desativa" no histórico do arquivo (últimos 12 commits são bumps do Dependabot
  e refactors de job).
- Encaixa no código atual: o hunk da branch (`git diff 5a4632c87 origin/claude/...-a4jk3s --
  .github/workflows/types-sync.yml`) só move 13 linhas que existem na main byte a byte, usa `causa`
  e `existing` já definidos antes de `:573` e nenhuma API nova.
- **Agravante que a triagem não citou**: o próprio guard da main deixa esse caminho sem cobertura —
  `origin/main:scripts/ci/types-sync-dedupe.unit.mjs:173-174` diz "Rotacao (E51) dispara quando
  ultimaPagina > 20; usamos 10 comentarios para testar a paginacao sem ativar a rotacao". Ou seja, o
  bug de ordem é invisível para os 7 testes E20 da main. Isso confirma a lacuna e explica por que a
  main está verde com ela.
- Valor continua **baixo**: efeito único é comentário repetido na issue de alerta `types-sync`
  depois de 20 comentários. Zero efeito em produto, dado ou cliente.

### 2. Procura por lacuna de valor ≥ médio descartada pela triagem (nada encontrado)

- `src/hooks/inbox/useInboxFilters.ts` — **INCORPORADA confirmada**: `origin/main:97`
  (`useSearchParams`), `:106-109` (`typeParam !== null ? normalizeContactType(typeParam) :
  storedPrefs?.contactType`), `:151-159` (`setSearchParams(prev => …, { replace: true })`), mais o
  efeito de back/forward em `:162-165` que a branch não tem. Só diferem nome de variável
  (`params`/`next`) e comentários.
- `src/hooks/system/useDiagnosticsData.ts` — **INCORPORADA confirmada**: `origin/main:291-294` não
  tem `throw` no `connectionsCountError` (comentário "Erro na contagem não aborta o ciclo…") e
  `:317` passa `classifyHealth(connectionsCountError ?? dbError, …)`. Mesmo resultado ('down').
- `src/hooks/system/useUserSettings.ts` — **INCORPORADA confirmada**: `isError` em `origin/main:88`,
  `:258`, `:307`, `:326`.
- `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` — **INCORPORADA (superset) confirmada**:
  main tem restauração por status em `:612-614`, `:676`, `:731` e caso de status misto em `:682-698`.
- `scripts/db-audit/known-violations.json` — **OBSOLETA confirmada e regressiva**: main tem
  `"known": []` e `origin/main:supabase/schema-catalog.json` já contém `talk_me_list_pending_messages`
  (2 ocorrências) e `connection_alert_preferences` (9). Com o alvo no catálogo não há violação;
  reinserir as 2 chaves afrouxaria o ratchet (e o próprio guard mandaria removê-las).
- `scripts/db-audit/dashboard-rls-authorization.test.sh` — **OBSOLETA confirmada**. Olhei o único
  ponto que a triagem tratou como "ruído": o `awk` ancorado (`/^CREATE OR REPLACE …/`). Na main o
  padrão é sem âncora (`:443`) e a migration `20261007013217` repete a assinatura em comentário na
  linha 55; o range do awk é repetível, então a extração sai com DOIS blocos — linhas 55-186
  (comentários + `DROP INDEX` + função `reject_repeated_conversation_closure_without_reopen`
  completa, fechando em `$function$;`) e 197-288 (o `dashboard_kpi` real). Ambos são SQL válido e
  idempotente, o `psql_file` aplica os dois sem erro e a definição final do `dashboard_kpi` entra
  igual. Logo a âncora é cosmética, não corrige falso-positivo. Fora isso a main foi além: já cobre
  `20261007013217` (`:102`, `:439-449`) e avançou o `assert_last_definer` para
  `20261026210000_dashboard_kpi_periodo_aditivo.sql` (`:165-167`), posterior ao da branch.
- `src/test/setup.ts` — **lacuna sem valor confirmada por execução**: `src/test/setup.ts` e
  `FilesTab.fase6.test.tsx` na árvore local são idênticos aos da main (`git diff --stat origin/main`
  nesses dois caminhos = vazio), `grep -c clientHeight src/test/setup.ts` = 0, e
  `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` →
  **1 arquivo / 9 testes passando** (6,25s, 15/11). O mock de `clientHeight/clientWidth` não é
  necessário.
- `.github/workflows/ci.yml` + `scripts/ci/workflow-contracts.unit.mjs` — **OBSOLETA confirmada**:
  main tem job `typecheck` / `name: 🔎 TypeCheck` (`ci.yml:38-39`) e o teste pareado
  `E69: unit-tests/node-scripts não esperam o typecheck` (`workflow-contracts.unit.mjs:548`). O
  rename da branch quebraria o par.
- `scripts/ci/ci-docs-baseline.unit.mjs` — **OBSOLETA regressiva confirmada**: `origin/main:29` tem
  os 4 padrões, incluindo `/14\s+workflows/i` e `/14\s+arquivos/i` que a branch remove.
- `docs/audits/PLANO_WORKFLOWS_FAILURE_200_ETAPAS_2026-10-16.md` — **OBSOLETA confirmada**:
  `git ls-tree --name-only origin/main -- .github/workflows/` = **21** arquivos e `settings-guard.yml`
  **está presente**, enquanto o plano (linha 102) o declara deletado em 16/10 e mede 14 workflows.
- `scripts/ci/typecheck-baseline.json`, `scripts/ci/eslint-baseline.json`,
  `src/hooks/tasks/workItemAggregates.ts`, `FilesTab.fase6.test.tsx`, `workItemFormat.test.ts`,
  `useTeamMessages.canal-e-reconexao.test.tsx` — baselines gerados (a verdade é a da main) e
  equivalências (`/[̀-ͯ]/` ≡ caracteres combinantes literais). Nada a recuperar.

### Conclusão

Veredito mantido: **PERDIDA_PARCIAL**, lacuna única = reordenação E20 em
`.github/workflows/types-sync.yml` (apagar `origin/main:594-607` e inserir o mesmo bloco após
`:573`). Não apagar a branch antes de portar ou registrar descarte explícito. Como é workflow, a PR
fica aberta para o dono.
