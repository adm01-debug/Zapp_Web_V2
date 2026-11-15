# claude_pink/dreamy-wright-j0bser — PR #2284

- `ref`: `origin/claude_pink/dreamy-wright-j0bser` · tip `b6222cd8e` · merge_base `148e9e5b6` (2026-10-27)
- PR #2284 "chore(analise-prs): auditoria de 100 PRs abertas — dossiês, relatório e regras de negócio" — **CLOSED, merged=false** (github_graphql)
- Pré-classificação mecânica: MISTO_CONFLITO · 107 arquivos, 2811 linhas em lacuna

## Propósito

4 commits, **só artefato de análise**, zero código:

```
b6222cd8e chore(analise-prs): 100 dossiês individuais de PRs abertas
755f7d5db chore(analise-prs): relatórios e regras de negócio — 100 PRs analisadas
676926192 chore: adiciona inventário de PRs abertas (100 total)
980ca5024 chore: inicia workspace de análise de PRs abertas
```

`git diff --name-only 148e9e5b6 origin/claude_pink/dreamy-wright-j0bser | grep -v '^analise-prs/' | wc -l` → **0**.
Diretórios tocados: `analise-prs`, `analise-prs/baseline`, `analise-prs/dossies`. Nada em `src/`, `supabase/`,
`scripts/`, `.github/`. Total: 107 arquivos, 3460 inserções, 0 remoções.

