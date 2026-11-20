# X104 — Modelo v2 no front

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)

## Descrição e origem

Modelo v2 no front.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: segmentRules.ts v2
- **Existe hoje** (evidência da auditoria): Modelo legado
- **Falta**: Migrar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X100

## Critério de aceite

- segmentRules.ts v2
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).