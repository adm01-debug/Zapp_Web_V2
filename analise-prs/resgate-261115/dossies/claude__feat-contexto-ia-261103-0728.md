# Dossiê — claude__feat-contexto-ia-261103-0728 (PR #2661)

**Ref:** `origin/claude/feat-contexto-ia-261103-0728` · tip `f1614500e` · merge-base `818f76b35` · 6 commits (2026-11-03)
**Veredito:** INCORPORADA (superada/absorvida pelo PR #2664 `f798a8826`) · confiança alta · apagar branch: **seguro**

## Propósito
Primeira versão do "contexto vivo para agentes de IA": gerador `scripts/ai-context/gerar.mjs` (+ testes `gerar.unit.mjs`, `cenarios.mjs`), workflow `contexto-ia.yml` (10 min + push em main) publicando `inventario/ia/*` numa branch derivada `contexto-ia`, mais ajustes de docs/CI (contagem de 19 workflows), `.gitignore`, `package.json`, `vercel.json`, `CLAUDE.md`.

A PR #2661 não foi mergeada (tip não é ancestral de `origin/main`), mas o PR #2664 (`f798a8826 feat(ia): contexto unificado para agentes — um workflow (codigo + banco + regras), um índice, uma branch contexto`) trouxe o mesmo gerador (ampliado) e um workflow sucessor `contexto.yml`, trocando `contexto-ia`/`inventario/ia` por `contexto`/`docs/contexto/codigo`. `git log --oneline origin/main --grep='#2661'` → vazio; `git log --diff-filter=A origin/main -- scripts/ai-context/gerar.mjs` → `f798a8826`.

## Arquivo × achado × evidência

| Arquivo | Status JSON | Achado | Evidência na main |
|---|---|---|---|
| `.github/workflows/contexto-ia.yml` | NEW_FILE_ABSENT | **Substituído** por `.github/workflows/contexto.yml` (mesmo propósito, 3 produtores, branch `contexto`) | `git ls-tree origin/main .github/workflows/` lista `contexto.yml`; cabeçalho linhas 1-25 descreve gatilho push+cron+dispatch, branch `contexto`, anti-loop, Vercel; histórico: `f798a8826`, `b46f5d291`, `7991a1f47`, `49af49e25`, `6d420265e` (cron virou 1x/hora) |
| `.gitignore` (`inventario/ia/`) | BOTH_CHANGED/CONFLICT | Intenção presente com o novo caminho | `origin/main:.gitignore:136-140` — `# gerado pelo contexto.yml na branch contexto (nunca em main)` + `docs/contexto/*` |
| `CLAUDE.md` (linha da tabela `inventario/ia/`) | CONFLICT | CLAUDE.md da main é só `@AGENTS.md`; AGENTS.md documenta a branch `contexto` e o comando de leitura | `origin/main:AGENTS.md:85-89,99` (`git show origin/contexto:docs/contexto/00-INDEX.md`) |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (**19** workflows) | CONFLICT | Contagem já reatualizada (hoje **21**) | `origin/main:docs/audits/PLANO…md:78` — "medido em 2026-11-14 … **21** arquivos YAML" |
| `docs/ci/README.md` (linha + seção do `contexto-ia.yml`, "19 workflows") | CONFLICT | Entrada equivalente para `contexto.yml`; contagem 21 | `origin/main:docs/ci/README.md:7` (`**21 workflows.**`), `:15` (linha da tabela), `:63-68` (seção), `:190-191` (nao-e-bug) |
| `package.json` (`contexto:ia`) | CONFLICT | Script existe, com `--out docs/contexto/codigo`, mais `contexto:ia:test` | `origin/main:package.json:34-35` |
| `scripts/ai-context/cenarios.mjs` | IDENTICAL | Byte a byte igual | PRESENT_BYTE |
| `scripts/ai-context/gerar.mjs` (25 linhas "ausentes") | CONFLICT | Todas as 25 são linhas **refatoradas** na main, mesma função: `execSync`→`execFileSync` com args em array (hardening `#2773`), `readText` com fd, `TEST_RE` ampliado (`fixtures`), `sqlFiles`/`migDir` via `isCurrentSql`, `FILE.entries()`→`appFiles`, rodapé `Publicado na branch contexto-ia` → `PUBLICACAO` configurável (teste em `gerar.unit.mjs:255` proíbe `contexto-ia` fixo) | `origin/main:scripts/ai-context/gerar.mjs:18,40,46,52,97,461,482,591,607-608,623,764,773,788-792,38,852` |
| `scripts/ai-context/gerar.unit.mjs` | CONFLICT, missing 0 | Tudo da branch está na main (main tem 23 `test(` vs 12 na branch) | line_check `missing_in_main: 0` |
| `scripts/ci/ci-docs-baseline.unit.mjs` (asserts `19`) | CONFLICT | Contagem fixa foi trocada por `totalYaml` dinâmico lido de `.github/workflows/` | `origin/main:scripts/ci/ci-docs-baseline.unit.mjs:39-48` |
| `vercel.json` (`git.deploymentEnabled.contexto-ia:false`) | ABSENT_APPLIES_CLEAN | **Obsoleto**: a main resolve o mesmo problema escrevendo um `vercel.json` próprio na branch publicada (`ignoreCommand: exit 0`, `deploymentEnabled.contexto:false`); a chave `contexto-ia` em `main` não serviria porque a branch `contexto-ia` não existe mais | `origin/main:.github/workflows/contexto.yml:23,381-383`; `git log -S'deploymentEnabled' origin/main -- vercel.json` → vazio (nunca entrou e não é necessário) |

## Lacunas a recuperar
Nenhuma. O único hunk sem equivalente literal (`vercel.json`) é obsoleto por design (ver linha acima). Nada de banco/edge/src envolvido (`counts.migrations=0, src=0, edges=0`).

## Observação
A triagem de 2026-11-08 marcou #2661 como `JA_NA_MAIN`; confirmado aqui com evidência por arquivo. A branch `contexto-ia` remota (se ainda existir) também é lixo: o workflow vigente publica em `contexto`.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** Nenhum commit posterior da branch desfez proteção, validação, teste ou
funcionalidade. Os 4 achados (345 linhas) são as três reescritas internas do próprio gerador, e a intenção de
todas sobrevive em `origin/main:scripts/ai-context/gerar.mjs` em forma igual ou mais forte. Apagar a branch
continua seguro.

Ordem dos commits (`git log --oneline --no-merges 818f76b35..origin/claude/feat-contexto-ia-261103-0728`):
`2fe27059f` (v1, 641 linhas novas) → `1fbdeee8e` (v2 genérico, +645/−387) → `540d46212` → `9553b333b` →
`8292481fd` → `f1614500e` (ponta). Nenhum título promete segurança/correção e remove linha: todos são
`feat(ia)`/`fix(ia)` de iteração do mesmo gerador. Nada de `src/`, edge, migration ou RLS no caminho.

| Achado | Quem removeu | Por que | Evidência na main |
|---|---|---|---|
| `2fe27059f` · `gerar.mjs` · 299 linhas | `1fbdeee8e` ("gerador v2 genérico") | Reescrita v1→v2: `FORMAT_VERSION` 1→2, hardcodes do repo (`RealtimeInboxView`, `lazyViews`, `SRC_DIR`, `LOGIC_RE`) trocados por detecção genérica | Seções do v1 (walk, hooks, rotas, menu, módulos, componentes, edges, banco, scripts/workflows, testes, lógica, grafo, baseline) todas presentes: `main.mjs` tem as 24 `secao(...)` e `baseline` em `:785-822`; `FORMAT_VERSION = 2` em `:20`; `LOGIC_RE`→`camadaDe`/`LOGIC_KINDS` `:703-708`; `buckets_usados`→`AGG_KEYS` `:258`; `arestas_lista`→arquivo próprio `grafo-arestas.json` `:840`; `createBrowserRouter/HashRouter`→regex única `:319`; `execSync`→`execFileSync` (hardening #2773). Dos 807 identificadores do v1, só 56 faltam na main e são prosa PT-BR do INDEX.md, locais (`migs`, `tablesIdx`, `outRel`) ou renomeações (`tabelas_usadas_no_codigo_sem_migration`→`tabelas_usadas_sem_definicao`, `definida_em_migration`→`definida`, `edgesNoCodigoSemPasta`→`edgesSemPasta`) |
| `1fbdeee8e` · `gerar.mjs` · 39 linhas | `540d46212`, `9553b333b`, `8292481fd`, `f1614500e` | Cada uma substituída no mesmo lugar por versão mais ampla | `role` regex `main.mjs:190`; `lazy` com `async`/`await import` `:297`; `routeFiles` com filtro de pasta de fonte `:319`; `path=` + `path:` via spread `:327`; `re2` de rota-objeto `:345` |
| `1fbdeee8e` · `gerar.unit.mjs` · 5 linhas | `540d46212` | Fixtures e asserts fortalecidos no mesmo teste (ex.: `['createdAt','id','name','phone']` → inclui `lat`/`created2` com tipos multi-palavra; sidebar ganhou `roles: STAFF` e `EXTERNAL`) | Nenhum teste perdido: main tem 23 `test(` contra 12 na ponta da branch (`line_check missing_in_main: 0`) |
| `540d46212` · `gerar.mjs` · 2 linhas | `8292481fd` | Split de SQL por `;` ingênuo trocado por `splitStatements` ciente de aspas — mais correto | `main.mjs:464` (`splitStatements`), `:491-492` (`bodyStatements` + `for (const stRaw of [...splitStatements(sqlNoBody), ...bodyStatements])`), aviso de `ddl_dinamico` `:581` |

Único detalhe sem equivalente: o v1 listava `performance-budget.json` na lista fixa de arquivos de config
(`v1:472`); a main detecta configs por regex genérica (`main.mjs:647`) que não casa esse nome, e o arquivo
existe no repo (`git ls-tree origin/main` → `performance-budget.json`). Efeito: uma linha a menos no
inventário gerado (`ferramentas.json`, publicado na branch `contexto`). Valor para o negócio: nenhum; não é
código de produto nem proteção.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar hunk por hunk e não achei nenhum item de valor ≥ médio
fora da `main`. Apagar a branch continua seguro.

Refutações tentadas e o que elas mostraram:

1. **"As 25 linhas de `gerar.mjs` podem ser lógica perdida, não refatoração."** Recomputei o conjunto
   (`git diff 818f76b35 origin/claude/feat-contexto-ia-261103-0728 -- scripts/ai-context/gerar.mjs`, linhas `+`
   ausentes da `main` por texto exato): 25, igual ao JSON. Cada uma tem par funcional na `main`, igual ou mais
   forte: `execSync`→`execFileSync` com args em array (`origin/main:scripts/ai-context/gerar.mjs:46`, mesmo
   padrão em `:764,788-792`), `readText` com fd + `finally` (`:40`), `TEST_RE` com `fixtures|__fixtures__` a
   mais (`:97`), `migDir`/`sqlFiles` via `isCurrentSql` (`:461,482`), `FILE.entries()`→`appFiles`
   (`:591,607-608,623`), `tabelasUsadas` (`:578-579`), `expr.startsWith('[')` com escape de regex completo
   (`:413`), `const y = readText(f)` + `replace(/\r\n/g,'\n')` (`:627`), rodapé fixo `contexto-ia` →
   `PUBLICACAO` configurável (`:37-38,852`), comentário de config com `publicacao` a mais (`:12`).
   Contagem de ocorrências por identificador na `main` vs branch: idêntica para os 18 identificadores
   verificados (`stripComments`, `TEST_RE`, `protegida`, `migDir`, `sqlFiles`, `rpcs_usadas_no_codigo`,
   `edgesSemPasta`, `gitInfoCommit`, `autores_30d`, `pastas_mais_mudadas_30d`, `arquivos_mais_mudados_90d`,
   `arquivos_mudados_7d`, `ultimos_commits`, `tabelasUsadas`, `chamadaPorEdges`, `callers`, `FORMAT_VERSION`),
   e `execFileSync` só existe na `main` (0 na branch). Zero linha de lógica sem destino.
2. **"O workflow `contexto-ia.yml` (119 linhas, ausente na main) pode ter capacidade que o `contexto.yml` não
   tem — principalmente graphify e controle de custo."** Falso: `origin/main:.github/workflows/contexto.yml`
   (421 linhas) tem o cache de AST (`:137-144`, mesma action pinada `actions/cache@55cc834`), o passo graphify
   com o mesmo `GRAPHIFY_VERSION: '0.9.68'` e `uvx --from graphifyy[sql]` (`:146-154`), a cópia do
   `GRAPH_REPORT.md` para o contexto publicado (`:159`), o input `graphify` de dispatch (`:48-49`) e o gate de
   custo em forma mais nova — filtro `STRUCTURAL` que só commita quando algo estrutural mudou (`:391`).
   Branch `contexto-ia` não existe mais no remoto (`git branch -r --list 'origin/contexto*'` → só
   `origin/contexto`).
3. **"O hunk de `vercel.json` (`deploymentEnabled.contexto-ia: false`) é um hunk real não coberto."**
   Confirmei que é obsoleto por dois motivos independentes: (a) a chave nomeia uma branch que não existe mais;
   (b) a `main` resolve o problema no lugar certo — `contexto.yml:382-383` escreve
   `{ "ignoreCommand": "exit 0", "git": { "deploymentEnabled": { "contexto": false } } }` dentro da branch
   publicada, e a Vercel lê o `vercel.json` do commit deployado. O `vercel.json` da raiz na `main` segue sem
   bloco `git` (`git show origin/main:vercel.json`) e não precisa dele.
4. **"As contagens de workflow (19) podem ter sido perdidas."** `git ls-tree --name-only origin/main
   .github/workflows/` → **21** arquivos; `docs/ci/README.md:7` = `**21 workflows.**`,
   `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:78` = `**21** arquivos YAML (medido em
   2026-11-14)`. Os asserts fixos `19` da branch seriam regressão: `origin/main:scripts/ci/
   ci-docs-baseline.unit.mjs:39-48` passou a derivar de `totalYaml`.
5. **"Testes podem ter sido perdidos."** `gerar.unit.mjs` tem `missing_in_main: 0` e a `main` tem 22 `test(`
   contra 11 na ponta da branch; `scripts/ai-context/cenarios.mjs` é byte a byte igual (PRESENT_BYTE).
6. **"Docs/config (`CLAUDE.md`, `.gitignore`, `package.json`) podem ter ficado sem equivalente."**
   `origin/main:.gitignore:136-140` ignora `docs/contexto/*` com exceção para `regras/manual/`;
   `origin/main:package.json:34-35` tem `contexto:ia` (`--out docs/contexto/codigo`) e `contexto:ia:test`;
   `CLAUDE.md` da `main` é só `@AGENTS.md` e `origin/main:AGENTS.md:85-89,99` documenta a leitura da branch
   `contexto`. A linha da tabela apontando `inventario/ia/` seria caminho morto.

**Observação fora do escopo (não é lacuna desta branch):** na `main`, `docs/ci/README.md:15,63` ainda descreve
o `contexto.yml` como "a cada 10 min (minuto 3)", mas o cron real é `3 * * * *` (1x/hora,
`contexto.yml:45`). Divergência doc↔realidade nascida na `main`, não trabalho perdido daqui.
