Especialista: senior (docs — documento de inventário e a guarda de CI que o recalcula)

## Retomada: ponto a ponto (motivo da recusa)

Ponto 1 — "Traga dia/2026-10-11 atual para o workspace (merge/rebase)": já vem na base.
O workspace nasceu de `dia/2026-10-15`, e essa ponta contém as duas: `git merge-base
--is-ancestor dia/2026-10-11 HEAD` → `0` e `git merge-base --is-ancestor dia/2026-10-12 HEAD`
→ `0`. Não havia o que mesclar nem conflito a resolver.

Ponto 2 — "resolva o conflito preservando o que já entrou nela": o trabalho anterior deste
cartão JÁ está dentro da ponta, e NÃO reapliquei os commits dele, porque reaplicar regride o
documento (as âncoras voltariam para o estado de dia/2026-10-11). Provas:
- `git log --diff-filter=A -- ESTADO.md FEATURE_REGISTRY.md TESTING_CONVENTION.md
  scripts/ci/docs-estado-registry-convention.unit.mjs` → `cbfe5b25ab fix(ci/devops): ESTADO.md,
  FEATURE_REGISTRY.md e TESTING_CONVENTION.md (SL-122)`; `cbfe5b25ab` é ancestral de
  dia/2026-10-11 (medido com `git merge-base --is-ancestor cbfe5b25ab dia/2026-10-11` → `0`),
  logo está na minha base.
- `git diff --stat a39567fa1 HEAD -- ESTADO.md FEATURE_REGISTRY.md TESTING_CONVENTION.md
  scripts/ci/docs-estado-registry-convention.unit.mjs` → 14/10/4/5 linhas, TODAS evolução da
  ponta (rótulo de base, contadores de grupo, deslocamento de linhas e uma edge nova). Nenhuma
  correção do branch anterior foi removida.

