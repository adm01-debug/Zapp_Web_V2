# X178 — Hook único + paginação servidor

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.15 Talk X — Fase 14 · Supressão e Analytics (X176–X188: 0 concluídos)

## Descrição e origem

Hook único + paginação servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.15 Talk X — Fase 14 · Supressão e Analytics (X176–X188: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Um ponto de acesso
- **Existe hoje** (evidência da auditoria): useTalkXSuppression() morto (useTalkXSuppression.ts:38-110)
- **Falta**: Unificar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X176

## Critério de aceite

- Um ponto de acesso
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).