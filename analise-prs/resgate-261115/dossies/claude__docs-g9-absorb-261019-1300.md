# Dossiê — `claude/docs-g9-absorb-261019-1300` (PR #2107)

- Tip: `f1b53effaa4da01f3e4a9b8be870af00426a6275` (merge de `main` + `fbfc51c4c docs(g9): absorver planos ausentes da main — E274`)
- Merge base: `bac62ba98454811c3bfd117b838af926b1e795b2`
- Delta: **somente docs** — 3 arquivos, +2036 linhas, 0 em `src/`, `supabase/`, `.github/`
  (`git diff --stat bac62ba9 origin/claude/docs-g9-absorb-261019-1300`)

## Propósito
PR #2107 (fechada em 01/11/2026, não mergeada): copiar para a `main` três planos de documentação
que só existiam em branches G9. Corpo da PR lista as 3 branches de origem. O comentário de
fechamento alega "conteúdo absorvido pela `main` ou superado" — verificado: vale para 2 dos 3
arquivos, **não** para o terceiro.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `docs/plans/PLANO_CONTATOS_CABECALHO_BOTAO_VERDE_50_ETAPAS_2026-09-30.md` | **Já na main, byte a byte** | `git ls-tree origin/main` → blob `af681273…`; status mecânico IDENTICAL_TO_MAIN / PRESENT_BYTE |
| `docs/plans/PLANO_ORDEM_BANNER_SUPERIOR_20_ETAPAS_2026-09-30.md` | **Main é a versão MAIS NOVA; a da branch é regressão** | `git diff origin/main:<f> origin/claude/docs-g9-absorb-261019-1300:<f>`: a branch troca "Status: **encerrado** — a ordem contratada está na `main` desde 30/09/2026 (PR #1257, commit `db4516f538`)" por "execução das 20 etapas pendente", **apaga** as seções "Registro de encerramento" e "Contrato vigente (atualizado em 20/10/2026)" (tabela de rótulos SalesView/Journey, PRs #1608/#1613/#1619) e reverte a "Matriz de aceite" preenchida (Atendido) para "Pendente". As 18 linhas `missing_in_main` são exatamente esse texto obsoleto. **Não portar.** |
| `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` | **LACUNA REAL — 741 linhas, nunca existiu na main** | `git ls-tree origin/main -- <f>` vazio; `git log --oneline origin/main -- <f>` vazio; nenhum doc da main contém "SEGURANÇA CRÍTICA (Etapas 1" (`git grep -ln`). O único "190 ETAPAS" na main é `PLANO_VERCEL_190_ETAPAS_2026-10-18.md`, tema diferente (Vercel). |

## A lacuna: `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md`

Plano de backlog técnico em 9 fases (190 etapas), gerado em 19/10/2026:

| Fase | Etapas | Foco | Bloqueadores marcados "PARAR AQUI" |
|---|---|---|---|
| A — Segurança | 1–30 | Z-series, 17 edge functions órfãs (Grupo E), CSP, CORS, timingSafeEqual, audit log | — |
| B — Banco | 31–60 | drift ledger×migrations, índices, 31 jobs pg_cron, RLS faltante, retenção | B33 (pg_partman), B50 (retenção) |
| C — Edge Functions | 61–85 | callers, shared modules (`error-response`, `logger`, `retry`), circuit breaker, Zod | C80 (staging) |
| D — TypeScript | 86–105 | strict mode gradual por diretório | — |
| E — Testes | 106–125 | coverage, E2E, integração | — |
| F — CI/CD | 126–145 | workflows, gates | — |
| G — Performance | 146–160 | frontend, banco, Realtime | G159 (CDN) |
| H — Qualidade | 161–175 | error handling, i18n, logging | H174 (Sentry) |
| I — Documentação | 176–190 | ADRs, runbooks, governança | I178 (LGPD) |

**Como portar sem reler a branch** (o arquivo é novo e íntegro, não há hunk a resolver):

```
git show f1b53effaa4da01f3e4a9b8be870af00426a6275:docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md
```

Grava-se o conteúdo em `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` numa branch nova de
`main`. Nenhum outro arquivo da branch deve ser portado.

**Staleness verificada antes de portar** (parte do plano já está feita ou morreu):
- A1/A5 "mergear PRs #2081–#2095": mortas. Estado hoje (GraphQL): #2091 CLOSED, #2092 MERGED,
  #2093 CLOSED, #2094 CLOSED, #2095 CLOSED — nada a mergear.
- A12 "habilitar Dependabot": **já feito** — `.github/dependabot.yml` existe na main.
- A23 "npm audit no CI": **já feito** de outra forma — `bun audit --audit-level=low` em
  `.github/workflows/ci.yml:331`.
- Ainda pendente (amostra): C63/C64 shared `error-response.ts` / `logger.ts` não existem em
  `supabase/functions/_shared/`; `docs/security/` só tem `secret-surface-inventory.md` e
  `validation-report-2026-08-30.md` (faltam `rls-anon-write-audit.md`,
  `api-keys-rotation.md`, `DEPLOY_SECURITY_CHECKLIST.md` citados nas etapas A6/A9/A30).

Valor de negócio: **baixo** — é documentação/backlog, não altera comportamento do produto. Se for
portado, vale marcar no topo que as etapas A1/A5/A12/A23 já estão resolvidas, para não gerar
retrabalho.

## Veredito

**PERDIDA_PARCIAL** — 2 dos 3 arquivos estão na main (um deles em versão melhor que a da branch);
o plano de 190 etapas (741 linhas) nunca entrou e não tem equivalente na main. Valor baixo (docs),
parcialmente desatualizado.

`apagar_branch_seguro`: **false** — apagar a branch perde a única cópia do plano de 190 etapas.
Depois de portar o arquivo (ou do dono decidir descartá-lo), a branch pode ser apagada.

## Verificação adversarial

Veredito mantido: **PERDIDA_PARCIAL** (`concorda=true`). Tentei refutar por dois caminhos — provar que a
main já cobre o plano de 190 etapas (seria INCORPORADA/OBSOLETA) e provar que ele foi descartado de
propósito. Os dois falharam.

**1. O arquivo nunca existiu na main e não tem equivalente**
- `git ls-tree origin/main -- docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` → vazio;
  `git log --oneline origin/main -- <mesmo>` → vazio.
- `git log -S'## 190 Etapas para Execução por Agente IA' --oneline origin/main` → **nenhum commit**:
  o conteúdo nunca passou pela main, logo não houve remoção/revert deliberado.
- `git grep -n "PLANO DE CORREÇÕES E MELHORIAS" origin/main` → vazio.
- Único homônimo na main é `docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18.md` (1130 linhas): escopo
  exclusivo do projeto Vercel `zapp_web_v2` (domínio, envs, cache, CSP) — tema diferente, não substitui
  as 9 fases (segurança/banco/edges/TS/testes/CI/perf/qualidade/docs). Varri `docs/plans/` (60 arquivos)
  e `docs/audits/` da main: nenhum plano com esse escopo.

**2. O plano ainda encaixa no código atual (não é lixo morto)**
- Os alvos citados existem na main: `supabase/functions/external-db-bridge/index.ts`,
  `supabase/functions/_shared/` (dezenas de módulos), `supabase/schema-manifest.json`.
- Itens ainda pendentes, conferidos na main: `docs/security/DEPLOY_SECURITY_CHECKLIST.md` (A30) não
  existe (`git grep -ln DEPLOY_SECURITY_CHECKLIST origin/main` → vazio; `docs/security/` só tem
  `secret-surface-inventory.md` e `validation-report-2026-08-30.md`); `tsconfig.app.json` ainda com
  `"strict": false` (fase D).
- Itens já resolvidos por outro caminho, confirmando a desatualização parcial: `.github/dependabot.yml`
  existe (A12), `bun audit` está no `.github/workflows/ci.yml:322` (A23), e `timingSafeEqual` já aparece
  em 13 arquivos de `supabase/functions` (A2 em boa parte feito).

**3. O fechamento da PR #2107 não é decisão do dono**
GraphQL #2107: `state CLOSED`, `merged false`, `closedAt 2026-11-01T20:34:11Z`. O comentário de
fechamento é da própria varredura automática ("branch obsoleta — conteúdo absorvido pela `main` ou
superado por PR mais recente. Fechamento conforme auditoria 01/11"), e um comentário anterior do mesmo
agente registra o oposto: "os 3 arquivos desta PR existem no branch mas **não existem em `main`**".
Ou seja, a alegação de absorção é falsa para este arquivo e não há descarte consciente do dono.

**4. Confirmei também as duas não-lacunas**
- `PLANO_CONTATOS_CABECALHO_BOTAO_VERDE_50_ETAPAS_2026-09-30.md`: blob idêntico nos dois lados
  (`af68127397c9b2d2755db1ede34e4056a23e7b22`).
- `PLANO_ORDEM_BANNER_SUPERIOR_20_ETAPAS_2026-09-30.md`: a main abre com "**Status:** **encerrado** — a
  ordem contratada está na `main` desde 30/09/2026 (PR #1257, commit `db4516f538`) … matriz de aceite
  preenchida", enquanto a branch traz "execução das 20 etapas pendente". Portar = regressão de
  documentação. **Não recuperar.**

Nenhuma lacuna adicional além do arquivo de 741 linhas. `apagar_branch_seguro` permanece **false**:
`fbfc51c4c` só é alcançável por `origin/claude/docs-g9-absorb-261019-1300` (a PR está fechada, sem merge).
