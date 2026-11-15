# Dossiê — claude__chore-relatorio-ci-261112-0940 (PR #2990)

**Branch:** `origin/claude/chore-relatorio-ci-261112-0940` · tip `5c655b681` · merge-base `2d1020163e` · 3 commits (2026-11-12)
**Propósito:** só documentação de CI — atualizar `RELATORIO_CI.md` (§9/§10/§11, vitest task `bhgtzypf7` 1864 passed/15870 tests/VITEST_EXIT:0) e reescrever `PENDENCIAS.md` (tabela de prova dos workflows, §1 E2E PR #2987, §2 zombie 409, §3 baseline, §4 PR #2980, §5 inventário 11:12Z). Zero `src/`, edges, migrations ou workflows.

## Veredito: INCORPORADA (confiança alta) — apagar branch: SEGURO

| Arquivo | Achado | Evidência |
|---|---|---|
| `PENDENCIAS.md` | Conteúdo da branch é prefixo exato do arquivo na main; main só acrescentou seções novas (2026-11-14/15) | `git diff <tip> origin/main -- PENDENCIAS.md` → `1 file changed, 318 insertions(+)`, **0 deleções**. Cabeçalho `Última atualização: 2026-11-12T12:25Z` em `origin/main:PENDENCIAS.md:4`; §1–§5 idênticos (linhas 8–127). As 8 linhas "removed_still_in_main" são só separadores de tabela `|---|---|` reutilizados pelas seções novas (ruído). |
| `RELATORIO_CI.md` | Idêntico à main exceto 5 rótulos de linha da tabela §10.3 encurtados ("DB Guard step 181 (talkx-e27-replay)" → "DB Guard (talkx-e27-replay)", "Types Sync Gate 2 (usage-guard)" → "Types Sync Gate 2", etc.) com **mesmo status, PR, SHA e estado**; e newline final | `git diff <tip> origin/main -- RELATORIO_CI.md` = 28 linhas, só §10.3 (`origin/main:RELATORIO_CI.md:367-371`) + EOF. §6.4/§8/§11.1/§11.6 com `bhgtzypf7`, `15870`, `1864 passed` presentes na main (`origin/main:RELATORIO_CI.md:245-250, 285, 396-398, 462`). §11.4 zombie 409 em `:427-432`. |

**Commit da main que incorporou:** `cb6576b2a` 2026-11-13 "Pacote: 20 PRs aprovadas integradas num único merge (#3035)" (`git log -S'2026-11-12T12:25Z' origin/main -- PENDENCIAS.md RELATORIO_CI.md`). Antes disso, `65cf38544` (#2989) já trazia a versão 11:30Z (sem o bloco vitest `bhgtzypf7`), que o pacote #3035 completou.

## Lacunas a recuperar
Nenhuma. As 5 linhas "missing_in_main" são variações de texto do mesmo fato (rótulos mais longos); valor = nenhum.

## Classificação
- tipos: docs
- valor da lacuna residual: nenhum

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Apagar a branch é seguro.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da `main`.

Provas (tip `5c655b681` → `origin/main`, somente leitura):

1. `git diff 5c655b681 origin/main -- PENDENCIAS.md` → `1 file changed, 318 insertions(+)`, único hunk `@@ -125,3 +125,321 @@` e **zero deleções de conteúdo** (a única linha `-` do patch é o cabeçalho `--- a/PENDENCIAS.md`). Teste direto de prefixo: `diff <(git show 5c655b681:PENDENCIAS.md) <(git show origin/main:PENDENCIAS.md | head -127)` → **idêntico** (127 linhas da branch = 127 primeiras das 445 da main). As 8 linhas `removed_still_in_main` da pré-classificação são separadores `|---|---|`.
2. `git diff 5c655b681 origin/main -- RELATORIO_CI.md` → um único hunk em §10.3 (`origin/main:RELATORIO_CI.md:367-371`) + newline final. A main encurtou 5 rótulos; **status, PR, SHA e estado de cada linha são idênticos**.
3. Os detalhes que os rótulos longos da branch carregavam continuam na main em outro lugar: `git grep -c` em `origin/main -- RELATORIO_CI.md PENDENCIAS.md` → `87c5e97b` 2+3, `40410990313` 5+5, `usage-guard` 3+2, `step 181` 1 (PENDENCIAS), `2987` 7+4, `bhgtzypf7` 5+1. Nada se perdeu de fato — só de rótulo.
4. Incorporação: `git log -S'bhgtzypf7' --oneline origin/main -- RELATORIO_CI.md` → `cb6576b2a "Pacote: 20 PRs aprovadas integradas num único merge (#3035)"`.

Lacuna residual: as 5 variações de rótulo são o mesmo fato escrito mais curto; valor = nenhum. Não há `src/`, edge, migration ou workflow na branch (`docs_only=yes`).
