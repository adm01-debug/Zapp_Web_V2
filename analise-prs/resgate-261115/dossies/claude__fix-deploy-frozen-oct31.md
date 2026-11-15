# Dossiê — `claude/fix-deploy-frozen-oct31` (PR #2409)

- Ref: `origin/claude/fix-deploy-frozen-oct31` · tip `6521a05f` · merge-base `668d7732` (2026-10-30)
- Pré-classificação mecânica: MISTO_CONFLITO · triagem anterior (2026-11-08): OBSOLETA
- **Veredito: OBSOLETA** (fix funcional já está na main por outro caminho; docs superadas) · **apagar branch: seguro**

## Propósito
Destravar `deploy-functions.yml`, que falhava em `deno check` com `TS2307: Cannot find module '@types/node'`
(`@types/ws` tem `/// <reference types="node" />`; `scripts/ci/deno.lock` sem entradas npm → `deno install --frozen` não instalava).
Commits úteis: `1da2cfe31`, `8e60103ef`, `4a7455896` (fix) + `4eee4aacf`, `780ff262d`, `b27f5cb5c` (docs de rodada de CI).

## Arquivo × achado × evidência

| Arquivo | O que a branch fazia | Estado na main | Achado |
|---|---|---|---|
| `.github/workflows/deploy-functions.yml` | `deno install --config supabase/functions/deno.json --frozen=false` | `origin/main` l.488: `cd supabase/functions && deno install --frozen=false` + l.489 `npm --prefix supabase/functions install --no-save @types/node@25.9.9`; l.494 `deno check --config supabase/functions/deno.json ...`. Entrou por `8ba0b4361` (#2567, 2026-11-02), `84b8b149e` (#2575, GR-001) e `c5650d887` (#2855, 2026-11-10) | **INCORPORADA** (forma mais completa) |
| idem | troca `"\U0001F3E5 Verificação..."` por emoji literal `🏥` | main l.597 mantém `\U0001F3E5` — escape YAML válido, mesmo texto renderizado | **sem lacuna** (cosmético, equivalente) |
| `supabase/functions/deno.json` | adiciona `imports: {"@types/node": "npm:@types/node@^22"}` e reformata | `origin/main:supabase/functions/deno.json` já tem `"imports":{"@types/node":"npm:@types/node@25.9.9"}` (versão pinada, melhor que `^22`); `scripts/ci/deno.lock` l.54 tem `@types/node@26.6.6` (lockfile já com npm) | **INCORPORADA** |
| `PENDENCIAS.md` | itens 1–4 datados de 2026-10-31 (DB Live Guard, Copilot firewall, PR #2409 em andamento, lockfile npm vazio) | Arquivo reescrito na main (`1d4702804`, cabeçalho "PENDÊNCIAS CI — 2026-11-12"); l.18 registra DB Live Guard `conclusion=success`; item 3 (PR #2409) e item 4 (lockfile sem npm) resolvidos por #2567/#2855 + deno.lock com npm | **OBSOLETA** |
| `RELATORIO_CI.md` | "Round 2 — 2026-10-31" (inventário, baseline, diagnóstico, tabela de prova do #2409) | Arquivo reescrito na main (`cb6576b2a`; cabeçalho "fix-ci-workflows-261112-0400", 464 linhas, sem menção ao Round 2/#2409); relatório de uma PR que nunca mergeou | **OBSOLETA** |

## Lacunas residuais
- `RELATORIO_CI.md` Passo 6 item 2 sugeria `paths-ignore: ['**/*.md']` no `ci.yml` — nunca implementado na branch nem na main (`git show origin/main:.github/workflows/ci.yml | grep paths-ignore` → vazio). É apenas uma ideia anotada em doc, não código; valor baixo e já era declarada "não implementada" pela própria branch. Não conta como trabalho perdido.

## Conclusão
Nenhuma linha de código útil a portar. O fix de CI entrou na main por #2567 + #2575 + #2855 em forma mais robusta
(`npm install` explícito + versão pinada + `--config`), e os dois `.md` descrevem um estado de CI de 2026-10-31 que foi
substituído integralmente. Branch pode ser apagada.

---

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA**. Tentei refutar hunk por hunk e não achei nada de valor ≥ médio fora da main.
Main verificada em `dac285f62`.

### 1. `supabase/functions/deno.json` — coberto, main é superior
- Branch: `"@types/node": "npm:@types/node@^22"` (range).
- Main (`git show origin/main:supabase/functions/deno.json`): `"@types/node":"npm:@types/node@25.9.9"` — **pinado**, mais seguro que o range da branch.
- `lock`, `nodeModulesDir:"auto"` e `skipLibCheck:true` idênticos. O resto do diff é só reformatação (1 linha → 10 linhas indentadas), zero valor.

### 2. `.github/workflows/deploy-functions.yml` — coberto, main é superior
`git show origin/main:.github/workflows/deploy-functions.yml`:
- linha 488: `cd supabase/functions && deno install --frozen=false` → o `--frozen=false` da branch **está na main**.
- linha 489: `npm --prefix supabase/functions install --no-save @types/node@25.9.9` → passo extra que a branch não tinha.
- linha 494: `deno check --config supabase/functions/deno.json supabase/functions/**/index.ts` → a branch rodava `deno check` **sem** `--config`; a main corrigiu isso (GR-001).
- Procedência: `git log -S'--frozen=false' --oneline origin/main -- .github/workflows/deploy-functions.yml` → `8ba0b4361` (#2567) e `c5650d887` (#2855). Não foi removido de propósito; foi reforçado.

### 3. O único hunk "não coberto" do workflow é cosmético e equivalente
O JSON aponta `removed_still_in_main: 1` para `- name: "\U0001F3E5 Verificação de saúde pós-deploy (5 min)"` (main, linha 597). A branch trocava o escape pelo emoji literal. Em YAML double-quoted `\U0001F3E5` **é** o emoji. Provado parseando o arquivo da main:

```
python3 -I -c "import yaml; d=yaml.safe_load(open('wf-main.yml')); ..."
→ ('deploy', "'🏥 Verificação de saúde pós-deploy (5 min)'")
```

Mesma string após o parse. Valor: nulo.

### 4. Os dois `.md` — substituídos E arquivados; conteúdo não se perdeu
- `PENDENCIAS.md` na main: 445 linhas, cabeçalho `# PENDÊNCIAS CI — 2026-11-12`. `RELATORIO_CI.md` na main: 464 linhas, sessão 2026-11-12. Reescritos integralmente duas semanas depois da branch.
- Mais que isso: o **conteúdo específico** da branch já está na main em `docs/ci/`:
  - `docs/ci/RELATORIO_CI.md:16` documenta a mesma run `41147095645` com a mesma causa raiz (`@types/ws@8.18.1` com `/// <reference types="node" />` forçando `@types/node` ausente do `deno.lock`).
  - `docs/ci/PENDENCIAS.md:17-34` documenta a pendência do `copilot-pull-request-reviewer` (firewall `api.business.githubcopilot.com`, `gh.io/copilot/firewall-config`, "NÃO é required check"), com tabela de runs.
  - `docs/ci/PENDENCIAS.md:11` registra o fix do `deploy-functions.yml` como resolvido (via #2407).
  - A deriva do DB Live Guard (run `41066127274`) está em `docs/_arquivo/RELATORIO_CI.md` e `docs/audits/REVISAO_PLANO_MELHORIAS_2026-10-30.md`; o status atual na main é `PENDENCIAS.md:18` — run `42678012070`, `conclusion=success`, "Resolvido em sessão anterior".
- `removed_still_in_main: 0` nos dois arquivos: nada que a branch apagava sobrevive na main, logo não há risco de reintroduzir texto já descartado.
- Nenhuma referência a `PR #2409` ou `Round 2 — 2026-10-31` existe na main (`git grep -F` vazio): o rastro da branch foi só nos inventários (`docs/_arquivo/analise/inventario-2026-10-31/`).

### 5. Lacunas adicionais
Nenhuma. `gap_lines_total: 136` se resolve em: 6 linhas de deno.json cobertas por versão pinada, 2 linhas de workflow (1 coberta por `--frozen=false` na main, 1 cosmética equivalente), 127 linhas de dois relatórios de CI datados substituídos e arquivados.

**Apagar a branch é seguro.** Mergear essa branch hoje seria regressão: trocaria `@types/node@25.9.9` por `^22`, e o diff de workflow entra em conflito com os passos de `npm install` + `--config` que a main ganhou depois.
