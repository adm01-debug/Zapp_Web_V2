# X071 — Trilha da supressão e fim do DELETE físico

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)

## Descrição e origem

Trilha da supressão e fim do DELETE físico.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Trigger de trilha + removal_reason
- **Existe hoje** (evidência da auditoria): Tela usa soft-delete (TalkXSuppression.tsx:219); hook morto ainda com .delete() (useTalkXSuppression.ts:94); removal_reason/import_batch_id = 0
- **Falta**: Trigger + colunas
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Remoções sem histórico completo

## Dependências

X070

## Critério de aceite

- Trigger de trilha + removal_reason
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).