Ponto 3 — "rode o teste do cartão": o teste do cartão é a guarda
`scripts/ci/docs-estado-registry-convention.unit.mjs` (roda no CI por
`node --test scripts/ci/*.unit.mjs`, `.github/workflows/ci.yml:101`). Na base ela estava
VERMELHA em duas asserções — não pelo branch anterior, mas porque o último alinhamento do
documento (`40e06a3d13`) ficou para trás: `git rev-list --count 40e06a3d13..HEAD` → `198`
commits moveram chamadores. Corrigi as duas e o mesmo defeito na raiz. Execução:
ANTES `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → exit 1,
`tests 11`, `pass 9`, `fail 2`, com "AssertionError [ERR_ASSERTION]: âncora desatualizada:
src/hooks/integrations/useKnowledgeBase.ts:99 não cita ai-kb-ingest" e "AssertionError
[ERR_ASSERTION]: grupo de create-user divergiu dos chamadores reais:
{"A":[],"B":[],"C":[],"D":[]}"; DEPOIS → exit 0, `tests 11`, `pass 11`, `fail 0`, todas as
linhas ✔ (incluindo "ESTADO.md cita só âncoras reais…" e "ESTADO.md publica o grupo do
primeiro chamador real…").

Ponto 4 — "`zapp-verify full .` e feche de novo": rodado no workspace depois das duas
mudanças. `zapp-verify . --rapido` → `OK db_guard` · `OK tipos` · `OK lint` ·
`OK migrations` · "VERIFY: VERDE SEM BANCO (184s)". `zapp-verify full .` → `OK db_guard` ·
`OK tipos` · `OK lint` · `OK migrations` · `OK testes` · `OK build` ·
"VERIFY: VERDE SEM BANCO (1312s)", com "Test Files 1499 passed | 5 skipped (1504)" e
"Tests 13235 passed | 24 expected fail | 48 todo (13307)"; registros crus em
`~/.local/state/zapp-verify/d38be3617752/` (`resultado.txt`, `testes.log`).

## O que mudou (commit dbb01c4235, 2 arquivos)

1. `scripts/ci/docs-estado-registry-convention.unit.mjs` — o detector de chamador do front
   passava só por `invoke(`; o commit `66713e9510` (na base) passou `create-user` para a camada
   padrão `invokeEdge` (`src/lib/supabaseHelpers.ts:24`), e a guarda lia a edge como órfã com o
   chamador na tela. O detector passa a ler `invoke|invokeEdge`. É a verdade do código, não
   afrouxamento: a asserção de órfã fica mais exigente (agora a busca acha mais chamador).
   Evidência de que é o único caminho afetado: `git grep -n "invokeEdge(\s*['\"]" -- 'src/**'
   ':!*test*'` → só `src/components/admin/useAdminData.ts:334` e `:341`.
2. `ESTADO.md` — âncoras `arquivo:linha` recalculadas do código da ponta com o mesmo critério da
   guarda (script `.tmp/recalcular-estado.mjs`, que replica a guarda; ele não entra no commit),
   mais o que também envelhece junto: divisão de grupo (`talkx-link` B→A), totais por grupo
   (A 55 · B 0 · C 3 · D 6 · E 17), contagem/lista de órfãs (E 17) e o rótulo `Base:
   dia/2026-10-15`. Os totais e a lista de órfãs são recalculados, não digitados.
   Um caso que a guarda não pegava e eu peguei: `multiplix-dispatch` estava ancorada em
   `useMultiplixDispatches.ts:6`, que é um COMENTÁRIO que ainda contém o nome da edge (por isso
   passava); a chamada real é a linha 133 — a âncora foi para lá.

## Prova (saídas reais, copiadas do terminal)

- Vermelho ANTES (na base, sem as minhas duas mudanças):
  `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
  "✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge" com
  "AssertionError [ERR_ASSERTION]: âncora desatualizada: src/hooks/integrations/useKnowledgeBase.ts:99 não cita ai-kb-ingest"
  e "✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D" com
  "AssertionError [ERR_ASSERTION]: grupo de create-user divergiu dos chamadores reais: {"A":[],"B":[],"C":[],"D":[]}";
  resumo: tests 11, pass 9, fail 2 (exit 1). Log cru: `.tmp/guard-fail.txt`.
- Verde DEPOIS: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → exit 0,
  as 11 linhas ✔, incluindo "✔ ESTADO.md cita só âncoras reais…" e "✔ ESTADO.md publica o grupo
  do primeiro chamador real…"; resumo: tests 11, pass 11, fail 0. Log cru: `.tmp/guard-verde.txt`.
- `zapp-verify . --rapido` → OK db_guard · OK tipos · OK lint · OK migrations ·
  "VERIFY: VERDE SEM BANCO (184s)".
- `zapp-verify full .` → OK db_guard · OK tipos (19s) · OK lint (188s) ·
  OK migrations · OK testes (1082s; "Test Files 1499 passed | 5 skipped (1504)",
  "Tests 13235 passed | 24 expected fail | 48 todo (13307)") · OK build (22s) →
  "VERIFY: VERDE SEM BANCO (1312s)" (registro: ~/.local/state/zapp-verify/d38be3617752/resultado.txt).

## Conferência independente e o que NÃO fiz

- Conferência independente: o branch paralelo `v2/fix-ci-devops-estado-md-feature-registry-26101520255c89`
  (commit 34f760d784, mesmo pai d723a90107) resolve o MESMO envelhecimento. Não reaproveitei o
  commit dele; minha tabela foi recalculada aqui e o resultado coincide com o dele em todas as
  linhas, MENOS `multiplix-dispatch` (lá segue no comentário da linha 6, aqui foi para o invoke
  real da 133). As duas versões podem ser integradas juntas: a diferença é uma linha que só o
  meu lado tocou.
- Não toquei em `FEATURE_REGISTRY.md` nem em `TESTING_CONVENTION.md`: os dois já estão na ponta
  e a guarda passa neles como estão.
- Não mexi em workflow, baseline de lint, inventário de testes nem em código de produto.
- Guarda de inventário (`node scripts/ci/check-test-inventory.mjs`) segue VERMELHA na base por 6
  `.test.sh` de `scripts/db-audit/` fora do `db-guard.yml` — pré-existente, fora do meu diff (meu
  arquivo é coberto pelo glob do ci.yml); não alterei inventário para "fazer passar".
- Escopo: `git show --stat HEAD` → apenas `ESTADO.md` e
  `scripts/ci/docs-estado-registry-convention.unit.mjs`; `git status` limpo depois do commit.
