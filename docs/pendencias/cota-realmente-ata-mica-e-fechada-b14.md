# B14 — Cota realmente atômica e fechada

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)

## Descrição e origem

Cota realmente atômica e fechada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Sem fail-open
- **Existe hoje** (evidência da auditoria): Contador compartilhado ok; quota diária falha aberta (ai-guards.ts:236-244)
- **Falta**: Decisão fail-closed
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Erro de banco libera gasto

## Dependências

Nenhuma registrada.

## Critério de aceite

- Sem fail-open
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).