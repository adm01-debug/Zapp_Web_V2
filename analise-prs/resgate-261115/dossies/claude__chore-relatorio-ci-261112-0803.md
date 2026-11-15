# Dossiê — claude__chore-relatorio-ci-261112-0803 (PR #2980)

**Branch:** `origin/claude/chore-relatorio-ci-261112-0803` · tip `47bdaa7f` · merge-base `1616f7b7` (= merge squash da PR #2975, 2026-11-12T07:56Z)
**Commit único:** `47bdaa7fd docs(ci): adiciona §9 estado pós-merge PR #2975 ao RELATORIO_CI`
**Escopo:** só `RELATORIO_CI.md` (+53/−3). Zero `src/`, edges, migrations, workflows.

## Propósito
Snapshot documental de ~07:58–08:03Z de 2026-11-12, logo após o merge da PR #2975: (a) troca 3 frases "fix ainda não mergeado" por "mergeado via PR #2975"; (b) adiciona um `## 9. Estado pos-merge PR #2975` com runs `in_progress`/`A VERIFICAR` (E2E logado #43179048693 "wakeup agendado em 08:18Z", CI/CD #43179026812 e DB Guard #43179026184 em progresso).

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência na main |
|---|---|---|---|
| `RELATORIO_CI.md` L176 (bullet "Correção aplicada" em §4.3) | troca "evidência no diff da branch" → "mergeado via PR #2975" | **OBSOLETA** — §4.3 foi reescrito na main; o bullet nem existe mais; agora aponta a correção definitiva (PR #2987, SHA `87c5e97b`, "✅ Resolvido — ver §11") | `git show origin/main:RELATORIO_CI.md` L165-174 |
| `RELATORIO_CI.md` L316 (linha E2E Logado da tabela §8) | troca "nao esta mergeado" → "mergeado via PR #2975" | **OBSOLETA** — tabela foi substituída; main já traz E2E Logado como `✅ RESOLVIDO (PR #2987 MERGEADA 11:15Z)` | main L370, L459 |
| `RELATORIO_CI.md` L334 ("Nota critica" removida) | remove nota "commit 5b796e70d ainda nao mergeado" | **INCORPORADA** — `removed_still_in_main=0`; a nota não existe na main (`git grep '5b796e70d' origin/main -- RELATORIO_CI.md` → vazio) | line_check do item |
| `RELATORIO_CI.md` novo `## 9. Estado pos-merge PR #2975` (37 linhas) | snapshot 07:58–08:03Z com 4 runs em `in_progress`/`A VERIFICAR` | **OBSOLETA** — superada por conteúdo posterior já na main: `## 9` (PRs #2982/#2983, 09:xx), `## 10` (PR #2988, 11:xx), `## 11` (inventário fresco 11:12Z, PR #2987 mergeada, tabela final 12:25Z: "7 de 8 workflows resolvidos"). A numeração §9 também colide com o §9 da main. O run #43179048693 cujo resultado era "A VERIFICAR" foi substituído por runs posteriores (#43194351058 em `PENDENCIAS.md` L15; #43206905499 em main L410). `PENDENCIAS.md` L20 já registra #43179026361 (Front release) como `success`. | main L297, L342, L379-470; `PENDENCIAS.md` L15, L20 |

Commits da main que reescreveram o arquivo após o merge-base: `15923813a chore(ci): RELATORIO_CI.md — §9 baseline e estado pós-fix`, `65cf38544 (#2989) chore(docs): PENDENCIAS e RELATORIO_CI finais — types-sync resolvido, E2E PR #2987 em andamento`, `cb6576b2a (#3035)` (`git log 1616f7b7..origin/main -- RELATORIO_CI.md`).

## Veredito
**OBSOLETA** (confiança alta). Nenhuma lacuna de código; o único conteúdo ausente é um snapshot intermediário de CI (estados "em progresso"/"a verificar") cujo desfecho já está documentado em seções posteriores da própria `RELATORIO_CI.md` e em `PENDENCIAS.md`. Portar o §9 da branch hoje introduziria informação desatualizada e numeração duplicada.

Fechamento da PR #2980: o `last_comment` é só o aviso de limite do Codex — não há alegação a verificar.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar o veredito OBSOLETA. Não consegui — **concordo**.

**Conteúdo real da branch** (`git diff 1616f7b7 origin/claude/chore-relatorio-ci-261112-0803`): 1 arquivo, `RELATORIO_CI.md`, +53/-3. Três edições de linha e um bloco novo §9 (9.1–9.4) com snapshot de CI de 2026-11-12 07:58–08:03Z.

**Checagem de unicidade (os 37 "missing_in_main" são reais, mas sem valor):**
- Nenhum dos IDs exclusivos da branch está na main: `43179026361`, `43179026274`, `43179026184`, `43179026812`, `43179048693`, SHA `1616f7b7`, deploy `dpl_HF4JUtn5eg3mBxwwNGjMi1KLbiQ4` → `grep -c` = 0 em `git show origin/main:RELATORIO_CI.md` para todos. Confirmado que falta.
- Mas todo esse bloco é estado transitório **do próprio texto da branch**: "⏳ `in_progress` em 07:58Z", "Status em 08:03Z: `in_progress`", "Resultado: A VERIFICAR — wakeup agendado em 08:18Z". Valor informativo hoje (2026-11-15): nulo.

**Substituição na main realmente cobre a necessidade (abri os arquivos):**
- `RELATORIO_CI.md` na main tem 464 linhas e um §9 **diferente** ("baseline e estado pós-fix"), mais §10 e §11 escritos depois, que fecham exatamente as runs que a branch deixou em aberto: §11.2 "7 success, 1 skipped, 2 in_progress. ZERO falhas"; §11.6 "7 de 8 workflows resolvidos"; E2E logado → "✅ RESOLVIDO (PR #2987 MERGEADA 11:15Z)".
- Edição 1 da branch (`run.mjs:639` / "mergeado via PR #2975") foi superada por `origin/main:RELATORIO_CI.md:172`: "Correção aplicada (2026-11-12): PR #2987 — `mark_outbound_post_started(uuid,uuid)` incluída como 8ª assinatura em `routine-ownership.mjs` — MERGEADA em 11:15Z (SHA `87c5e97b`)" + "Ação: ✅ Resolvido — ver §11". A main é mais nova e mais correta.
- Edição 2 (linha da tabela, run `#43166054120`): a main substituiu a linha pela run `#43164665340` em `:272`, preservando o fato que a branch queria registrar ("fix diagnóstico em PR #2975").
- Edição 3 (remover a "Nota critica" dizendo que #2975 não estava mergeado): a main também já não tem essa nota (`grep "Nota critica\|5b796e70d"` → 0 ocorrências). O objetivo da edição está atingido.
- Histórico da reescrita: `git log --oneline origin/main -- RELATORIO_CI.md` → `15923813a`, `65cf38544` (#2989), `cb6576b2a` (#3035), todos posteriores ao merge-base `1616f7b73`.

**Prova de intenção:** PR #2980 está `state: closed`, `merged_at: null`, `closed_at: 2026-11-12T11:13:41Z` — fechada pelo próprio dono no mesmo minuto em que entrou a PR #2989 ("RELATORIO_CI finais"). `mergeable_state: dirty`. Não foi perda acidental: foi descarte deliberado de um snapshot superado.

**Veredito final:** OBSOLETA. Zero hunks de valor ≥ médio não cobertos. `apagar_branch_seguro = true` (docs-only; nada em `src/`, `supabase/`, workflows ou migrations — `counts` do JSON confirma 0 em todos).
