# Dossiê — claude__perf-bundle-inicial-261113 (PR #3034)

**Ref:** `origin/claude/perf-bundle-inicial-261113` · tip `0ba37e1ed` · merge-base `e50daef6a` · 1 commit real (`c01860efb`) + 10 merges de `main`.

## Propósito
`perf(bundle)`: tirar do bundle inicial o Radix inteiro (vendor-ui), o date-fns inteiro (vendor-utils) e os controles de acessibilidade (HighContrast separado em Provider/Context/Toggle lazy). Meta: 323,8 KB gzip → ~291 KB.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `src/components/theme/HighContrastProvider.tsx`, `HighContrastToggle.tsx`, `highContrastContext.ts`, `__tests__/HighContrastTokens.test.tsx`, `__tests__/contrasteDoSistema.test.tsx`, `src/components/transitions/useTransitionPreferences.ts`, `src/providers/AppProviders.tsx` | IDENTICAL_TO_MAIN / PRESENT_BYTE | Incorporados byte a byte | entraram no squash `ab657aa34` (pacote 5, PR #3064) — `git show ab657aa34 --stat` lista os 7 arquivos com os mesmos números do diff da branch (134/154/32/3/3/2/2 linhas) |
| `vite.config.ts` | BOTH_CHANGED / CONFLICT (17 linhas ausentes, 1 removida ainda na main) | **Intenção incorporada em forma refinada; a forma literal foi substituída de propósito** | `origin/main:vite.config.ts:93-125`: vendor-ui (prio 80) só com `class-variance-authority|clsx|tailwind-merge|use-sync-external-store|@floating-ui|@radix-ui/(primitivos do shell)`; novo grupo `vendor-radix` (prio 75, l.124-125) para o resto do Radix, lazy. Comentário l.113-116 cita explicitamente: "Radix sem grupo nenhum ... fragmenta em dezenas de chunks e soma +34 KB gzip no total-assets (estourou o teto de 4100 KB na PR #3034)". date-fns: main mantém `vendor-utils` de propósito (l.133-136: "sem grupo, cada funcao do date-fns vira um chunk proprio (36 chunks, +13 KB gzip no total-assets) para economizar ~3 KB do first paint"). A linha `removed_still_in_main` é exatamente essa, mantida por decisão registrada. Commit: `ab657aa34` (`git log -S'vendor-radix' origin/main -- vite.config.ts`). |
| `scripts/ci/bundle-budget.unit.mjs` | BOTH_CHANGED / CONFLICT (11 linhas ausentes) | **Intenção incorporada em forma refinada** | Teste "deps compartilhadas com o recharts ficam no vendor-ui" da branch está idêntico em `origin/main:scripts/ci/bundle-budget.unit.mjs:223-231`. O teste da branch "Radix e date-fns ... nenhum grupo os captura" foi substituído por `so os primitivos Radix do shell ficam no vendor-ui; o resto vai para o vendor-radix` (l.186-212) e `date-fns fica inteiro no vendor-utils` (l.214-218), com comentário l.175-180 citando a PR #3034 como motivo. Lista de grupos obrigatórios (l.138) inclui `vendor-radix` e `vendor-utils`. Commit `ab657aa34`. |

## Veredito
**INCORPORADA** (confiança alta). Tudo que a branch fazia está na main: 7/9 arquivos byte a byte; os 2 restantes (`vite.config.ts`, `bundle-budget.unit.mjs`) carregam a mesma intenção (Radix fora do first paint, deps do recharts com dono no vendor-ui, HighContrast lazy) numa abordagem deliberadamente superior (vendor-ui + vendor-radix; date-fns agrupado) adotada na main em `ab657aa34` porque a versão literal da branch estourava o teto de total-assets (4100 KB) — a própria main documenta isso citando a PR #3034. As 29 linhas "em lacuna" são comentários e asserções da abordagem "sem grupo", obsoletas por decisão registrada no código.

Nenhuma migration/edge/workflow. Nenhum trabalho a portar.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro (`apagar_branch_seguro = true`).

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da `main`.

Base da verificação: `origin/main` em `dac285f62`; merge-base `e50daef6a`; branch `0ba37e1ed` (11 commits = 10 merges de `main` + 1 commit real, `c01860efb`).

### 1. Os 7 arquivos `src/` são byte a byte iguais à main (sha1 do blob)
`git show <ref>:<arquivo> | sha1sum` — branch e main batem nos 7:
- `src/components/theme/HighContrastProvider.tsx` → `a6c5e8c6d052`
- `src/components/theme/HighContrastToggle.tsx` → `13a68891b4f3`
- `src/components/theme/__tests__/HighContrastTokens.test.tsx` → `42596a067c6d`
- `src/components/theme/__tests__/contrasteDoSistema.test.tsx` → `5a7def5ef859`
- `src/components/theme/highContrastContext.ts` → `b212795cb21a`
- `src/components/transitions/useTransitionPreferences.ts` → `f51ff31b4f01`
- `src/providers/AppProviders.tsx` → `76fb62ea6560`

`git diff --stat` do merge-base confirma que o diff da branch tem exatamente 9 arquivos — não há arquivo fora do JSON da triagem.

### 2. `ab657aa34` (PR #3064, "pacote 5 — ... #3034 ...") está na main
`git merge-base --is-ancestor ab657aa34 origin/main` → verdadeiro.

### 3. Os 2 arquivos com "lacuna" são variante REJEITADA de propósito, não trabalho perdido
A branch tirava Radix e date-fns de **qualquer** grupo de chunking. A main adotou o mesmo objetivo (sair do first paint) por outro caminho, e documenta no próprio código por que recusou o caminho da branch — citando esta PR pelo número:

`vite.config.ts` da main, linhas 105-117 (comentário do `vendor-ui`):
> `// - Radix sem grupo nenhum (cada primitivo seguindo o importador)` / `//   tambem tira o peso do first paint, mas fragmenta em dezenas de` / `//   chunks e soma +34 KB gzip no total-assets (estourou o teto de` / `//   4100 KB na PR #3034); com os dois grupos o total fica em ~+4 KB.`

Ou seja: a variante da branch **estourou** o `total-assets` (teto 4100 KB, `performance-budget.json` idêntico nas três refs). A main implementa:
- `vite.config.ts:120` — `vendor-ui` (prio 80) com `class-variance-authority|clsx|tailwind-merge|use-sync-external-store|@floating-ui|@radix-ui/(primitive|react-(tooltip|toast|popper|portal|...))` → **superset** do regex da branch (que só adicionava `use-sync-external-store`).
- `vite.config.ts:123-125` — `vendor-radix` (prio 75), o resto do Radix, não alcançado pelo entry: "só baixa quando a primeira tela com um desses primitivos abre".
- `vite.config.ts:136` — `vendor-utils` mantido para `date-fns` (decisão consciente contra a branch, pelo mesmo motivo de fragmentação).

Cobertura de testes (`scripts/ci/bundle-budget.unit.mjs` na main):
- o teste da branch "deps compartilhadas com o recharts ficam no vendor-ui, nao no vendor-charts" está na main **idêntico** (linhas ~225-233);
- o teste da branch "Radix e date-fns seguem a alcancabilidade dos importadores (nenhum grupo os captura)" foi **substituído** por dois testes que travam o arranjo escolhido: "so os primitivos Radix do shell ficam no vendor-ui; o resto vai para o vendor-radix" (com `ui.priority > radix.priority`) e "date-fns fica inteiro no vendor-utils (sem fragmentar em um chunk por funcao)";
- a asserção `vendorUi.test.test("@radix-ui/react-dialog") === true` que a branch removia virou `vendorRadix.test.test("@radix-ui/react-dialog") === true` na main;
- a lista do teste "le as regras reais de chunking" na main é `["vendor-core","vendor-data","vendor-ui","vendor-radix","vendor-motion","vendor-utils"]` — superset da lista da branch.

### 4. Conclusão
As 29 linhas de "lacuna" são 100% a variante recusada (Radix/date-fns sem grupo) e seus comentários. Reaplicá-las reabriria a falha de `total-assets` que derrubou a #3034. Nada a resgatar; branch pode ser apagada.
