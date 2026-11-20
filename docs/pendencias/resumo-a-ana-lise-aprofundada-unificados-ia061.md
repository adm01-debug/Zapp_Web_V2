# IA-061 — Resumo × análise aprofundada unificados

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Resumo × análise aprofundada unificados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Mesmo contexto/contrato/persistência
- **Existe hoje** (evidência da auditoria): _shared/ai-conversation-pipeline.ts comum
- **Falta**: Alinhar semântica/UX dos dois modos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Resultados diferentes para o mesmo pedido

## Dependências

Nenhuma registrada.

## Critério de aceite

- Mesmo contexto/contrato/persistência
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).