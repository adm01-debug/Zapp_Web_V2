# SLA-RES — SLA de resolução

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

SLA de resolução.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Medir resolution_breached
- **Existe hoje** (evidência da auditoria): resolution_minutes é configurável (useSLAConfigurations.ts:10; SLARuleFormDialog.tsx:132), mas nenhum código escreve resolution_breached e o dashboard só mede 1ª resposta (useSLAMetrics.ts:114-121)
- **Falta**: Medição + painel
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

A meta de tempo de resolução é configurável mas não é medida

## Dependências

Nenhuma registrada.

## Critério de aceite

- Medir resolution_breached
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).