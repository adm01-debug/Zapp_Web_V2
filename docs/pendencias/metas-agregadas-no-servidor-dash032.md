# DASH-032 — Metas agregadas no servidor

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Metas agregadas no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Sem transportar histórico
- **Existe hoje** (evidência da auditoria): useGoalsDashboard.ts:106-131 lê sem paginação (corta em 1.000)
- **Falta**: RPC
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Meta "trava" acima de 1.000 mensagens

## Dependências

Nenhuma registrada.

## Critério de aceite

- Sem transportar histórico
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).