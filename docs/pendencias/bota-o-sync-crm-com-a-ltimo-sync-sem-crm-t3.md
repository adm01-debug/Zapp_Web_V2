# T3 — Botão Sync CRM com "último sync"/"Sem CRM"

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.3 Prompt Lovable — Painel de Inteligência Comercial

## Descrição e origem

Botão Sync CRM com "último sync"/"Sem CRM".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.3 Prompt Lovable — Painel de Inteligência Comercial).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Toast com score, badge de último sync, estado "Sem CRM"
- **Existe hoje** (evidência da auditoria): Menu "Sincronizar CRM" com toast de score (ContactActionButtons.tsx:30-55); CRMSyncButton com lastSyncTime está órfão (CRMAutoSync.tsx:95-130); sem CRM o botão some
- **Falta**: Usar o botão com badge; estado "Sem CRM"
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Toast com score, badge de último sync, estado "Sem CRM"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).