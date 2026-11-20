# IA-045 — Operações longas em fila durável

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Operações longas em fila durável.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Jobs com lease/heartbeat para tarefas longas
- **Existe hoje** (evidência da auditoria): ai_jobs + ai-jobs-worker existem; handler ai.generate desligado por flag (ai-jobs-worker/index.ts:84,187); ninguém enfileira geração (só _shared/effect-reconcile.ts:200)
- **Falta**: Migrar análise/resumo longos para a fila e ligar a flag
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Análise longa continua síncrona e falha em timeout

## Dependências

Flag AI_JOBS_ENABLE_AI_GENERATE

## Critério de aceite

- Jobs com lease/heartbeat para tarefas longas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).