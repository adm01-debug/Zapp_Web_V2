# E75 — Fonte única de toolchain

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Fonte única de toolchain.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: toolchain.json + nenhum YAML com versão literal
- **Existe hoje** (evidência da auditoria): .github/toolchain.json existe (lote 09/10); check-workflow-pins.mjs:91-131 compara drift; YAML ainda literalizam 1.4.0, 2.116.0, playwright@1.63.0 (ci.yml:398)
- **Falta**: Workflows lerem do JSON (ou aceitar o drift-check como alternativa formal)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atualização de versão continua manual em vários lugares

## Dependências

Nenhuma registrada.

## Critério de aceite

- toolchain.json + nenhum YAML com versão literal
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).