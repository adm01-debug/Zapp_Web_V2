# X078 — Listagem paginada no servidor

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)

## Descrição e origem

Listagem paginada no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Paginação, filtros e realtime no banco
- **Existe hoje** (evidência da auditoria): useTalkXCampaignList.ts (487 l., testado) órfão; tela filtra/pagina em memória (TalkXOverview.tsx:149-171)
- **Falta**: Ligar o hook
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Lentidão com muitas campanhas

## Dependências

Nenhuma registrada.

## Critério de aceite

- Paginação, filtros e realtime no banco
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).