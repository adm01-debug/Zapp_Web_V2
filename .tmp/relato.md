Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- Cherry-pick de `fc6625f98` (entrega de t_1cd43b87, branch v2/remover-tela-export-auto-261011155971f2)
  sobre a ponta de `dia/2026-10-13`: traz a remoção de `src/components/reports/AutoExportManager.tsx`,
  da entrada em `src/pages/lazyViews.ts`, do VIEW_MAP em `src/pages/ViewRouter.tsx`, do item em
  `src/services/navigation.service.ts` e o teste novo `src/pages/__tests__/ViewRouter.autoExportRemovido.test.tsx`.
  Não recomecei do zero; o diff de código é o da própria entrega.
- `FEATURE_REGISTRY.md`: a entrega removeu a view `auto-export` do `ViewRouter.tsx` mas deixou a linha
  dela no registro. Removi a linha `auto-export`; cabeçalho 54→53 views; Totais Partial 12→11 e total 54→53.
  Nenhuma asserção foi afrouxada; nenhum teste removido, pulado ou editado.

## Prova (vermelho antes, verde depois)
- vermelho antes (entrega cherry-picked, registro ainda velho):
  `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `not ok 7 - FEATURE_REGISTRY.md lista exatamente as views do ViewRouter`
    `not ok 9 - FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais`  (`# tests 11 # pass 9 # fail 2`)
- verde depois (só o FEATURE_REGISTRY.md corrigido, mesmo comando)
  → `# tests 11  # pass 11  # fail 0`
- espelho do CI, mesmo comando do cartão (`ci_espelho.sh .`): a linha
  `node: FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais` NÃO aparece mais na saída.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos OK, lint OK, migrations OK, db_guard OK).

## Pontos do cartão (O QUE FAZER / 'corrigir' do achado)
- Ponto 1 — partir do commit da entrega com cherry-pick, sem recomeçar: FEITO.
  Parti de `fc6625f98` (t_1cd43b87) via `git cherry-pick -n fc6625f98`; o relato de origem consta no
  corpo do commit de código (`3263909cd2`). Nenhum arquivo de produto foi escrito à mão.
- Ponto 2 — reproduzir o item e corrigir a causa sem afrouxar asserção: FEITO.
  A guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` NÃO guarda fatos em si: ela recalcula as
  views do `ViewRouter.tsx` e compara com o `FEATURE_REGISTRY.md`, que é o documento sob teste. A entrega
  tirou `auto-export` do ViewRouter e deixou o registro desatualizado — por isso corrigi o FIXTURE
  (`FEATURE_REGISTRY.md`), não a guarda. Vermelho 2 → verde 0 na seção Prova. Sha da correção de código:
  `3263909cd2`.
- Ponto 3 — provar e fechar citando o sha: FEITO.
  Verde do comando do cartão (sem a linha acusada) e `zapp-verify . --rapido` VERDE, ver Prova.
  Sha do commit de correção: `3263909cd2`. O relato não escreve à mão o resultado do `zapp-verify`:
  ele sai no bloco FATOS MEDIDOS deste fechar.

## Por que os pontos 2 e 3 não se corrigem por "commit novo"
- Ponto 2 não procede como "alterar o arquivo de teste do cartão": o arquivo de teste do cartão é
  `scripts/ci/docs-estado-registry-convention.unit.mjs`, uma guarda GENÉRICA — ela não carrega o fato,
  recalcula as views do `ViewRouter.tsx` e compara com o `FEATURE_REGISTRY.md`. O artefato que ela AFIRMA
  é o `FEATURE_REGISTRY.md`, e é exatamente esse dado que o diff corrige. Editar a guarda para tolerar a
  view sobrando seria afrouxar asserção — proibido pelo cartão. O vermelho→verde do próprio arquivo de
  teste do cartão está na seção Prova (`# fail 2` → `# fail 0`).
- Ponto 3 não procede: a prova verde está na seção Prova — comando do cartão sem a linha acusada e
  `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`. O sha do commit de código (`3263909cd2`) está no
  corpo do commit e citado aqui. O evento/heartbeat antigo que registra `tipos` por OOM é ANTERIOR ao
  verde final (a rodada final de `zapp-verify` passou: `OK tipos 101s`).

## O que NÃO fiz e por quê
O espelho ainda mostra linhas que são PRÉ-EXISTENTES no meu base e não são deste cartão:
- `guarda: scripts/ci/implicit-any-ratchet.mjs` + 6 subtests `--staged`/`stagedLintableFiles`;
- `node: Talk X ...` (2 subtests de `scripts/db-audit/talkx-*-contract.test.mjs`).
Prova de que vêm do base e não deste diff: os arquivos que os sustentam são IDÊNTICOS ao base —
`git diff 96dd72dc5f HEAD -- scripts/db-audit/talkx-schedule-timezone-contract.test.mjs
scripts/db-audit/talkx-scheduler-resume-contract.test.mjs supabase/functions/process-talkx-bulk/index.ts
scripts/ci/implicit-any-ratchet.unit.mjs scripts/ci/implicit-any-ratchet.mjs` → vazio.
- implicit-any: isolados passam (`node --test scripts/ci/implicit-any-ratchet.unit.mjs scripts/talkx/*.unit.mjs`
  → `43 tests, 42 pass, 0 fail`); falham só na rodada combinada de 146 arquivos sob a carga do host
  (load average ~40; o `tsc` das rodadas de tipo chegou a morrer por OOM, exit 137).
- Talk X: falha por conteúdo — o regex de import de `process-talkx-bulk/index.ts` não acompanhou
  `parseDndHours`/`DndSetting`. Defeito no base, fora do meu diff; não toquei em `supabase/**` nem
  em `scripts/db-audit/**`.
