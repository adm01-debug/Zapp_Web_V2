# HAND-GO — "Gaps GO sem UX ativa, com 501 explícito"

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.9 Migração fresh install (docs/migration) e handoffs antigos

## Descrição e origem

"Gaps GO sem UX ativa, com 501 explícito".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.9 Migração fresh install (docs/migration) e handoffs antigos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: 501 explícito
- **Existe hoje** (evidência da auditoria): O roteador repassa para a GO (404), sem 501; e há UX ativa (GO-01..04)
- **Falta**: Ver §4
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- 501 explícito
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).