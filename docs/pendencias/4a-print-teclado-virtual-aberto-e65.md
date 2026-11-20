# E65 — 4º print (teclado virtual aberto)

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.5 Mapa / Search Box — Finalização (100)

## Descrição e origem

4º print (teclado virtual aberto).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.5 Mapa / Search Box — Finalização (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: 4 prints
- **Existe hoje** (evidência da auditoria): 3 prints em docs/mapa/prints/
- **Falta**: Print em aparelho real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Documental

## Dependências

aparelho / Joaquim

## Critério de aceite

- 4 prints
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).