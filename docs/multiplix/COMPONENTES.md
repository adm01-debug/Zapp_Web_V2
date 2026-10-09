# Multiplix — Componentes e pontos de integração

> Inventário do que existe na ponta de dia de **2026-10-08**. Cada caminho citado existe no repositório:
> é a lista de onde mexer, não uma sugestão. O contrato `tests/contracts/multiplix-docs.contract.test.ts`
> confere este documento contra o disco e contra o código.

## Front — entrada do módulo

| Peça | Caminho | Papel |
|---|---|---|
| Rota lazy | `src/pages/lazyViews.ts` | Exporta `MultiplixView` com `lazyWithRetry(() => import('@/components/multiplix/MultiplixView'))` |
| Roteador | `src/pages/ViewRouter.tsx` | Mapeia `?view=multiplix` → `Views.MultiplixView` e bloqueia por `canAccess` |
| Navegação | `src/services/navigation.service.ts` | Entrada primária `id: 'multiplix'`, permissão `multiplix.dispatch.create` |
| Tela principal | `src/components/multiplix/MultiplixView.tsx` | Filtros de audiência (ramo/UF/busca), seleção de empresas, disparos recentes |
| Compositor | `src/components/multiplix/MultiplixComposerDialog.tsx` | Cria o rascunho do disparo a partir das empresas selecionadas |
| Monitor | `src/components/multiplix/MultiplixMonitor.tsx` | Progresso ao vivo, lista de destinatários, pausar/retomar/cancelar |

## Front — dados (hooks e lib)

| Peça | Caminho | Papel |
|---|---|---|
| Hooks de audiência | `src/hooks/integrations/useMultiplixAudience.ts` | `useMultiplixRamos/Ufs/Search/Count/Resolve` + `createMultiplixDraft` → edge `multiplix-audience` |
| Hooks de disparo | `src/hooks/integrations/useMultiplixDispatches.ts` | `useMultiplixDispatchesList/Dispatch/Recipients`, `useMultiplixDispatchAction`, `useCreateMultiplixDispatch` |
| Regra de aptidão (front) | `src/lib/multiplix-eligibility.ts` | Rótulos/trava usados pela UI para a decisão de aptidão |

## Backend — Edge Functions

| Função | Caminho | Papel |
|---|---|---|
| `multiplix-audience` | `supabase/functions/multiplix-audience/index.ts` | Busca/count/resolve no Singu com chave de serviço; cria o rascunho |
| `multiplix-dispatch` | `supabase/functions/multiplix-dispatch/index.ts` | API do disparo; ações em `supabase/functions/multiplix-dispatch/actions/listing.ts`, `actions/inspect.ts`, `actions/lifecycle.ts`, `actions/blocks.ts` e `actions/audience.ts` |
| `multiplix-send` | `supabase/functions/multiplix-send/index.ts` | Drena a fila e envia pelo Evolution GO (invocada pelo cron) |
| `multiplix-voices` | `supabase/functions/multiplix-voices/index.ts` | Vozes IA: ativos e concessões de uso |
| Compartilhado | `supabase/functions/_shared/multiplix-eligibility.ts`, `supabase/functions/_shared/multiplix-content.ts` | Aptidão e composição de conteúdo compartilhadas entre as edges |

## Testes que já cobrem o módulo

- Componentes: `src/components/multiplix/__tests__/MultiplixView.disparos-recentes.test.tsx`, `src/components/multiplix/__tests__/MultiplixMonitor.recipients.test.tsx`
- Hooks: `src/hooks/integrations/__tests__/useMultiplixDispatches.criacao.test.tsx`, `src/hooks/integrations/__tests__/useMultiplixDispatches.edge.test.tsx`
- Gate da rota: `src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx`
- Aptidão: `supabase/functions/_shared/__tests__/multiplix-eligibility.test.ts`
- Edges: `supabase/functions/multiplix-audience/index.test.ts`, `supabase/functions/multiplix-dispatch/__tests__/draft.test.ts`, `supabase/functions/multiplix-dispatch/__tests__/f53-rate-limit.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/lifecycle.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/inspect.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/listing.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/blocks.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/audience.test.ts`
- Contratos: `tests/contracts/multiplix-audience.contract.test.ts`, `tests/contracts/multiplix-dispatch-domain-api.contract.test.ts`, `tests/contracts/multiplix-dispatch-no-secret-leak.contract.test.ts`, `tests/contracts/multiplix-dispatch-write-path.contract.test.ts`

## Banco — provas e guardas

- `scripts/db-audit/multiplix-rls.test.sh`, `scripts/db-audit/multiplix-scope.test.sh`, `scripts/db-audit/multiplix-resolve-escopo.test.sh`, `scripts/db-audit/multiplix-delivery-leases.test.sh`
- `scripts/db-audit/multiplix-audience-parity.mjs`, `scripts/db-audit/multiplix-send-mutation.py`

## Documentos irmãos

`docs/multiplix/SCHEMA.md` (tabelas/RPCs), `docs/multiplix/ARQUITETURA.md` (diagramas e métrica→fonte),
`docs/multiplix/CANAL.md` (capacidades do canal), `docs/multiplix/PERMISSOES.md` (papéis e carteira),
`docs/multiplix/PONTE_SINGU.md` (ponte com o Singu) e `docs/multiplix/DESIGN_TOKENS_MAP.md` (tokens + receita de módulo).
