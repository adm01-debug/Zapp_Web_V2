# Triagem — `claude/fix-z017-z020-auth-cors-261018-1950` (PR #2771)

- **tip:** `930d57a1ddf1be87ee240f97f344e27d92f0f226` · **merge_base:** `e322d379484859a86c5965a1207e29032ced5321` (2026-10-18)
- **ahead:** 14 commits · último commit 2026-11-07
- **Veredito: OBSOLETA** · confiança **alta** · `apagar_branch_seguro: true`
- Pré-classificação mecânica dizia MISTO_CONFLITO com 139 arquivos / 4634 linhas em lacuna. Verificado: **o volume é artefato de auditoria (137 de 141 arquivos), não código**.

## Propósito real da branch

Dois commits distintos, colados na mesma branch:

1. `df97e3a13 fix(security): Z018+Z020` — o fix de verdade: 2 edge functions (`external-db-proxy`, `cleanup-rate-limit-logs`) param de expor `error.code` do PostgREST em 502 e passam a usar `internalErrorResponse` no catch (CodeQL `js/stack-trace-exposure`).
2. `93ffea2cc … 930d57a1d` (13 commits) — despejo da auditoria de PRs de 23–24/10/2026: `analise-prs/` (128 dossiês + 3 baselines + `prs.json`/`prs.csv`/`progresso.json`/`regras-de-negocio.md`/`RELATORIO_PRS.md`), recriação de `.github/workflows/auto-update-pr-branch.yml`, `docs/ci/README.md` e `.gitignore`.

