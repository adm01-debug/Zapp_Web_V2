# C-E35 — Alertas operacionais (conexões, disco, backup, erro de edge)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

## Descrição e origem

Alertas operacionais (conexões, disco, backup, erro de edge).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Alertas + runbook
- **Existe hoje** (evidência da auditoria): Só detector de pg_cron no Talk X (20261009180000_pg_cron_detector_timeouts_e_falhas_seguidas.sql); nada de disco/conexões/backup
- **Falta**: Configurar alertas
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Incidente de banco só é visto quando o usuário reclama

## Dependências

dono (painel)

## Critério de aceite

- Alertas + runbook
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).