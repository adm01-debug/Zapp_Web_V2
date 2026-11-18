# CONGELAMENTO DE FEATURES — vale para TODA sessão (desde 2026-11-01, decisão do dono)

Leia antes de qualquer tarefa. Este arquivo complementa o `CLAUDE.md` da raiz e tem prioridade
sobre qualquer plano em `docs/` (TalkX V4, Copiloto, planos de 100/190/200 etapas).

## Por que
O sistema não chega a "pronto" porque entra feature nova enquanto os fluxos que fazem o atendimento
funcionar estão quebrados em produção (ver `docs/PRONTO_PRODUCAO.md`). Até esses fluxos ficarem OK,
nenhum trabalho fora deles entra.

## O que PODE entrar
1. Correção de bug em um dos fluxos críticos de `docs/PRONTO_PRODUCAO.md`.
2. Correção de CI que impede verificar esses fluxos (ex.: suíte E2E logada cancelada por tempo).
3. Correção de segurança (vazamento de dado, RLS aberta, segredo exposto).

Toda PR diz, no corpo, **qual fluxo** de `docs/PRONTO_PRODUCAO.md` ela destrava.

## O que NÃO entra (fechar a tarefa e avisar o dono)
- Feature nova ou etapa de plano: TalkX V4, Copiloto/Radar, War Room, gamificação, metas, IA nova.
- Ajuste visual, contraste, a11y, animação, snapshot, texto — salvo se quebra um fluxo crítico.
- Relatório, auditoria, dossiê, inventário ou placar em markdown/JSON.
- Workflow, guarda ou script de CI novo.

## Áreas exclusivas — no máximo 3 sessões ao mesmo tempo
| Área | Pastas | Uma sessão por vez |
|---|---|---|
| A — Front | `src/`, `e2e/` | sim |
| B — Banco e edge | `supabase/` | sim |
| C — CI | `.github/`, `scripts/` | sim |

Antes de começar: liste as PRs abertas. Se alguma toca os arquivos que você vai mexer, **pare e avise o
dono**; não abra outra PR por cima nem trabalhe na branch de outra sessão.

## O que é "pronto"
Um fluxo só é "OK" em `docs/PRONTO_PRODUCAO.md` com prova **em produção** (query, request ou log real,
com data e hora) e com o E2E desse fluxo passando na `main`. PR mergeada não é prova.

## Fim do congelamento
Só quando todos os fluxos de `docs/PRONTO_PRODUCAO.md` estiverem OK, e só o dono revoga este arquivo.