Nada sobre **Z017** nem sobre **CORS** apesar do nome da branch — `git diff --stat` não toca nenhum arquivo de auth/CORS.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/external-db-proxy/index.ts` | **INCORPORADO byte a byte**, comentários inclusive | `origin/main:…:121-122` (`// Z018: não expor código interno…` + `json({ error: 'External update failed' }, 502…)`), `:191-192` (mesmo para query), `:201-203` (`// Z020: usar internalErrorResponse…` + `return internalErrorResponse(error, req)`), `:2` import. Entrou por `e02888738` = **PR #2794** (ancestral de `origin/main`, confirmado por `git merge-base --is-ancestor`) |
| `supabase/functions/cleanup-rate-limit-logs/index.ts` | **INCORPORADO byte a byte** | `origin/main:…:2` (import com `internalErrorResponse`), `:131-133` (comentário Z020 + `return internalErrorResponse(error, req);`). Mesmo PR #2794 |
| ↑ resíduo dos 2 acima | **OBSOLETO — a branch é mais ANTIGA que a main** | único diff `origin/main` ↔ branch nesses arquivos é o import: branch `https://esm.sh/@supabase/supabase-js@2.87.1`, main `npm:@supabase/supabase-js@2.87.1`. A main migrou de propósito: `7f3c25944 infra: migra imports esm.sh para npm specifiers nas edge functions (#2753)` e `71123cc07 fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes (#2865)`. Hoje: **57 edges com `npm:`, 0 com `esm.sh`**. Portar a branch *reverteria* a migração |
| `.github/workflows/auto-update-pr-branch.yml` (184 linhas, ausente na main) | **OBSOLETO — removido de propósito da main** | `41853318c chore(pacote): pacote 6 … (#3113)`, 14/11/2026, ancestral de `origin/main`, apaga **`auto-update-pr-branch.yml` (-215), `scripts/ci/fila-merge.mjs` (-204) e `fila-merge.unit.mjs` (-167)** no mesmo commit. O workflow da branch *chama* `scripts/ci/fila-merge.mjs`, que não existe mais (`git ls-tree origin/main scripts/ci/fila-merge.mjs` → vazio). Recriar = workflow quebrado + contradiz a decisão vigente. Motivo documentado na main por esse commit em `PENDENCIAS.md` e `docs/agentes/github-ci.md` (“O substituto **era** o `auto-update-pr-branch.yml` (fila serial via `fila-merge.mjs`)”) |
| `docs/ci/README.md` (`-11` → `+16 workflows.`) | **OBSOLETO** | arquivo **gerado** por `scripts/ci/render-workflow-docs.mjs` com `--check` obrigatório no CI (cabeçalho do próprio arquivo). `origin/main:docs/ci/README.md:7` = `**21 workflows.**`, consistente com os 21 YAMLs em `git ls-tree origin/main .github/workflows/`. O `16` da branch é valor morto de 24/10 |
| `analise-prs/dossies/PR-*.md` (128 arquivos novos) | **OBSOLETO — superado por versão melhor já na main** | são esqueletos mecânicos (`**Arquivos alterados:** 0`, `**Adições:** +0 / Remoções: -0`, veredito de uma linha). A main tem **196 dossiês** em `docs/_arquivo/analise-prs/dossies/` (arquivados por `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)`) com análise real — comparei `PR-1930.md`: a da branch tem 17 linhas de stub; a da main tem a seção “As 4 perguntas com evidência”, diff por arquivo e bloqueio. Além disso todas as PRs analisadas (#1922–#2210, out/2026) já foram resolvidas |
| `analise-prs/RELATORIO_PRS.md`, `progresso.json`, `prs.json`, `prs.csv`, `regras-de-negocio.md` | **OBSOLETO — main tem geração mais nova** | a main já reescreveu os 5 com a auditoria de **11–12/11/2026**: `origin/main:analise-prs/RELATORIO_PRS.md:1` = `# Relatório /merge-prs — Zapp Web V2 (sessão de 11–12/11/2026)`; `progresso.json` = `"sessao": "claude/intelligent-wright-oto3y0", "atualizado": "2026-11-12T08:20Z"`. A branch escreveria por cima com dados de 23/10 |
| `analise-prs/baseline/{ci-baseline,ci-state,main-ci-status}.md` | **OBSOLETO** | baselines de CI de `main@17976eb8`/`328a475`/`a9ddd2f9` (23–24/10) listando 4 testes vermelhos de `FilesTab.fase6`/`ChatMessagesArea` que já não são o estado da main. A main mantém só `analise-prs/baseline/main.json` |
| `.gitignore` (+3 linhas) | **única lacuna real que ainda faz sentido** — valor **baixo** | `git grep "package-lock" origin/main -- .gitignore` → sem resultado (exit 1); `origin/main:.gitignore` só tem `deno.lock`/`npm-debug.log*`. Mas `git ls-tree origin/main -- package-lock.json` → vazio: o arquivo **não está rastreado**, então a ausência da regra não causa dano hoje. Higiene |

## Lacuna a recuperar (a única)

`.gitignore` — acrescentar no fim do arquivo (hunk exato, `git diff {MB} {REF} -- .gitignore`):

```diff
@@ -128,3 +128,6 @@ docs/design/*.png
 # Worktrees isolados de agentes (Agent tool, isolation: worktree) — efêmeros, nunca versionar
 .claude/worktrees/
 .vercel
+
+# npm lockfile (projeto usa bun; package-lock.json é artefato acidental)
+package-lock.json
```

É todo o conteúdo não incorporado que ainda faz sentido. Fica registrado aqui na íntegra — **a branch pode ser apagada sem perda**.

## Por que não é DECISAO_DONO

Nenhuma lacuna cria custo externo recorrente nem contradiz regra vigente em sentido oposto. O workflow e o `docs/ci/README.md` *seguem* a decisão da main (que foi remover a fila serial) ao serem descartados; mantê-los é que contradiria.

## Verificação adversarial

Papel: refutar o veredito OBSOLETA. Resultado: **não refutado — CONCORDO com OBSOLETA**. Revisei os 141 arquivos do `git diff e322d379 origin/claude/fix-z017-z020-auth-cors-261018-1950` (somente leitura).

### 1. O fix de segurança está na main (confirmado independentemente)
`git diff origin/main origin/claude/...-261018-1950 -- supabase/functions/external-db-proxy/index.ts supabase/functions/cleanup-rate-limit-logs/index.ts` devolve **apenas 2 hunks, ambos na linha 1**, e os dois são regressão da branch:
- `external-db-proxy/index.ts:1` — branch `'https://esm.sh/@supabase/supabase-js@2.87.1'` vs main `"npm:@supabase/supabase-js@2.87.1"`.
- `cleanup-rate-limit-logs/index.ts:1` — idem.

Fora dessas duas linhas os arquivos são **idênticos byte a byte** à main: logo todo o conteúdo Z018/Z020 (comentários, `internalErrorResponse`, `json({ error: 'External update failed' }, 502, …)`) já está em produção. Nada a recuperar; portar reverteria a migração `esm.sh→npm:` da main.

### 2. Nenhum arquivo de código-fonte na branch
`git diff --name-only` fora de `analise-prs/dossies/` dá 13 arquivos: os 2 edges acima, `.gitignore`, `docs/ci/README.md`, `.github/workflows/auto-update-pr-branch.yml` e 8 de `analise-prs/`. **Zero arquivos em `src/`, `supabase/migrations/`, `e2e/` ou `scripts/`.** O "Z017/auth-cors" do nome da branch não produziu nenhuma linha no diff final.

### 3. Workflow da fila serial: recriar entregaria workflow quebrado
- `git ls-tree -r --name-only origin/main | grep fila-merge` → vazio. `scripts/ci/fila-merge.mjs` **não existe na main**, e a branch **não o traz** (não está no diff). O YAML da branch depende dele.
- Remoção deliberada: `git show --stat 41853318c` (`chore(pacote): pacote 6 … (#3113)`, ancestral de `origin/main`) deleta os três de uma vez: `auto-update-pr-branch.yml −215`, `fila-merge.mjs −204`, `fila-merge.unit.mjs −167` (586 deleções).
- Reforço: o próprio dossiê da branch (`analise-prs/dossies/PR-2210.md`, seção "Bug identificado pós-merge") registra que o workflow recriado tinha `gh api --arg` inválido na linha 191 — o filtro de branch nunca funcionou.

### 4. `docs/ci/README.md`: portar deixaria o CI vermelho
Arquivo gerado. `origin/main:.github/workflows/ci.yml:154` roda `node scripts/ci/render-workflow-docs.mjs --check`, e `origin/main:scripts/ci/docs-deploy-coerencia.unit.mjs:48` guarda essa linha. Main: **21 workflows**, coerente com os 21 YAMLs (`git ls-tree … .github/workflows | wc -l` = 21). Branch: 16, com descrições de 10/2026 que a main já superou (ex.: "a main nao tem branch protection"). Portar = divergência garantida no `--check`.

### 5. `analise-prs/`: a main tem a auditoria mais nova
- `origin/main:analise-prs/RELATORIO_PRS.md` linha 1: "Relatório /merge-prs — Zapp Web V2 (sessão de 11–12/11/2026)". Branch: "(2026-10-23)". Main é ~3 semanas mais nova.
- Dossiês: main tem **225** (29 em `analise-prs/dossies/` + 196 em `docs/_arquivo/analise-prs/dossies/`) contra 128 da branch. `comm -23` deixa só **10 sem homônimo na main**: PR-1922, 2005, 2061, 2192, 2193, 2198, 2204, 2205, 2207, 2210 — 8 a 25 linhas cada, de PRs de out/2026 todas encerradas. Documentação histórica de valor nulo hoje; não altera comportamento nem decisão.

### 6. `.gitignore`: portar o hunk integral seria PIOR que não portar
`git diff origin/main …` mostra que a versão da branch **apaga regras vigentes da main**: `__pycache__/`, todo o bloco `docs/contexto/*` + exceções de `regras/manual/`, `.ci-local/`, `.env.ci.local`, `audit-report.txt`, `audit-status.txt` — e reintroduz os typos `*.jsproj` (main: `*.njsproj`) e ``*` `` / `**~` (main: `*~`). Útil mesmo: só as 2 linhas de `package-lock.json`. E `git ls-tree -r --name-only origin/main | grep -x 'package-lock.json'` → **não rastreado**, então a regra não previne nada hoje. Valor baixo confirmado.

### Conclusão
Nenhum hunk de valor ≥ médio fora da main. Nada toca WhatsApp/Evolution, inbox, envio, contatos, login, RLS ou migrations. Veredito mantido: **OBSOLETA**; apagar a branch é seguro.