O conteúdo é o retrato do backlog de PRs em **2026-10-27**: inventário de 100 PRs abertas (#2087–#2279),
100 dossiês de 12 linhas cada, um relatório que declara **"Mergeadas: 0"** por "dependência circular de CI"
(check `Contrato DB offline`, `novas=12`) e pede "Ação necessária do Joaquim".

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `analise-prs/dossies/PR-*.md` (100 arquivos) | Versão **mais pobre** de dossiês que a main já arquivou | Os 100 basenames existem em `origin/main:docs/_arquivo/analise-prs/dossies/<mesmo nome>` (100/100, verificado por `git ls-tree -r origin/main -- docs/_arquivo/analise-prs/dossies`). O da main é a auditoria de 2026-10-26, com diff lido e SHA verificado; o da branch confessa `**head_sha**: unknown (bulk API não retorna)` e repete o mesmo texto de 12 linhas em todos (ver comparação de `PR-2087.md` abaixo) |
| `analise-prs/RELATORIO_PRS.md` | CONFLICT — sobrescreveria o relatório **vivo** da main | `origin/main:analise-prs/RELATORIO_PRS.md` = "Relatório /merge-prs — sessão de 11–12/11/2026", PRs #2553–#2973, "CI no SHA do merge: todos os checks `success`". Versão arquivada do relatório de outubro: `origin/main:docs/_arquivo/analise-prs/RELATORIO_PRS.md` |
| `analise-prs/prs.csv`, `analise-prs/prs.json` | CONFLICT — inventário mais pobre que o da main | Branch: header `numero,titulo,draft,head_sha,base_sha,mergeable_state,verdict` com `head_sha=unknown` em todas as linhas. Main: header `number,title,draft,branch,created_at,updated_at,user,labels,merge_candidate,has_migration_in_body,has_edge_fn_in_body,has_workflow_in_body,rule8,html_url,sha` — com SHA real |
| `analise-prs/regras-de-negocio.md` | CONFLICT — a main tem **superset** | `origin/main:analise-prs/regras-de-negocio.md` traz os 8 critérios de elegibilidade, a tabela completa da Regra 8 e a lista "O que NÃO fazer"; a da branch é um resumo dos mesmos 6 checks + squash-only + workflows proibidos, mais o parágrafo histórico do bloqueio de 2026-10-27 |
| `analise-prs/baseline/lint.txt` | Log de **falha de ambiente**, não baseline útil | Conteúdo: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@eslint/js'` — rodou sem `bun install`. Homônimo já arquivado em `origin/main:docs/_arquivo/analise-prs/baseline/lint.txt` |
| `analise-prs/baseline/typecheck.txt` | Idem | `error TS2688: Cannot find type definition file for 'node'` / `Cannot find module 'vite'` — dependências ausentes. Homônimo em `origin/main:docs/_arquivo/analise-prs/baseline/typecheck.txt` |
| `analise-prs/baseline/main-sha.txt` | Ponteiro para uma main de 507 commits atrás | Conteúdo: `e1f2ee4dd9481e7d4165edbd6c6bf9e94f8fdc62`. `git rev-list --count e1f2ee4..origin/main` → **507** |

### Comparação que fecha o caso (PR-2087.md)

Branch (`git show origin/claude_pink/dreamy-wright-j0bser:analise-prs/dossies/PR-2087.md`):

```
# PR #2087 — fix(test): mock de supabase.rpc ausente ao buscar em GmailInboxView.paginacao
**head_sha**: unknown (bulk API não retorna)
**verdict**: SKIP_BLOCKED_CI
## Análise
1. **Ainda válido?** Sim — fix de mock de RPC em teste
...
```

Main (`git show origin/main:docs/_arquivo/analise-prs/dossies/PR-2087.md`): 40+ linhas, veredito
`MERGEAR_SE_CI_VERDE`, base `main@2d97c44`, arquivo alterado nomeado
(`src/components/gmail/__tests__/GmailInboxView.paginacao.test.tsx`), as 4 perguntas respondidas com o
diff lido e o trecho do mock (`vi.mocked(supabase.rpc).mockResolvedValue(...)`).

## Por que OBSOLETA

1. **Zero código** — nenhum arquivo fora de `analise-prs/`; não há bug corrigido, rota, hook, edge, migration nem teste a recuperar.
2. **O objeto da análise não existe mais.** As PRs analisadas estão todas fechadas sem merge — amostra por `github_graphql`: #2087 `CLOSED/merged=false`, #2090 `CLOSED/merged=false`, #2274 `CLOSED/merged=false`, #2244 `CLOSED/merged=false`, #2284 (a própria) `CLOSED/merged=false`. Os dois PRs que o relatório aponta como "fix do bloqueio sistêmico, dependência circular → requer intervenção humana" (#2274 e #2244) foram fechados.
3. **O bloqueio que o relatório documenta foi resolvido.** `origin/main:analise-prs/RELATORIO_PRS.md` (sessão 11–12/11/2026) registra merge com "todos os checks `success`"; o backlog migrou para #2553–#2973.
4. **A memória histórica já está na main, em versão melhor.** Os 100 dossiês e os baselines de outubro estão em `docs/_arquivo/analise-prs/` (211 arquivos), com dossiês de auditoria real em vez dos de 12 linhas gerados em lote.
5. **Aplicar a branch seria regressão de documentação**: os 4 arquivos em CONFLICT substituiriam o workspace vivo de novembro (relatório, inventário com SHA real, regras completas) por um retrato de 27/10 com `head_sha: unknown`.

## Lacunas a recuperar

**Nenhuma.** Não há trabalho útil perdido: todo o conteúdo é artefato gerado, superado por `analise-prs/`
(vivo) + `docs/_arquivo/analise-prs/` (histórico) na main.

## Veredito

**OBSOLETA** · confiança **alta** · `apagar_branch_seguro = true`

## Verificação adversarial

Papel: refutar o veredito OBSOLETA. Não consegui. **Concordo com OBSOLETA**, com uma correção factual na fundamentação.

### 1. Zero código — confirmado
- `git diff --name-only 148e9e5b6 origin/claude_pink/dreamy-wright-j0bser | grep -v '^analise-prs/' | wc -l` → **0**.
- `git diff --stat` → `107 files changed, 3460 insertions(+)`, 0 deleções. Diretórios tocados: apenas `analise-prs`, `analise-prs/baseline`, `analise-prs/dossies`.
- Commits (`git log 148e9e5b6..origin/claude_pink/dreamy-wright-j0bser`): `980ca5024`, `676926192`, `755f7d5db`, `b6222cd8e` — todos `chore(analise-prs)`.
- Logo não existe hunk de código a recuperar; a única pergunta é se a *documentação* tem valor não coberto.

### 2. Os 100 dossiês — cobertos e inferiores
- 100/100 basenames `analise-prs/dossies/PR-*.md` da branch existem em `origin/main:docs/_arquivo/analise-prs/dossies/` (loop com `git cat-file -e`: 100 OK, 0 MISSING).
- Comparação de conteúdo (`PR-2087.md`): branch = 12 linhas, `**head_sha**: unknown (bulk API não retorna)`, `3. Já está em main? Não` sem evidência. Main = dossiê datado 2026-10-26, base `main@2d97c44`, nomeia `src/components/gmail/__tests__/GmailInboxView.paginacao.test.tsx`, cita o mock exato (`vi.mocked(supabase.rpc).mockResolvedValue(...)`, `channel` com `subscribe: vi.fn().mockReturnThis()`) e o veredito `MERGEAR_SE_CI_VERDE`. A versão da main é estritamente mais informativa.

### 3. Objeto documentado deixou de existir — confirmado com leitura ao vivo
Consultei o estado atual das **100** PRs (REST `repos/adm01-debug/Zapp_Web_V2/pulls/<n>`, campos `state`/`merged`):
- **100/100 `closed`** — nenhuma aberta. O "backlog de 100 PRs abertas" que a branch retrata não existe mais.
- **Correção à triagem:** a triagem afirmou que "as 100 PRs estão fechadas sem merge". Falso para 19 delas, que foram **mergeadas**: #2089, #2092, #2100, #2112, #2116, #2120, #2141, #2149, #2209, #2222, #2229, #2239, #2240, #2241, #2247, #2270, #2272, #2276, #2278. As outras 81 estão fechadas sem merge, incluindo as duas que o relatório da branch apontava como bloqueio para o dono (#2274 e #2244, ambas `closed/false`), e a própria PR da branch (#2284, `CLOSED`, `merged=false`, `closedAt=2026-10-31`).
- O erro **reforça** a obsolescência: os dossiês da branch dizem "Já está em main? Não" para 19 PRs que entraram na main. Aplicar a branch injetaria afirmações falsas.

### 4. Substituição alegada cobre a necessidade — conferido arquivo por arquivo
| Arquivo da branch | Cobertura na main | Veredito |
|---|---|---|
| `analise-prs/RELATORIO_PRS.md` (27/10, "Mergeadas: 0", pede ação do dono em #2274/#2244) | `origin/main:analise-prs/RELATORIO_PRS.md` = "Relatório /merge-prs — sessão de 11–12/11/2026", PRs #2553–#2974, tabela PR × veredito × estado, `CI no SHA do merge: todos os checks success` | Aplicar **sobrescreveria** o relatório vivo. Piora. |
| `analise-prs/prs.csv` (100 linhas, `head_sha=unknown`) | `origin/main:analise-prs/prs.csv` (145 linhas) tem schema mais rico (`merge_candidate`, `rule8`, `sha` real, ex.: `0d204182d681…` na #2241) e cobre 77 dos 100; `origin/main:docs/_arquivo/analise-prs/prs.csv` (294 linhas, colunas `state`,`verdict`,`merge_sha`,`ci_gate`) cobre **100/100** (`comm -12` → 100) | Superset. Nada a recuperar. |
| `analise-prs/prs.json` (1602 linhas) | mesmo inventário; `docs/_arquivo/analise-prs/prs.json` presente | Idem. |
| `analise-prs/regras-de-negocio.md` (53 linhas) | `origin/main:analise-prs/regras-de-negocio.md` = superset: 8 critérios numerados, tabela da Regra 8 (8 categorias), seção "O que NÃO fazer" | Único trecho exclusivo: o parágrafo "Bloqueio sistêmico identificado (2026-10-27)", já resolvido (ver 5). Ainda: a linha "Banco SINGU (read-only) `vpkmqeumtxhrwgawxdrl`" da branch **contradiz o AGENTS.md vigente** (`vpkmqeumtxhrwgawxdrl` é Lovable — não escrever; os externos somente-leitura são `pgxfvjmuubtbowutlide` e `doufsxqlfjyuvxuezpln`, como a main já registra na Regra 6). Aplicar seria introduzir erro. |
| `analise-prs/baseline/lint.txt`, `typecheck.txt` | Saídas de execução **falhada por falta de dependências** (`Cannot find package '@eslint/js'`; `Cannot find type definition file for 'node'`; `Cannot find module 'vite'`) — não são baseline, são log de ambiente sem `bun install`. A main tem `docs/_arquivo/analise-prs/baseline/lint.txt` com contagem real (`746 problems (533 errors, 213 warnings)`) e `typecheck.txt` de execução real (OOM do tsc), além de `build.txt`, `tests.txt`, `unit-tests-failing.txt`, `BASELINE.md` | Valor negativo. |
| `analise-prs/baseline/main-sha.txt` (1 linha, `e1f2ee4dd…`) | O SHA já consta no corpo do `RELATORIO_PRS.md` da branch; a main tem `analise-prs/baseline/main.json` com SHA de início, SHA do merge de correção e estado de CI | Trivial. |

### 5. O bloqueio de CI descrito está resolvido
`origin/main:analise-prs/RELATORIO_PRS.md` registra, na sessão de 11–12/11, o merge da #2974 com "CI no SHA do merge: todos os checks `success`", e `origin/main:analise-prs/baseline/main.json` repete `"ci_no_sha_do_merge": "todos success (CI Gate, Build, TypeCheck, Unit 1-3, E2E Playwright, DB Guard, Edge contracts, Security, …)"`. A dependência circular `Contrato DB offline / novas=12` que a branch pedia ao dono desbloquear não é mais o estado do repo.

### Conclusão
Nenhum hunk de valor ≥ médio não coberto. A branch é um retrato de 27/10 de um backlog que não existe, em versão inferior ao que a main já guarda em dois lugares (`analise-prs/` vivo + `docs/_arquivo/analise-prs/` histórico), e aplicá-la sobrescreveria o workspace vivo. **OBSOLETA mantida · `apagar_branch_seguro = true`.**
