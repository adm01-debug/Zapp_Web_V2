# Dossiê PR #2386

**Título:** fix(team-chat): restringe inserts de membros diretos a owners
**Branch:** `claude/fix-team-chat-direct-member-inserts`
**Head SHA:** `6563f05cc2003f2c1653efc25895f518512892e1`
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**BLOQUEADO_CI** (lote 2 — CI dispatched às 01:47Z; MERGEAR SE CI Gate verde)

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** política RLS do Team Chat — restringe inserts de membros diretos somente a owners do workspace.
**mergeable_state:** `blocked` — CI em andamento.
**Tipo:** Segurança — hardening de RLS.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Sim — corrige brecha de segurança no Team Chat |
| 2 | Traz regressão? | Risco baixo — restrição mais rigorosa (menos permissiva) |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Sim — apenas owners devem poder inserir membros diretos |

## Bloqueio atual

- CI em andamento (lote 2, dispatched 01:47Z). Aguardando CI Gate completar.

## Ação necessária

Mergear via squash quando CI Gate retornar verde. Coordenador cuida do merge.
