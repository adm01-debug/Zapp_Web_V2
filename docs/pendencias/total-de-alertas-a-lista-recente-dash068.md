# DASH-068 — Total de alertas ≠ lista recente

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Total de alertas ≠ lista recente.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Total exato
- **Existe hoje** (evidência da auditoria): 400 análises (useRecentSentimentAlerts.ts:52); card "Alertas de Sentimento" = até 5 de audit_logs 24 h (useAIStats.ts:143-144)
- **Falta**: Contagem real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Card mostra no máximo 5 alertas

## Dependências

Nenhuma registrada.

## Critério de aceite

- Total exato
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).