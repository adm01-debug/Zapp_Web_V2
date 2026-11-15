# Dossiê — claude__fix-fila-merge-retry-json-261101-1605 (PR #2492)

**Ref:** `origin/claude/fix-fila-merge-retry-json-261101-1605` · tip `e5abad156` · merge-base `b94be0a2c` (2026-11-01)
**Commits:** `50c4095f9 fix: fila-merge retry p/ JSON truncado + testes paginação + docs CI` + merge de main.

## Propósito
1. `scripts/ci/fila-merge.mjs`: ampliar `erroTransitorio()` para `timeout expired|unexpected end of JSON` e mover `erroTransitorio/execComRetry` para o topo do arquivo.
2. `ChatMessagesArea.pagination.test.tsx`: mock de `getBoundingClientRect` (spy + `afterAll`), `scrollTo` no `Element.prototype`, `clientHeight` em `Element.prototype`.
3. `PENDENCIAS.md` / `RELATORIO_CI.md`: estado CI de 2026-10-31.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/ci/fila-merge.mjs` | **INCORPORADA e depois REMOVIDA de propósito.** O regex com `timeout expired\|unexpected end of JSON` entrou na main em `3617a2acd` (#2447, 2026-11-01) — `git log -S'unexpected end of JSON' origin/main -- scripts/ci/fila-merge.mjs` → `41853318c`, `3617a2acd`. Versão imediatamente anterior à remoção (`41853318c^:scripts/ci/fila-merge.mjs:29-31`) é idêntica à da branch (função no topo, mesmo regex). Arquivo apagado em `41853318c` (#3113 pacote 6, 2026-11-14) junto com `fila-merge.unit.mjs` e `auto-update-pr-branch.yml`. Motivo: `docs/agentes/github-ci.md:58-62` — workflow desativado pelo dono em 11/11/2026 e removido em 14/11; PR BEHIND agora é atualizada via `github_update_pr_branch`. | `git ls-tree origin/main -- scripts/ci/fila-merge.mjs` vazio; `git grep fila-merge origin/main` só em `docs/_arquivo/` e `analise-prs/`. |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` | **INCORPORADA** via `3617a2acd` (`git log -S'getBCRSpy'`). `origin/main` linhas 15 (`afterAll` import), 54 (`let getBCRSpy`), 58 (`scrollTo = vi.fn()`), 59 (`Element.prototype clientHeight → 600`), 62-65 (spy `getBoundingClientRect` 600×800), 67 (`offsetHeight → 120`), 70-72 (`afterAll mockRestore`). As 3 "missing" são só linhas de comentário reescritas na main (mesmo sentido). | `git show origin/main:<arquivo> \| sed -n 54,72p` |
| `PENDENCIAS.md` | **INCORPORADA e superada.** Versão da branch é byte-idêntica à de `3617a2acd` (#2447): `git diff <branch> 3617a2acd -- PENDENCIAS.md` vazio. Main reescreveu o arquivo depois (`65cf38544` 11/12, `01122700f`, `b24e31500` 11/14, `1d4702804` 11/15 — hoje "PENDÊNCIAS CI — 2026-11-12"). Conteúdo antigo arquivado em `docs/_arquivo/PENDENCIAS.md` (`c570d5d46` #2630). | — |
| `RELATORIO_CI.md` | **INCORPORADA e arquivada.** Byte-idêntica a `3617a2acd` e a `origin/main:docs/_arquivo/RELATORIO_CI.md` (`git diff --stat` vazio, rc=0). `RELATORIO_CI.md` da main hoje é o relatório de 2026-11-12 (`cb6576b2a`). | — |

## Veredito
**INCORPORADA** (confiança alta). Todo o conteúdo da branch entrou na main pela PR #2447 (`3617a2acd`, mesmo dia); a parte de `fila-merge.mjs` foi posteriormente removida junto com todo o mecanismo de fila serial, por decisão do dono (github-ci.md:60-61) — não há nada a recuperar. Docs são histórico já arquivado em `docs/_arquivo/`.

**Lacunas a recuperar:** nenhuma.
**Apagar branch:** seguro (true).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar procurando qualquer hunk de valor ≥ médio fora da main; não encontrei nenhum.

Checagens independentes (repo local, `origin/main` atual, só leitura):

1. **Escopo real da branch** — `git diff --stat b94be0a2c origin/claude/fix-fila-merge-retry-json-261101-1605` → exatamente 4 arquivos (`PENDENCIAS.md`, `RELATORIO_CI.md`, `scripts/ci/fila-merge.mjs`, `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx`), 250 inserções. Commits: `50c4095f9` + merge de main `e5abad156`. Nada escondido fora dos 4 arquivos do JSON.

2. **3 dos 4 arquivos são byte-idênticos ao que entrou na main** — `git diff --stat <branch> 3617a2acd -- PENDENCIAS.md RELATORIO_CI.md scripts/ci/fila-merge.mjs src/.../ChatMessagesArea.pagination.test.tsx` devolve **só** o arquivo de teste (4+/6-). `git merge-base --is-ancestor 3617a2acd origin/main` = 0 → #2447 está na main.

3. **Teste de paginação: diferença é 100% comentário** — `git diff <branch> origin/main -- src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` mostra um único hunk em `beforeAll` (linhas 57-70): mesmas três medidas (`Element.prototype.clientHeight → 600`, spy de `getBoundingClientRect` 600×800, `HTMLElement.prototype.offsetHeight → 120`) e mesmo `scrollTo`; só a redação dos comentários e a ordem das chaves `{get, configurable}` mudam. Zero código executável perdido. As 3 linhas de `missing_sample` são as linhas de comentário reescritas — confirmado.

4. **`scripts/ci/fila-merge.mjs`: removido de propósito, não perdido** — `git ls-tree origin/main -- scripts/ci/fila-merge.mjs` vazio; `.github/workflows/auto-update-pr-branch.yml` também ausente. `git diff --stat <branch>:scripts/ci/fila-merge.mjs 41853318c^:scripts/ci/fila-merge.mjs` vazio → a versão viva imediatamente antes da remoção era **idêntica à da branch** (o regex `timeout expired|unexpected end of JSON` e as funções no topo já estavam lá). Remoção em `41853318c` (#3113, 14/11/2026, "pacote 6"). Decisão do dono registrada em `origin/main:docs/agentes/github-ci.md:58-62`: fila serial "desativada à mão pelo dono em 11/11/2026 depois de 8.312 runs e removida em 14/11/2026", substituída por `github_update_pr_branch`. `git grep -lE 'erroTransitorio|execComRetry' origin/main -- scripts .github` → vazio: nada na main depende do helper, logo não há como "reaproveitar" o retry sem ressuscitar um mecanismo que o dono matou. Reintroduzir seria contrariar regra vigente.

5. **Docs não estão perdidas** — `git diff --stat <branch>:RELATORIO_CI.md origin/main:docs/_arquivo/RELATORIO_CI.md` vazio (byte-idêntico, arquivado). Conteúdo de `PENDENCIAS.md` da branch sobrevive em `origin/main:docs/_arquivo/PENDENCIAS.md` (superconjunto, +294 linhas) e as evidências citadas estão também em `docs/ci/PENDENCIAS.md` (`git grep -c -F 41162077590 origin/main` → `docs/_arquivo/RELATORIO_CI.md:1`, `docs/ci/PENDENCIAS.md:4`, `docs/ci/RELATORIO_CI.md:2`). `PENDENCIAS.md`/`RELATORIO_CI.md` na raiz da main são os relatórios de 12/11/2026 — sucessão normal de doc de estado, não deleção de trabalho.

**Lacunas adicionais: nenhuma.** **Apagar branch: seguro.**
