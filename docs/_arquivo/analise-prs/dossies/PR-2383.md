# Dossiê PR #2383

**Título:** fix(db): revoga privilégios PUBLIC no schema e tabelas sensíveis
**Branch:** `claude/fix-db-revoke-public-privileges`
**Head SHA:** `fb4a8e2bd5af4c23a29e328940fbe8c3b1dae8ff`
**Base SHA:** `fe30391894743a6befdabbeb4b8218a93906bb40` (main atual)
**Criado em:** 2026-10-31
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**BLOQUEADO_CI** (lote 2 — CI dispatched às 01:47Z; MERGEAR SE CI Gate verde)

## Análise com evidência de diff (lido em 2026-10-31)

**Arquivos alterados:** migrations de segurança — revogação de privilégios PUBLIC em tabelas/schemas.
**mergeable_state:** `blocked` — CI em andamento.
**Tipo:** Segurança — revoga acessos desnecessários ao role PUBLIC.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | Sim — hardening de segurança importantes |
| 2 | Traz regressão? | Risco baixo se bem mapeado — revocação de PUBLIC geralmente é segura |
| 3 | Já está em main? | Não |
| 4 | Regra de negócio correta? | Sim — boa prática de segurança (principle of least privilege) |

## Bloqueio atual

- CI em andamento (lote 2, dispatched 01:47Z). Aguardando CI Gate completar.

## Ação necessária

Mergear via squash quando CI Gate retornar verde. Coordenador cuida do merge.
