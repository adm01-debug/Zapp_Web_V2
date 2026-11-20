# GO-04 — Sincronizar histórico da conexão

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram

## Descrição e origem

Sincronizar histórico da conexão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: sync-all-messages → notSupported com HTTP 200 (supabase/functions/_shared/evolution-sync-actions.ts:158, 339-340)
- **Existe hoje** (evidência da auditoria): Sim. "Sincronizar Histórico" (ConnectionCard.tsx:151-153)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O toast mostra "Sincronização concluída! 0 mensagens…" (src/components/connections/ConnectionsView.tsx:75) quando nada foi feito

## Dependências

Nenhuma registrada.

## Critério de aceite

- sync-all-messages → notSupported com HTTP 200 (supabase/functions/_shared/evolution-sync-actions.ts:158, 339-340)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).