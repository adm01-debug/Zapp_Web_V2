# E98-B — Contraste no inbox (7 achados SERIOUS)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.5 Mapa / Search Box — Finalização (100)

## Descrição e origem

Contraste no inbox (7 achados SERIOUS).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.5 Mapa / Search Box — Finalização (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Medir com axe
- **Existe hoje** (evidência da auditoria): e2e/a11y-contraste.spec.ts mede só Contatos
- **Falta**: Medir o inbox
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixa visão

## Dependências

Nenhuma registrada.

## Critério de aceite

- Medir com axe
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).