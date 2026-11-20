# E31 — Varredura final sem "pipeline" como id

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.2 Fusão Quadro→Tarefas (50)

## Descrição e origem

Varredura final sem "pipeline" como id.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.2 Fusão Quadro→Tarefas (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: git grep limpo
- **Existe hoje** (evidência da auditoria): Falha por E12
- **Falta**: Fechar E12
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

E12

## Critério de aceite

- git grep limpo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).