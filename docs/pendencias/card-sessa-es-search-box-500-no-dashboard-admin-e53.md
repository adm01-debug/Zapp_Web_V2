# E53 — Card "Sessões Search Box / 500" no dashboard admin

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.5 Mapa / Search Box — Finalização (100)

## Descrição e origem

Card "Sessões Search Box / 500" no dashboard admin.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.5 Mapa / Search Box — Finalização (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Card
- **Existe hoje** (evidência da auditoria): Registrado como não feito (#1507)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Custo visível só por SQL/view

## Dependências

Nenhuma registrada.

## Critério de aceite

- Card
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).