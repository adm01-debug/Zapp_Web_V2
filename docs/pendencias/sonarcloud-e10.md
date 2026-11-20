# E10 — SonarCloud

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

SonarCloud.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Ajustar/desinstalar/manter Quality Gate
- **Existe hoje** (evidência da auditoria): Check SonarCloud Code Analysis = failure no HEAD
- **Falta**: Decisão do dono
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Vermelho permanente na main normaliza "vermelho"

## Dependências

Joaquim

## Critério de aceite

- Ajustar/desinstalar/manter Quality Gate
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).