# Y17-04 — Contraste de selos (60 nós)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Contraste de selos (60 nós).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: ≥ 4,5:1
- **Existe hoje** (evidência da auditoria): Relatório Y17:168
- **Falta**: Tokens
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

- ≥ 4,5:1
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).