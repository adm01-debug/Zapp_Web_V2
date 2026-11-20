# L-14 — Métricas de satisfação

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.3 Satisfação (CSAT/NPS)

## Descrição e origem

Métricas de satisfação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.3 Satisfação (CSAT/NPS)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: IMPROVEMENT P3.5 ✅
- **Existe hoje** (evidência da auditoria): Telas existem (SatisfactionMetrics.tsx), alimentadas por tabelas sem coleta automática
- **Falta**: depende de L-12/L-13
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Indicadores sem dado real

## Dependências

L-12

## Critério de aceite

- IMPROVEMENT P3.5 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).