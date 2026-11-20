# CRM-R2 — Worker de sincronização (outbox → CRM)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.6 CRM externo (Singu) — integração, sincronização e segurança

## Descrição e origem

Worker de sincronização (outbox → CRM).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.6 CRM externo (Singu) — integração, sincronização e segurança).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Fase 2 do runbook: lote manual, depois CRM_SYNC_WORKER_ENABLED=true
- **Existe hoje** (evidência da auditoria): Outbox 20260908180000; crm-sync-worker.yml:14-15 com cron comentado, só workflow_dispatch
- **Falta**: Lote 1 manual + ligar variável
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendimentos encerrados não chegam ao CRM (relationship_score/RFM não evoluem)

## Dependências

Joaquim + secrets EXTERNAL_

## Critério de aceite

- Fase 2 do runbook: lote manual, depois CRM_SYNC_WORKER_ENABLED=true
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).