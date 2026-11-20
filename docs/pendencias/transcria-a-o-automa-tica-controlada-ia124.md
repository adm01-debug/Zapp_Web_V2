# IA-124 — Transcrição automática controlada

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Transcrição automática controlada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Dedupe, orçamento por serviço
- **Existe hoje** (evidência da auditoria): Webhook marca processing e retranscreve sem checar se já existe (evolution-webhook-messages.ts:726-747)
- **Falta**: Dedupe + orçamento
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Reentrega do webhook paga duas vezes

## Dependências

Nenhuma registrada.

## Critério de aceite

- Dedupe, orçamento por serviço
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).