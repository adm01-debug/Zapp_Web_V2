# Dossiê — codex__consolidacao-baseline-pr-20261101 (PR #2465)

**Ref:** `origin/codex/consolidacao-baseline-pr-20261101` · tip `0eed116b` · merge-base `1252bb5a` (01/11/2026)
**Veredito:** OBSOLETA · confiança alta · `apagar_branch_seguro = true`

## Propósito
Um único commit útil (`3ab810b4d docs(consolidacao): atualiza baseline da main em 01/11/2026`) + 4 merges de `main`.
Acrescenta ao `docs/consolidacao/BASELINE.md` uma seção "Medição atual — 01/11/2026" (build/lint/typecheck/testes
medidos no SHA `df4d597d`) e renomeia o título; a seção de 28/10 vira "Referência inicial". Só docs: `counts.src=0`,
`edges=0`, `migrations=0`, `workflows=0`.

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `docs/consolidacao/BASELINE.md` | NEW_FILE_ABSENT_IN_MAIN / CONFLICT (11 linhas ausentes) | Alvo foi **arquivado de propósito** na main como "prosa morta"; a medição de 01/11 não existe em nenhum lugar da main e já foi superada por baseline de 02/11 em outro arquivo | `git log --diff-filter=ADR --name-status origin/main -- docs/consolidacao/BASELINE.md` → `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)` · `R100 docs/consolidacao/BASELINE.md → docs/_arquivo/docs/consolidacao/BASELINE.md` (02/11/2026; corpo: "Relatórios antigos ... confundem agentes novos. Arquivar = mover ... Nada apagado"). `git ls-tree origin/main docs/consolidacao/` → vazio. `git show origin/main:docs/_arquivo/docs/consolidacao/BASELINE.md` → conteúdo = versão de 28/10 (título "Referência inicial da consolidação", commit `653f3d33`), sem a seção de 01/11. `git grep -n "15.683\|09:40–09:51\|606 erros" origin/main -- docs` → 0 ocorrências. Baseline posterior existe: `origin/main:docs/_arquivo/analise-prs/baseline/BASELINE.md` ("Baseline do main — SHA c4280ef4…, Data: 2026-11-02"). |

## Por que OBSOLETA (não PERDIDA)
1. O arquivo-alvo e toda a pasta `docs/consolidacao/` foram movidos para `docs/_arquivo/` (histórico, somente leitura por convenção) pelo PR #2630 — adicionar uma medição nova a um documento arquivado contraria a intenção registrada no commit.
2. O conteúdo é uma fotografia de métricas (lint 606/213, tsc 3 erros, 15.683 testes) de um SHA de 01/11 (`df4d597d`), já superada por baseline de 02/11 e por centenas de commits na main desde então; não corrige bug nem muda comportamento.
3. Referências vivas de "baseline" na main hoje são outra coisa (`scripts/ci/github-settings-baseline.json`, `AGENTS.md:83`).

Triagem anterior (2026-11-08) também marcou OBSOLETA — confirmada agora com evidência de código.

## Lacunas a recuperar
Nenhuma com valor. Se algum dia quiserem o registro histórico, o hunk completo (18 linhas) é:

```diff
--- a/docs/consolidacao/BASELINE.md
+++ b/docs/consolidacao/BASELINE.md
@@ -1,4 +1,21 @@
-# Referência inicial da consolidação
+# Baseline da consolidação
+
+## Medição atual — 01/11/2026
+
+Executada em **01/11/2026, 09:40–09:51 (America/Sao_Paulo)** no SHA `df4d597dcbaa6fbdb4eb4c8ee672e39e1f2d2a05`, confirmado como `origin/main` antes e depois da execução. A medição foi feita em uma worktree limpa (`zapp-worktrees/mission-baseline-20261101`), com Bun `1.4.0`, Node `v24.19.0` e `bun install` concluído (645 pacotes). A árvore de trabalho permaneceu limpa após as verificações.
+
+| Verificação | Comando | Resultado atual |
+|---|---|---|
+| Build | `bun run build` | Passou; **0 erros**, 2 avisos de classes Tailwind ambíguas e aviso de chunks maiores que 1.200 kB. |
+| Lint | `bun run lint` | **606 erros e 213 avisos**; exit code 1. O total de erros é 3 acima da medição de 28/10; a origem da diferença ainda não foi atribuída. |
+| Typecheck | `bun run typecheck` | **3 erros TypeScript**; exit code 2: atributo JSX duplicado em `QueueAlertsDisplay.tsx:94` e duas propriedades `tags` incompatíveis nos testes `useInboxFilters.type-url.test.tsx:123–124`. |
+| Testes unitários | `bun run test` | **15.683 passaram**, 0 falharam, 19 falhas esperadas e 43 `todo`; 1.856 arquivos passaram e 5 foram pulados. Exit code 0; duração 533,57 s. |
+
+Em relação à referência inicial de 28/10 abaixo: **+121 testes passando**, uma falha esperada a menos e **19 erros TypeScript a menos**; o lint tem três erros a mais e o mesmo total de avisos. Esses resultados são a nova referência para comparar alterações seguintes. Os logs completos estão em `/tmp/baseline-build.log`, `/tmp/baseline-lint.log`, `/tmp/baseline-typecheck.log` e `/tmp/baseline-test.log` nesta máquina; os exit codes foram `0`, `1`, `2` e `0`.
+
+---
+
+## Referência inicial — 28/10/2026
```
Destino hoje seria `docs/_arquivo/docs/consolidacao/BASELINE.md` (arquivo arquivado) — não recomendado.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA. Branch segura para apagar.**

