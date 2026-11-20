# IA-152 — Recomendar produtos com restrições reais

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Recomendar produtos com restrições reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Quantidade mínima, estoque, técnica, prazo
- **Existe hoje** (evidência da auditoria): Filtra estoque > 0 (src/hooks/chat/useRecommendedProducts.ts:52-58)
- **Falta**: Preço, prazo, quantidade mínima
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Recomenda produto inviável

## Dependências

Catálogo PromoGifts

## Critério de aceite

- Quantidade mínima, estoque, técnica, prazo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).