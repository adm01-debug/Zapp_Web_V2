# X039 — Negócios ganhos do Bitrix24 → contact_purchases

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)

## Descrição e origem

Negócios ganhos do Bitrix24 → contact_purchases.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: pull_won_deals somente leitura
- **Existe hoje** (evidência da auditoria): Nada (pull_won_deals, talkx_upsert_purchases_batch = 0)
- **Falta**: Implementar após decisão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem venda ligada a contato: sem receita/ROI

## Dependências

N36 (funil do Bitrix24)

## Critério de aceite

- pull_won_deals somente leitura
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).