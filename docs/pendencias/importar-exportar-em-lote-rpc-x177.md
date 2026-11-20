# X177 — Importar/exportar em lote (RPC)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.15 Talk X — Fase 14 · Supressão e Analytics (X176–X188: 0 concluídos)

## Descrição e origem

Importar/exportar em lote (RPC).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.15 Talk X — Fase 14 · Supressão e Analytics (X176–X188: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Prévia e lotes
- **Existe hoje** (evidência da auditoria): Nada
- **Falta**: RPCs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X176

## Critério de aceite

- Prévia e lotes
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).