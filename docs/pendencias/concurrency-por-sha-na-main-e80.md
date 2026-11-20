# E80 — Concurrency por SHA na main

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Concurrency por SHA na main.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Decidir com número (>20 %)
- **Existe hoje** (evidência da auditoria): Medição de 08/10 (PENDENCIAS_DO_DONO): 0/16 cancelamentos desde 05/10
- **Falta**: Decisão registrada
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

dono

## Critério de aceite

- Decidir com número (>20 %)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).