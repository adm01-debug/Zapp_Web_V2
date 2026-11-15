# Dossiê — fix__f1a-lote-b-batch6 (branch `origin/fix/f1a-lote-b-batch6`, PRs #2083 / #2437)

- tip `8fa1bb340` · merge_base `bac62ba98` (2026-10-23) · 3 commits, 1 arquivo: `src/components/nps/NPSDashboard.tsx`
- Commits: `12196a296 chore(fmt): prettier em NPSDashboard.tsx`, `82585eef2 fix: NPSDashboard não expunha erro de leitura nem aviso de teto (t_1944d290)`, `8fa1bb340 Merge main`.

## Propósito
Dois hunks funcionais no painel NPS: (1) estado de erro quando `useNPSSurveys` falha (em vez de cair no estado vazio / NPS 0), com botão "Tentar novamente" → `refetch`; (2) aviso de truncamento quando `isTruncated` (`NPS_SURVEY_LIMIT`). O resto do diff (≈100 das 136 linhas adicionadas) é só reformatação Prettier (ordem de classes Tailwind, quebra de linha).

## Arquivo × achado × evidência

| Hunk da branch | Está na main? | Evidência (`origin/main:src/components/nps/NPSDashboard.tsx`) |
|---|---|---|
| import `NPS_SURVEY_LIMIT`, `Button` | Sim | L3 `import { NPS_SURVEY_LIMIT, useNPSSurveys }`; L7 `import { Button }` |
| `const { surveys, isLoading, error, isTruncated, metrics, refetch } = useNPSSurveys()` | Sim | L46 (mesmos campos, ordem diferente) |
| `if (error)` → Card `data-testid="nps-error-state"`, texto "Não foi possível carregar as pesquisas NPS", botão "Tentar novamente" → `refetch` | Sim | L61-94 (ícone `AlertTriangle` em vez de `AlertCircle`/`RefreshCw`; `role="alert"` no CardContent; mesmo testid, mesmo texto, mesmo refetch) |
| `isTruncated` → `data-testid="nps-truncation-notice"` "Baseado nas últimas {NPS_SURVEY_LIMIT} respostas…" | Sim | L141-148 (`<p>` em vez de `<div>` com ícone `Info`; mesmo testid e mesmo prefixo de texto) |
| Reformatação Prettier (classes reordenadas, props em múltiplas linhas) | Não, e não precisa | Main mantém formatação antiga (L16, L24, L159-162); nenhum check de prettier em `.github/workflows` nem script `format:check` em `package.json` (`git grep -i prettier origin/main -- .github/workflows package.json` só acha a devDependency). Cosmético, valor nenhum. |

Quem trouxe para a main: `e1f2ee4dd 2026-10-27 fix(test): destrava o CI Gate da main` (`git log -S'nps-error-state' origin/main -- src/components/nps/NPSDashboard.tsx`).
Teste cobrindo os dois comportamentos já na main: `src/components/nps/__tests__/NPSDashboard.erro.test.tsx` L31-76 (erro → `nps-error-state`, não `nps-empty-state`; "Tentar novamente" chama refetch; `nps-truncation-notice` com "Baseado nas últimas 500 respostas"; sem aviso dentro do teto).

Por que o mecânico deu CONFLICT / 100 linhas faltando: as linhas "faltantes" são as versões Prettier das mesmas linhas (ex.: `rounded-xl p-6` vs `p-6 rounded-xl`, `h-5 w-5` vs `w-5 h-5`) e a implementação do erro/aviso na main usa marcação diferente com o mesmo contrato (testid, texto, refetch).

## Veredito
**INCORPORADA** (confiança alta). Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o INCORPORADA hunk por hunk. Não achei nada de valor ≥ médio fora da main.

- Escopo real da branch: `git diff --stat bac62ba98 origin/fix/f1a-lote-b-batch6` → **1 arquivo, 136+/38-**, só `src/components/nps/NPSDashboard.tsx`. Os 3 commits (incluindo o "Merge main") não tocam mais nada; não há hunk escondido em outro arquivo.
- Lendo o diff inteiro, só existem **dois** hunks funcionais; todo o resto é Prettier (reordenação de classes Tailwind `p-6 rounded-xl`→`rounded-xl p-6`, `w-5 h-5`→`h-5 w-5`, props quebradas em várias linhas, `map(i =>`→`map((i) =>`). Isso explica os 100 "missing_in_main" do `line_check`: são as mesmas linhas reformatadas.
- Hunk 1 (estado de erro) na main: `origin/main:src/components/nps/NPSDashboard.tsx` L61-94 — comentário de causa, `if (error)`, `data-testid="nps-error-state"`, `role="alert"`, texto exato "Não foi possível carregar as pesquisas NPS", `<Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>`. A main tem até um parágrafo explicativo a mais (L83-86) que a branch não tem. Só difere o ícone (`AlertTriangle` L81 vs `AlertCircle`+`RefreshCw` da branch) e a classe `border-destructive/30` — cosmético.
- Hunk 2 (aviso de teto) na main: L141-148 — `{isTruncated && (<p data-testid="nps-truncation-notice" className="text-xs text-warning">Baseado nas últimas {NPS_SURVEY_LIMIT} respostas respondidas — …`. Mesmo gatilho, mesmo testid, mesmo prefixo de texto; a redação do final difere ("pesquisas mais antigas podem estar fora do cálculo" vs "pode haver pesquisas mais antigas não contadas"), semanticamente igual.
- Pré-requisitos presentes na main: L3 `import { NPS_SURVEY_LIMIT, useNPSSurveys }`, L7 `import { Button }`, L46 destrutura `error, isTruncated, refetch`; o hook `origin/main:src/hooks/business/useNPSSurveys.ts` L34 `export const NPS_SURVEY_LIMIT = 500`, L74 `setIsTruncated(rows.length >= NPS_SURVEY_LIMIT)`, L149 `return { surveys, isLoading, error, isTruncated, metrics, createSurvey, refetch: fetchSurveys }`. Nada pendurado.
- Teste na main cobre os 4 casos: `src/components/nps/__tests__/NPSDashboard.erro.test.tsx` L31-76 (erro → `nps-error-state` e não `nps-empty-state`/`NPS Score`; "Tentar novamente" → `refetch` 1×; `isTruncated` → "Baseado nas últimas 500 respostas"; dentro do teto → sem aviso). Mesmo marcador de tarefa `t_1944d290` do commit da branch.
- A única coisa realmente ausente da main é a reformatação Prettier, e ela não é exigida: `git grep -niE "prettier|format" origin/main -- .github/workflows package.json` só encontra as devDependencies `prettier ^3.9.10` e `prettier-plugin-tailwindcss` (package.json L133-134); nenhum script `format:check`, nenhum job de formatação, nenhum `prettier` no eslint config. Aplicar esse diff hoje seria churn puro sobre um arquivo que a main já reescreveu — e geraria conflito à toa.

**Concordo: INCORPORADA.** `apagar_branch_seguro = true`. Nenhuma lacuna adicional.
