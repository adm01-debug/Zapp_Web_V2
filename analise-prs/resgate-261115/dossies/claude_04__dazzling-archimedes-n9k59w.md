# Dossiê — claude_04__dazzling-archimedes-n9k59w (PR #2527)

**Ref:** `origin/claude_04/dazzling-archimedes-n9k59w` · tip `15d3bb73e` · merge-base `1252bb5a4` · 2 commits (2026-11-01)

## Propósito
Corrigir falha `Could not find "@types/node"` no step `deno check` do `deploy-functions.yml` adicionando `--config supabase/functions/deno.json` (commit `ffc251969`), e atualizar PENDENCIAS.md §3 / RELATORIO_CI.md com o diagnóstico (commit `15d3bb73e`).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/deploy-functions.yml` | **INCORPORADA** — a linha funcional da branch (`deno check --config supabase/functions/deno.json supabase/functions/**/index.ts`) está idêntica na main; só os 3 comentários `# W101:` da branch não entraram (main tem comentário equivalente `# GR-001: --config garante que deno check le nodeModulesDir:"auto"...`). | `git show origin/main:.github/workflows/deploy-functions.yml` linhas 491-494; commit que trouxe o fix: `84b8b149e fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)` (`git log -S'deno check --config supabase/functions/deno.json' origin/main`). Main vai além: step de install faz `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9` (linhas 486-489). |
| `PENDENCIAS.md` | **OBSOLETA** — a branch reescrevia §3 como "fix aplicado, aguardando validação (PR #2527)". Na main o §3 original foi removido e o Deploy Edge Functions consta como resolvido com run verde. | `git show origin/main:PENDENCIAS.md` linha 17: `Deploy Edge Functions | #43143197204 | Resolvido em sessão anterior | conclusion=success confirmado`; linha 116: run `#43189662194` ✅ success. Arquivo reescrito várias vezes depois (`1d4702804`, `b24e31500`, `01122700f`). As 19 linhas que a branch removia já não existem na main (`removed_still_in_main: 0`). |
| `RELATORIO_CI.md` | **OBSOLETA** — a branch trocava cabeçalho (data/branch) e a tabela §6 pela narrativa desta sessão. Main foi reescrito por sessões posteriores (branch `claude/fix-ci-workflows-261112-0400`, linha 5) com estado final diferente. | `git show origin/main:RELATORIO_CI.md` linha 5; últimos commits `cb6576b2a`, `65cf38544`, `15923813a`. `removed_still_in_main: 0`. |

## Veredito
**INCORPORADA** (confiança alta). O único conteúdo funcional (flag `--config` no `deno check`) está na main via PR #2575, numa versão mais completa (cd + npm install explícito). Os dois `.md` eram relato de sessão referenciando a PR #2527 "aguardando validação" — superados pelo estado real da main (workflow verde confirmado). Triagem anterior (2026-11-08) marcou OBSOLETA; a diferença é só de rótulo: o fix entrou por outra PR, os docs ficaram obsoletos.

## Lacunas a recuperar
Nenhuma. Os 3 comentários `# W101` do YAML têm valor nenhum (main já documenta o mesmo com `# GR-001` e `# W101` no step anterior, linhas 480-485). Os 24 linhas de docs são relato datado de uma PR que não foi mergeada.

## apagar_branch_seguro
**true** — todos os arquivos com prova (workflow: linha idêntica na main; docs: alvo reescrito, `removed_still_in_main: 0`).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Branch segura para apagar.** Tentei refutar e não achei um único hunk de valor ≥ médio fora da main.

Conferência independente (não confiei no `line_check` do JSON):

1. **Diff completo da branch** (`git diff 1252bb5a4 15d3bb73e`) = 3 arquivos, 2 commits (`ffc251969` fix do YAML, `15d3bb73e` docs). Única mudança funcional em todo o diff: 1 linha de `run:` + 3 comentários no `.github/workflows/deploy-functions.yml`. Nada em `src/`, `supabase/`, migrations ou edges.
2. **Linha funcional está na main, idêntica**: `git show origin/main:.github/workflows/deploy-functions.yml` linha 494 → `run: deno check --config supabase/functions/deno.json supabase/functions/**/index.ts` — byte a byte igual à linha adicionada pela branch. Entrou por `84b8b149e fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)`; `git log -S'deno check --config supabase/functions/deno.json' origin/main -- .github/workflows/deploy-functions.yml` retorna **só** esse commit, ou seja o fix nunca foi revertido nem removido depois.
3. **Main é estritamente superior**: o step de install (linhas 473-489) faz `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9` — a branch só tinha `deno install --config …` sem `cd` e sem o npm explícito. Ou seja, aplicar a branch hoje seria regressão, não ganho.
4. **Os 3 comentários `# W101:` da branch**: main documenta a mesma causa raiz no mesmo ponto (linhas 492-493, `# GR-001: --config garante que deno check le nodeModulesDir:"auto" … e encontra @types/node em node_modules/`) e ainda mantém `# W99`/`# W100`/`# GR-001`/`# W101` no step anterior (475-485). Conteúdo informativo equivalente; valor incremental = nenhum.
5. **PENDENCIAS.md** — não é lacuna, é texto vencido. A §3 que a branch reescrevia ("fix aplicado, aguardando validação … PR #2527 aberta") não existe mais na main: o arquivo foi reorganizado e hoje registra o problema como **resolvido com prova** (`origin/main:PENDENCIAS.md:17` → `Deploy Edge Functions | #43143197204 | Resolvido em sessão anterior | conclusion=success confirmado`; `:116` → run `#43189662194` ✅ success). Os títulos `## ` atuais da main não contêm nenhuma seção de deploy-functions pendente. Escrever "aguardando validação da PR #2527" na main hoje seria **piorar** a documentação.
6. **RELATORIO_CI.md** — idem. Main foi reescrito do zero por sessão posterior (`origin/main:RELATORIO_CI.md:1-5`, branch `claude/fix-ci-workflows-261112-0400`); a tabela §6 que a branch editava não existe mais (grep por `fila-merge`, `reconcile`, `fix/ci-workflows` na main: **zero** ocorrências). As 19+9 linhas que a branch removia já não estão na main (`removed_still_in_main: 0` confirmado pelo grep).
7. **Risco de apagar**: PR #2527 está **`state=closed`, `merged_at=null`, fechada em 2026-11-02T01:04:50Z** (GitHub MCP `github_get_pull_request` 2527). Não há PR aberta presa a essa branch — apagar não fecha nada nem perde revisão pendente.

Nenhuma lacuna adicional. Nada a recuperar.
