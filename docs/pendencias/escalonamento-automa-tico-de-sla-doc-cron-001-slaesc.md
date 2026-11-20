# SLA-ESC — Escalonamento automático de SLA (DOC-CRON-001)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Escalonamento automático de SLA (DOC-CRON-001).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Tabela sla_violations, check_sla_violations(), cron /5, matriz 150/200/300%, webhook n8n
- **Existe hoje** (evidência da auditoria): grep = 0 em migrations, edges e src; só metadata.escalation_notes como texto livre (src/hooks/sla/useSLARules.ts:8)
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Supervisor/gerente não é acionado quando o cliente espera demais

## Dependências

Nenhuma registrada.

## Critério de aceite

- Tabela sla_violations, check_sla_violations(), cron /5, matriz 150/200/300%, webhook n8n
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).