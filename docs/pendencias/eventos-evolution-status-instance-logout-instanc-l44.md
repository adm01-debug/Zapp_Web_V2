# L-44 — Eventos Evolution STATUS_INSTANCE, LOGOUT_INSTANCE, SEND_MESSAGE_UPDATE

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.9 Telefonia e webhooks

## Descrição e origem

Eventos Evolution STATUS_INSTANCE, LOGOUT_INSTANCE, SEND_MESSAGE_UPDATE.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.9 Telefonia e webhooks).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: EVOLUTION_WEBHOOKS_DOCUMENTATION §1.2 (26 ativos)
- **Existe hoje** (evidência da auditoria): Dispatcher trata 23 (supabase/functions/evolution-webhook/index.ts:215-323); esses 3 não aparecem
- **Falta**: handlers (ou desativar no webhook)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Logout remoto do número pode passar despercebido

## Dependências

Nenhuma registrada.

## Critério de aceite

- EVOLUTION_WEBHOOKS_DOCUMENTATION §1.2 (26 ativos)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).