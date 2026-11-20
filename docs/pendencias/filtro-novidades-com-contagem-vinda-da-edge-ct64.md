# CT-64 — Filtro "Novidades" com contagem vinda da edge

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Filtro "Novidades" com contagem vinda da edge.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Ação new_or_recent/new_30d
- **Existe hoje** (evidência da auditoria): KPI mostra 366; a edge não tem a ação (só 6 ações no ActionSchema)
- **Falta**: Ação + contagem na edge
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Número do filtro sem conferência

## Dependências

deploy de edge

## Critério de aceite

- Ação new_or_recent/new_30d
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).