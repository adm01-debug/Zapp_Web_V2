# IA-006 — Natureza do indicador visível na tela

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Natureza do indicador visível na tela.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Distinguir IA, cálculo, manual, importado na UI
- **Existe hoje** (evidência da auditoria): Doc IA-006 existe; UI ainda chama heurística de "probabilidade" (ChurnPredictionDashboard.tsx:276) e previsão de "95% de confiança" (src/components/dashboard/DemandPrediction.tsx:75)
- **Falta**: Rotular origem/limite em cada card
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Gestor decide com base em número que parece previsão estatística e não é

## Dependências

Nenhuma registrada.

## Critério de aceite

- Distinguir IA, cálculo, manual, importado na UI
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).