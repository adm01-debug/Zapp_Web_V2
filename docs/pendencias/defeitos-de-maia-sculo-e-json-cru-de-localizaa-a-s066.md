# S066 — Defeitos "De" maiúsculo e JSON cru de localização

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11

## Descrição e origem

Defeitos "De" maiúsculo e JSON cru de localização.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Corrigir
- **Existe hoje** (evidência da auditoria): Corrigidos só na lib (formatDayLabel model.ts:269, safeEventText :313); a aba ainda exibe "2 De Outubro De 2026" (JourneyTab.tsx:69-75,138) e truncate(content) cru (useConversationHistoryTimeline.ts:168)
- **Falta**: Ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Defeito visível ao usuário hoje

## Dependências

J12

## Critério de aceite

- Corrigir
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).