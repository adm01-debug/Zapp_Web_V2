# M-E24 — Replay integral verde

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

## Descrição e origem

Replay integral verde.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Replay de todas as migrations
- **Existe hoje** (evidência da auditoria): scripts/db-audit/replay-known-failures.json com 21 falhas esperadas; replay-local-harness.test.sh e replay-classify.test.sh estão na ALLOWLIST (fora do CI) (scripts/ci/check-test-inventory.mjs:58-66)
- **Falta**: Ligar ao db-guard; reduzir as 21
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Banco local ≠ produção em pontos conhecidos

## Dependências

dono do workflow

## Critério de aceite

- Replay de todas as migrations
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).