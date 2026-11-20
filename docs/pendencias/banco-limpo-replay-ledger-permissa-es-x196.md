# X196 — Banco limpo (replay, ledger, permissões)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.17 Talk X — Fase 16 · Qualidade e release (X192–X200: 0 concluídos)

## Descrição e origem

Banco limpo (replay, ledger, permissões).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.17 Talk X — Fase 16 · Qualidade e release (X192–X200: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Replay do zero sem falhas
- **Existe hoje** (evidência da auditoria): Replay local com 21 falhas esperadas e 64 diferenças (CLAUDE.md §0, regra 7)
- **Falta**: Reconciliar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Replay do zero sem falhas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).