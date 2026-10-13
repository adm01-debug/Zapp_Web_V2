Especialista: Edgar (area-edge-api)

## Sensibilidade
- O MEU diff (vs `dia/2026-10-13`) é só documento: `docs/audits/edge-functions-authz-coverage.md` e a linha 88 do `ESTADO.md`. Não toca `rateLimit`, `service_role`, `requireRole`, `verifyHmac` nem `DELETE`; nenhuma proteção foi afrouxada.
- A branch carrega, por ordem do cartão, a entrega `29b1671c0` (cherry-pick = commit `819005597`), que é a que mexeu em `CONTROL_ACTIONS` (`_shared/evolution-control-authz.ts`) e em `evolution-api/index.ts`. Essa parte do diff é da entrega original, não desta correção: eu não alterei uma linha de código de produção, só corrigi os dois documentos derivados que ela deixou desalinhados.
- Nenhuma referência ao banco de produção e nenhum segredo no diff (checagem de ref de produção no diff deu 0 ocorrências).

## Motivo do refazer resolvido
A entrega `29b1671c0` acrescentou 3 linhas a `_shared/evolution-control-authz.ts` (2 comentários + a ação `'pairing-code'` no `CONTROL_ACTIONS`) e empurrou as linhas de `evolution-api/index.ts`. Reproduzi sobre a ponta atual de `dia/2026-10-13` com `git cherry-pick 29b1671c0` (commit `819005597`, só o `.tmp/relato.md` conflitou — resolvido tomando o relato da entrega). Isso quebrou DOIS documentos derivados; corrigi os dois:

## O que mudou e por quê
- `docs/audits/edge-functions-authz-coverage.md`: regenerado com `REGENERAR_EDGE_AUTHZ_COV=1`. A régua N217 mede `LF/LH` dos 5 helpers de authz e exige que o documento bata com a medição fresca. As +3 linhas do helper subiram o total de 137 para 140 linhas cobertas (o `Set` é coberto na carga do módulo), então o documento tinha de mudar: `137/137`→`140/140`, total `255/305`→`258/308`, `83.6%`→`83.8%`.
- `ESTADO.md` (linha 88, registro `evolution-webhook`): as âncoras para `supabase/functions/evolution-api/index.ts` apontavam `474`, `540`, `701`; a entrega deslocou essas três linhas em +97 (mesmo conteúdo, novo local: `571`, `637`, `798`). Atualizei só os números das âncoras; nenhum texto de registro mudou.

## Prova
- vermelho antes (branch com o cherry-pick, antes da correção):
  - `node --test --test-reporter=tap scripts/ci/edge-coverage-authz.unit.mjs` → `not ok 8 - N217: docs bate com medição fresca e segunda execução é idêntica` · `# pass 7 / # fail 1` (erro: `docs/audits/edge-functions-authz-coverage.md desatualizado`)
  - `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok 2 - ESTADO.md cita só âncoras reais...` (erro: `âncora desatualizada: supabase/functions/evolution-api/index.ts:474 não cita \`evolution-webhook\``)
- verde depois:
  - `node --test --test-reporter=tap scripts/ci/edge-coverage-authz.unit.mjs` → `# pass 8 / # fail 0`
  - `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs` → `# pass 11 / # fail 0`
- `~/arquitetura-v2/integrador/ci_espelho.sh .` (branch) imprime 9 linhas: `guarda: scripts/ci/implicit-any-ratchet.mjs` · os 6 `node: --staged .../stagedLintableFiles/stagedRemovedFiles` (lint-ratchet) · os 2 `node: Talk X ...` — e NÃO traz mais `node: N217 ...` nem o `node: ESTADO.md cita só âncoras reais`.
- Essas 9 linhas são PRÉ-EXISTENTES na base: rodei a mesma suíte node sobre um snapshot de `96dd72dc5` (ponta de `dia/2026-10-13`, via `git archive`) e saíram exatamente os mesmos 8 itens de lint-ratchet + Talk X; a guarda `implicit-any-ratchet.mjs` também estoura o `timeout 120` da espelho na base (o `tsc` do repo passa de 120s nesta máquina). Ou seja: o cartão não traz falha NOVA ao espelho.

## O que NÃO fiz e por quê
- Não toquei no código da entrega (`_shared/evolution-control-authz.ts`, `evolution-api/index.ts`, `session-flavor-routes.test.ts`): eles estão certos e passam nas próprias provas; o problema era só documento derivado.
- Não mexi nas 6 falhas de `lint-ratchet` (staged) nem nas 2 de `Talk X`: são anteriores à base e de outros arquivos (fora do meu escopo). Ficam registradas aqui para o integrador comparar com a mesma lista na base.

## Commits (citando a entrega)
- `819005597` — cherry-pick da entrega `29b1671c0` (feat(evolution-api): ação pairing-code para parear por código).
- `ec38d7a0` — `chore(ci): regenera o espelho de cobertura de authz apos a acao pairing-code`.
- `a98e9a25b` — `docs(estado): atualiza ancoras do evolution-api deslocadas pela acao pairing-code`.
