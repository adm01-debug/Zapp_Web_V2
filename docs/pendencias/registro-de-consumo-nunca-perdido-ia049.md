# IA-049 — Registro de consumo nunca perdido

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Registro de consumo nunca perdido.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Outbox durável para ledger de uso
- **Existe hoje** (evidência da auditoria): Código grava em ai_usage_outbox/outbox_events (_shared/ai-usage.ts:453,675) mas as tabelas não existem (ausentes em supabase/migrations, schema-catalog.json, types.ts); reprocessarLogEssencial (ai-usage.ts:516) sem chamador
- **Falta**: DDL das 2 tabelas, cron reprocessador, secret AI_OUTBOX_HMAC_SECRET
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Consumo pago pode sumir do relatório quando a gravação falha

## Dependências

DDL no lote do dia + secret

## Critério de aceite

- Outbox durável para ledger de uso
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).