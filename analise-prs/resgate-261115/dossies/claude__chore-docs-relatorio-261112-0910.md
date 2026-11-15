# Dossiê — claude__chore-docs-relatorio-261112-0910

- Ref: `origin/claude/chore-docs-relatorio-261112-0910` · tip `47980f81` · merge-base `376332a2` · 2 commits (`7da586b24`, `47980f813`) · só docs.
- Propósito: acrescentar ao `RELATORIO_CI.md` uma "§9 Estado pós-merge PR #2975 (2026-11-12, ~07:58Z)" — snapshot transitório
  (runs `in_progress`, "A VERIFICAR — wakeup agendado em 08:18Z") do estado dos workflows logo após o squash de #2975 (SHA `1616f7b73`).

## Arquivo × achado × evidência

| Arquivo | Lacuna | Achado | Evidência |
|---|---|---|---|
| `RELATORIO_CI.md` (+50 linhas, 1 hunk, `@@ -332,3 +332,53 @@`) | 34 linhas ausentes na main | **OBSOLETA** — snapshot "em andamento" superado por seções finais já na main | `git log origin/main -- RELATORIO_CI.md`: `15923813a` (2026-11-12 07:27, "§9 baseline e estado pós-fix"), `65cf38544` (#2989, "finais — types-sync resolvido, E2E PR #2987"), `cb6576b2a` (#3035). Main já tem §9 própria (`RELATORIO_CI.md:297` "Sub-sessão 2026-11-12T09:xx — PRs #2982 e #2983"), §10 (`:342`) e §11 (`:379`). |

Prova de supersessão, item a item do hunk da branch:
- 9.1 "PR #2975 mergeado (squash) SHA 1616f7b73" → `git merge-base --is-ancestor 1616f7b73 origin/main` = verdadeiro (commit `1616f7b73 docs(ci): inventário completo workflows + registra types-sync em PENDENCIAS` está na main). O fato não precisa de registro em relatório.
- 9.2/9.3 runs `in_progress` (#43179026184, #43179026812, #43179048693 "A VERIFICAR") → estados finais em `origin/main:RELATORIO_CI.md:329` (§9.4 workflows pós-merge #2982), `:352` (§10.2 inventário SHA `0a1e73f2`), `:403` (§11.2 inventário fresco 11:12Z).
- 9.4 "E2E Logado ⏳ em execução — correção definitiva requer investigação" → main `:419` §11.3 "PR #2987 — MERGEADA (fix E2E logado)" e `:449` §11.6 "E2E Logado ✅ RESOLVIDO (PR #2987 MERGEADA 11:15Z)".
- 9.4 "Types Sync ❌ BLOQUEADO Rule 8" → main §11.6: "Types Sync Gate 1/Gate 2 ✅ RESOLVIDO (PR #2988 / #2983)".
- 9.4 "DB Guard zombie — cancelamento manual via UI" → main `:427` §11.4 "ghost confirmado (ambas APIs 409)" e §11.6 "⚠️ Rule 8".
- 9.4 linhas "Deploy Edge Functions / DB Live Guard / Branch Hygiene / Front release / Contexto para agentes RESOLVIDO" → já em main `:259-266` (§7.1) e `:277-294` (§8), mesmos run IDs (#43143197204, #42678012070, #42582604190, #43167727048).
- `dpl_HF4JUtn5eg3mBxwwNGjMi1KLbiQ4` (deploy Vercel) é o único dado que não aparece em nenhum `.md` da main (`git grep` sem hit) — valor nenhum: estado de deploy já substituído por dezenas de deploys posteriores.

Conflito mecânico: a branch cria "## 9." no mesmo ponto onde a main já tem outra "## 9." (`15923813a`, 29 min antes do commit da branch). Aplicar o hunk hoje duplicaria numeração e inseriria estado desatualizado entre §8 e §9 da main.

## Veredito
**OBSOLETA** · confiança alta · `apagar_branch_seguro = true`.
Nada a recuperar: todo o conteúdo é relatório de estado transitório, já substituído por seções finais (§9–§11) na main que registram a conclusão real dos mesmos workflows.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

Parecer: **concordo com OBSOLETA** · `apagar_branch_seguro = true`. Tentei refutar e não achei um único hunk de valor ≥ médio fora da main.

Checagens feitas por mim (repo local, `origin/main` atual, só leitura):

1. Diff integral conferido: `git diff 376332a2 origin/claude/chore-docs-relatorio-261112-0910` = 1 arquivo, 1 hunk `@@ -332,3 +332,53 @@`, **+50/-0** em `RELATORIO_CI.md`. Zero remoção, zero `src/`, `supabase/`, `.github/`. Nada de código a perder.
2. Supersessão item a item, lendo a main nas linhas citadas:
   - §9.4 "E2E Logado ⏳ em execucao / correcao definitiva requer investigacao" → `origin/main:RELATORIO_CI.md:419-425` (§11.3 "PR #2987 — MERGEADA", merge SHA `87c5e97b2f48e2e1a0e37f6423658c38dba3b7a8`, 11:15:02Z) e `:449+` (§11.6 "E2E Logado ✅ RESOLVIDO"); também `origin/main:PENDENCIAS.md:15` e `:34`.
   - §9.4 "Types Sync ❌ failure BLOQUEADO Rule 8 (migration 20261111160000)" → `origin/main:RELATORIO_CI.md:364-366` (§10.3 "Types Sync Gate 2 ✅ PR #2983 / Gate 1 ✅ PR #2988") + `:421` (§11.2 `types-sync` run #43204745973 `success`) + `origin/main:PENDENCIAS.md:13-14`.
   - §9.4 "DB Guard zombie — cancelamento manual via UI" → `origin/main:RELATORIO_CI.md:427-432` (§11.4, ambas APIs 409, ghost) — mesma conclusão, com mais prova.
   - §9.2 "CI/CD Pipeline ⏳ in_progress #43179026812" → `origin/main:RELATORIO_CI.md:403-413` (§11.2, CI/CD Pipeline #43204721826 `success`, "7 success, ZERO falhas").
   - §9.4 linhas RESOLVIDO (Deploy Edge Functions, DB Live Guard, Branch Hygiene, Contexto) → mesmos run IDs já na main: `git grep -c` em `origin/main -- RELATORIO_CI.md` → `43143197204`=3, `42678012070`=3, `42582604190`=3, `43167727048`=1 (§7.1 em `:263-265`, §10.3 em `:363-365`).
3. §9.1 (PR #2975): `git merge-base --is-ancestor 1616f7b73a2bbdf5d3e131e9faba827c014e7a45 origin/main` → **verdadeiro**; o próprio commit `1616f7b73 docs(ci): inventário completo workflows + registra types-sync em PENDENCIAS` está no `git log origin/main -- RELATORIO_CI.md`. O merge é fato do histórico, não precisa de linha em relatório.
4. Único dado realmente ausente na main que eu confirmei: o id de deploy Vercel `dpl_HF4JUtn5eg3mBxwwNGjMi1KLbiQ4` (`git grep` em `origin/main` = 0 hits, repo inteiro). Valor **baixo**: confirma deploy de um commit docs-only ("toca apenas `scripts/`, `PENDENCIAS.md`, `RELATORIO_CI.md`", palavras da própria branch), já substituído por todos os deploys posteriores — não é lacuna que mude decisão. Também ausentes os run IDs transitórios #43179026361/274/184/812 e #43179048693, todos com desfecho já registrado por runs mais novos (itens 2).
5. Conflito mecânico confirmado: a main já tem "## 9." em `RELATORIO_CI.md:297` ("Sub-sessão 2026-11-12T09:xx — PRs #2982 e #2983", commit `15923813a`), "## 10." em `:342` e "## 11." em `:379`. Aplicar o hunk hoje enfiaria um §9 duplicado e desatualizado entre o §8 e o §9 atuais.

Nenhuma lacuna adicional. Veredito final: **OBSOLETA**.
