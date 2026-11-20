# X081 — Filtros, grade e massa

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)

## Descrição e origem

Filtros, grade e massa.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Filtros no servidor + seleção em massa
- **Existe hoje** (evidência da auditoria): Filtros canal/segmento/criador e grade (TalkXOverview.tsx:26-28,138-140), no cliente
- **Falta**: Servidor + massa
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Idem X078

## Dependências

X078

## Critério de aceite

- Filtros no servidor + seleção em massa
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).