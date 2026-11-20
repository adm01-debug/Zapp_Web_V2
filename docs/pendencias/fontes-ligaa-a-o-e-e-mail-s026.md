# S026 — Fontes ligação e e-mail

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11

## Descrição e origem

Fontes ligação e e-mail.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Consultas calls, email_threads/messages
- **Existe hoje** (evidência da auditoria): Hooks existem sem consumidor
- **Falta**: Ligar ao timeline
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Journey não mostra ligações nem e-mails

## Dependências

J07/J08

## Critério de aceite

- Consultas calls, email_threads/messages
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).