# ADR-004: Proteção da `main` com mantenedor único (approvals = 0)

- **Status:** Accepted
- **Data:** 2026-09-05
- **Contexto:** auditoria técnica 2026-09-02 e 2026-09-05 (dimensão CI/CD, gap "required_approving_review_count = 0")

## Contexto

O repositório tem **um** mantenedor humano (`adm01-debug`), que também é o autor de todos os
PRs — diretamente ou por sessões do Claude Code que commitam em seu nome. O GitHub não permite
que o autor aprove o próprio PR. Subir `required_approving_review_count` para 1 bloquearia
100% dos merges (inclusive hotfixes de produção) até existir um segundo revisor humano com
permissão de escrita, que hoje não existe.

A `main` já é protegida por (verificado via API em 2026-09-05):

- `strict = true` (branch precisa estar atualizada com a base antes do merge);
- 3 checks obrigatórios: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`;
- `enforce_admins = true`, `required_conversation_resolution = true`,
  `dismiss_stale_reviews = true`; force-push e deleção bloqueados.

Todo PR recebe revisão automática de bots (Copilot Pull Request Reviewer, cubic, CodeRabbit,
Vercel Agent Review) e CodeQL; como `required_conversation_resolution` está ligado, cada
thread aberto por esses bots precisa ser resolvido antes do merge — o que, na prática, é o
"segundo par de olhos" disponível.

## Decisão

Manter `required_approving_review_count = 0` **enquanto houver um único mantenedor**, e
compensar com gates automáticos bloqueantes:

1. os 3 checks obrigatórios acima;
2. `required_conversation_resolution` (threads dos bots de review têm de ser fechados
   conscientemente — respondidos ou corrigidos, nunca ignorados);
3. `scripts/ci/audit-prod.mjs` bloqueando vulnerabilidades HIGH/CRITICAL em dependências de
   **produção** (build-time continua informativo);
4. `DB Live Guard` e `DB Guard (offline)` como sinal de drift de schema (o primeiro passa a
   ser check obrigatório quando estiver verde por 7 dias consecutivos).

Revisar esta decisão quando existir um segundo colaborador com `write`: nesse dia,
`required_approving_review_count` sobe para 1 e `require_code_owner_reviews` para `true`
(o `CODEOWNERS` já existe).

## Consequências

- **Positivo:** merges continuam possíveis para o mantenedor único e para as sessões de IA;
  o rigor vem de gates determinísticos, não de aprovação humana simbólica.
- **Negativo:** um erro de julgamento do mantenedor não é barrado por outra pessoa. Mitigação:
  threads de bots obrigatórios + CodeQL + guards de banco.
- **Neutro:** `CODEOWNERS` fica sem efeito de bloqueio até a revisão desta ADR.

## Referências

- `docs/audits/AUDITORIA_TECNICA_22_DIMENSOES_2026-09-05.md` (dimensões 5 e 20)
- `.github/workflows/ci.yml`, `.github/CODEOWNERS`
