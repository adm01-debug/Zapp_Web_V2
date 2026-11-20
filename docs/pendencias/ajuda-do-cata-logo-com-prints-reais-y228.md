# Y22-8 — Ajuda do catálogo com prints reais

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Ajuda do catálogo com prints reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 5 passos com prints
- **Existe hoje** (evidência da auditoria): Só texto (CatalogHelpSheet.tsx)
- **Falta**: Prints
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Onboarding mais fraco

## Dependências

Nenhuma registrada.

## Critério de aceite

- 5 passos com prints
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).