# E052 — Webhook CALL completo + mapa de motivos

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)

## Descrição e origem

Webhook CALL completo + mapa de motivos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: offer/accept/terminate idempotente; mapa → end_reason
- **Existe hoje** (evidência da auditoria): T25/T26 feitos: _shared/evolution-webhook-handlers.ts + migration 20261002531230 (direção) + 20261004172554 (fecha overload)
- **Falta**: Completar motivos de término e reenvio
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

G1

## Critério de aceite

- offer/accept/terminate idempotente; mapa → end_reason
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).