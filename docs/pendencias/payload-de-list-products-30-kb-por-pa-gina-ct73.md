# CT-73 — Payload de list_products < 30 KB por página

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Payload de list_products < 30 KB por página.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Cortar campos
- **Existe hoje** (evidência da auditoria): Medido 81,5 KB (186 KB no bootstrap)
- **Falta**: Enxugar campos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Lentidão em 4G

## Dependências

deploy de edge

## Critério de aceite

- Cortar campos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).