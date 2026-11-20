# DASH-088 — Estados de widget padronizados

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Estados de widget padronizados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Erro ≠ vazio
- **Existe hoje** (evidência da auditoria): useSLAMetrics não devolve error (useSLAMetrics.ts:154-161); AIQuickAccess trata erro como vazio (AIQuickAccess.tsx:76-77)
- **Falta**: Estado de erro
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Falha parece "sem dados"

## Dependências

Nenhuma registrada.

## Critério de aceite

- Erro ≠ vazio
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).