Tentei refutar procurando hunk útil não coberto. O diff real é um único arquivo, 18 linhas
adicionadas / 1 removida (`git diff 1252bb5a4 origin/codex/consolidacao-baseline-pr-20261101 --stat`
→ `docs/consolidacao/BASELINE.md | 19 ++++-`). Os 4 commits restantes dos 5 são merges de `main`.
Nenhum `src/`, migration, workflow ou edge.

### 1. O conteúdo realmente não está na `main` — mas isso não o torna útil
`git grep -n "15.683\|09:40–09:51\|df4d597dcbaa6fbdb4eb4c8ee672e39e1f2d2a05" origin/main` → zero
acertos no texto da medição. O arquivo de destino `docs/_arquivo/docs/consolidacao/BASELINE.md`
na `main` começa em `# Referência inicial da consolidação` e só contém a medição de 28/10/2026
(SHA `653f3d3`). Ou seja: a fotografia de 01/11 é de fato exclusiva da branch.

### 2. A remoção foi deliberada e não destrutiva
`git log --follow origin/main -- docs/_arquivo/docs/consolidacao/BASELINE.md` → `c570d5d46`
*"chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)"*. O corpo do commit é explícito:
*"Arquivar = mover para `docs/_arquivo/` mantendo o histórico. **Nada apagado.** … `docs/` →
`docs/_arquivo/docs/`: … `consolidacao/` … 408 arquivos, 100% rename (mesmo blob)"*. O diff
confirma o rename puro: ` docs/{ => _arquivo/docs}/consolidacao/BASELINE.md | 0`.
Mergear a branch recriaria `docs/consolidacao/BASELINE.md` fora do arquivo — desfazendo a #2630
num caminho que o dono decidiu esvaziar.

### 3. Todos os números do snapshot estão superados por fonte viva na `main`
- **Lint (606 erros)** → há baseline vivo e versionado em `scripts/ci/eslint-baseline.json`,
  consumido pelo `scripts/ci/lint-ratchet.mjs`; a última sincronização na `main` é
  `cf93115b2 ci(lint): sincroniza o baseline do ratchet, 544 -> 542` (14/11). 606 ≠ 542: o número
  do snapshot é ruído, não referência.
- **Typecheck (3 erros)** → os dois defeitos nomeados foram corrigidos. `QueueAlertsDisplay.tsx`
  (caminho real na `main`: `src/components/queues/`, não `queue/`) não tem atributo JSX duplicado
  na linha 94 — `git show origin/main:src/components/queues/QueueAlertsDisplay.tsx | sed -n '90,98p'`
  mostra bloco `<Button>` limpo; `git log -3 origin/main -- <arquivo>` aponta
  `2ebe682c1 fix(typecheck): remove contratos obsoletos da inbox`, que também cobre
  `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx`.
- **Testes (15.683)** e **build** → medidos no SHA `df4d597`, de 01/11; a `main` avançou ~2 semanas
  e dezenas de merges (ex.: `#3137`, `#3135`, `#3127`, `#3125`). Comparar qualquer coisa contra
  esse número hoje induz erro.
- Os logs que o documento cita como prova (`/tmp/baseline-*.log`) estavam na máquina daquela
  sessão e não existem mais. O valor probatório é zero.

### 4. Nenhuma lacuna de valor ≥ médio
Não achei um único hunk resgatável: não há código, teste, script, regra de negócio nem decisão
documentada — só uma tabela de métricas de uma `main` que não existe mais, destinada a uma pasta
que a `main` arquivou de propósito. Também não há risco de perda de histórico: o blob fica no
reflog/objetos do GitHub e nesta verificação (SHA do tip `0eed116b7`).

Lacunas adicionais encontradas: nenhuma.
