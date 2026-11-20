# X040 — RFM calculado localmente

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)

## Descrição e origem

RFM calculado localmente.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: talkx_recompute_purchase_metrics
- **Existe hoje** (evidência da auditoria): RFM legado; filtro RFM desabilitado em src/components/talkx/TalkXAudienceFilters.tsx:53-57
- **Falta**: Função + job
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Segmentação por valor/recência indisponível

## Dependências

X037, X039

## Critério de aceite

- talkx_recompute_purchase_metrics
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).