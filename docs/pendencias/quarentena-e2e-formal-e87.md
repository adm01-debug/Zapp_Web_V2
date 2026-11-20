# E87 — Quarentena E2E formal

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Quarentena E2E formal.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: quarantine.json + fixme com prazo
- **Existe hoje** (evidência da auditoria): e2e/quarantine.json vazio; 39 test.fixme/test.skip soltos em e2e/.spec.ts (ex.: navegacao-modulos.spec.ts:1018, busca-global-paleta.spec.ts:249-320)
- **Falta**: Mover fixmes para a quarentena com issue/prazo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Defeitos conhecidos sem dono nem prazo

## Dependências

Nenhuma registrada.

## Critério de aceite

- quarantine.json + fixme com prazo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).