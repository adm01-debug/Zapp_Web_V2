# E90 — Notificar falha da main por WhatsApp

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Notificar falha da main por WhatsApp.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: N8N → Evolution GO
- **Existe hoje** (evidência da auditoria): nada em workflows
- **Falta**: Decidir destino/dedupe
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Falhas (deploy automático, guarda vivo) sem aviso fora do Actions

## Dependências

dono

## Critério de aceite

- N8N → Evolution GO
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).