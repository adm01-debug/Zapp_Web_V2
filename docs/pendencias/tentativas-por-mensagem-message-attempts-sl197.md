# SL-197 — Tentativas por mensagem (message_attempts)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)

## Descrição e origem

Tentativas por mensagem (message_attempts).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: tabela + lista
- **Existe hoje** (evidência da auditoria): sem tabela; messageSendTimeline.ts:29 cita como futuro
- **Falta**: DDL + UI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem diagnóstico de reenvio

## Dependências

migration

## Critério de aceite

- tabela + lista
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).