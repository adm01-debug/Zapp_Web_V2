# OBS-1 — Alerta de desconexão do WhatsApp

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

Alerta de desconexão do WhatsApp.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: connection_health_logs 2 amostras → aviso ao admin
- **Existe hoje** (evidência da auditoria): connection-health-check/index.ts:134-136 gera alerta interno; cron existe (20261002541230_pg_cron_escalonar_jobs.sql)
- **Falta**: Aviso fora do app
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Instância caída à noite só vista de manhã

## Dependências

Nenhuma registrada.

## Critério de aceite

- connection_health_logs 2 amostras → aviso ao admin
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).