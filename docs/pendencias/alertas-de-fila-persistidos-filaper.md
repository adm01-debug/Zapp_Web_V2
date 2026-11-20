# FILA-PER — Alertas de fila persistidos

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Alertas de fila persistidos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Alerta com histórico
- **Existe hoje** (evidência da auditoria): Dispensar é estado local (QueuesView.tsx:31)
- **Falta**: Tabela/estado persistente
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O alerta volta ao recarregar; sem histórico

## Dependências

Nenhuma registrada.

## Critério de aceite

- Alerta com histórico
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).