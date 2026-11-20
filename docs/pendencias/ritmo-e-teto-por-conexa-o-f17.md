# F17 — Ritmo e teto por conexão

- **Estado**: DIVERGENTE
- **Prioridade**: P0
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

Ritmo e teto por conexão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: Cota diária compartilhada
- **Existe hoje** (evidência da auditoria): multiplix_connection_daily_usage (20260929610000…sql:36) e talkx_connection_send_budget (20261002551230…sql:175,189) leem multiplix_recipients.sent_at
- **Falta**: Contar multiplix_delivery_items
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Teto do número pode estourar → bloqueio do chip

## Dependências

Nenhuma registrada.

## Critério de aceite

- Cota diária compartilhada
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).