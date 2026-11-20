# C-20 — Sincronização com CRM (outbox → Singu)

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Sincronização com CRM (outbox → Singu).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: CLAUDE.md (reativação deliberada)
- **Existe hoje** (evidência da auditoria): Flag crm.integration lida na Edge (supabase/functions/crm-integration/index.ts:522-525); schedule do crm-sync-worker.yml comentado (vars.CRM_SYNC_WORKER_ENABLED)
- **Falta**: decisão de reativar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Contatos não sobem para o CRM

## Dependências

decisão do dono

## Critério de aceite

- CLAUDE.md (reativação deliberada)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).