# Dossiê — claude__feat-talkx-x048-estados-servico-261101-2100 (PR #2548)

- Ref: `origin/claude/feat-talkx-x048-estados-servico-261101-2100` · tip `764db93f` · merge-base `1252bb5a` (1 commit).
- PR #2548 (CLOSED, não mergeada em 2026-11-02). Comentário de fechamento: congelamento de features (#2545) — TalkX fora dos 9 fluxos críticos; "branch preservada". Não é prova de incorporação.
- Triagem 2804 dizia `DUPLICATA_PROVAVEL` — só parcialmente verdade (ver ViewRouter).

## Propósito
X048 (TL-106): ligar os estados de serviço do Talk X aos botões reais — (1) `useTalkXServiceStatus` ganha campo `crm` (stub `'ok'`); (2) novo `ServiceStatusSheet` (painel lateral WhatsApp / CRM 360 / Tempo real); (3) `TalkXSegments` mostra `TalkXCrmUnavailableState` quando `crm === 'unavailable'` e o botão "Ver status dos serviços" abre o sheet; (4) `ViewRouter` mostra `TalkXNoPermissionState` para `talkx` sem permissão **com `onContactAdmin → team-chat`**; (5) 3 arquivos de teste (9 testes); (6) P046.json X047/X048 → DONE_VERIFIED.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/pages/ViewRouter.tsx` | **PARCIAL** — a main já renderiza `TalkXNoPermissionState` para `talkx` (commit `11efe5fa1`, PR #2806, merged 2026-11-10), mas **sem** `onContactAdmin`: o botão "Falar com o administrador" não aparece (states.tsx:207 só renderiza o botão se a prop existir). | `git show origin/main:src/pages/ViewRouter.tsx` L141-143: `if (currentView === 'talkx') { return <TalkXNoPermissionState />; }`; `git grep onContactAdmin origin/main -- src/` só em `kit/states.tsx` e teste do kit. |
| `src/hooks/integrations/useTalkXServiceStatus.ts` | **PERDIDA** — main não tem `CrmStatus` nem campo `crm` (`return { whatsapp: { connected } }`). Último commit na main: `ecfdb26ff` (#1911), anterior à branch. | `git grep CrmStatus origin/main -- src/` → vazio. |
| `src/components/talkx/kit/ServiceStatusSheet.tsx` | **PERDIDA** — não existe; nada equivalente ("StatusSheet", "Status dos serviços") na main. `onViewStatus` de `TalkXCrmUnavailableState` nunca é passado fora de `__dev__`/testes. | `git ls-tree origin/main src/components/talkx/kit/`; `git grep -E "StatusSheet|status dos serviços" origin/main -- src/` → só states.tsx:175 (texto do botão). |
| `src/components/talkx/TalkXSegments.tsx` | **PERDIDA** — main importa só `TalkXQueryBoundary` (L13); não chama `useTalkXServiceStatus` nem renderiza `TalkXCrmUnavailableState`. | `git show origin/main:src/components/talkx/TalkXSegments.tsx` L13. |
| `src/components/talkx/__tests__/TalkXSegments.crmUnavailable.test.tsx` | PERDIDA (depende dos itens acima). | ausente na main. |
| `src/hooks/integrations/__tests__/useTalkXServiceStatus.test.ts` | PERDIDA — não há teste unitário do hook na main (só `TalkXView.whatsapp-band.test.tsx` usa o hook real indiretamente). | `git ls-tree origin/main src/hooks/integrations/__tests__/` sem o arquivo. |
| `src/pages/__tests__/ViewRouter.talkx-permission.test.tsx` | PERDIDA — #2806 não trouxe teste; `ViewRouter.talkx-kit-gate.test.tsx` cobre só a prancha `talkx-kit`. | `git grep -E "Falar com|team-chat" origin/main -- src/pages/__tests__/` → vazio. |
| `docs/reconciliation/tasks/P046.json` | PERDIDA (valor baixo) — X047 e X048 continuam `PARTIAL` na main; `status_counts.DONE_VERIFIED=2`. Obs.: a branch marcava X047 como DONE citando PR #2546 (matriz de testes) — status de X047 deve ser confirmado separadamente antes de portar. | python sobre `git show origin/main:docs/reconciliation/tasks/P046.json`. |

Observação sobre o valor de negócio: com `crm` sempre `'ok'` (stub), o `TalkXCrmUnavailableState` em Segmentos nunca aparece em produção hoje — é infraestrutura para CAP-092. O ganho imediato real é o botão "Falar com o administrador" ligado no ViewRouter e os testes.

## Veredito
**PERDIDA_PARCIAL** (confiança alta). Só a troca `RestrictedView → TalkXNoPermissionState` entrou (via #2806, sem a ação do botão). O resto (hook `crm`, sheet, integração em Segmentos, 3 testes, P046) não está na main e ainda aplica limpo (todos `ABSENT_APPLIES_CLEAN`; só ViewRouter conflita, e a resolução é trivial: adicionar a prop).

`apagar_branch_seguro = false`.

Contexto para o dono (não muda o veredito): a PR foi fechada pelo congelamento de features do TalkX (#2545). Se o congelamento ainda vale, a recuperação fica em fila; é feature, não bug.

## Lacunas a recuperar (ordem de porte)

### 1. `src/pages/ViewRouter.tsx` — ligar o botão (alto, 2 linhas)
Trocar na main (L142):
```tsx
return <TalkXNoPermissionState />;
```
por
```tsx
return (
  <TalkXNoPermissionState
    onContactAdmin={onNavigateTo ? () => onNavigateTo('team-chat') : undefined}
  />
);
```
(`onNavigateTo` já é prop do ViewRouter e é usado em `RestrictedView` na linha seguinte.)

### 2. `src/hooks/integrations/useTalkXServiceStatus.ts` — campo `crm` (médio)
```ts
export type CrmStatus = 'ok' | 'unavailable' | 'not_configured';

export interface TalkXServiceStatus {
  whatsapp: { connected: boolean | null };
  /** Estado do CRM 360 — stub 'ok' até CAP-092 expor o sinal de disponibilidade. */
  crm: CrmStatus;
}
// ...
return { whatsapp: { connected }, crm: 'ok' };
```
Atenção: 3 testes na main mockam o hook sem `crm` (`TalkXHelpFoco.test.tsx:31`, `TalkXView.ajuda-teclado.test.tsx:33`, `TalkXView.routing.test.tsx:32`) — não quebram (mock em runtime), mas podem acusar tipo se o mock for tipado.

### 3. `src/components/talkx/kit/ServiceStatusSheet.tsx` — novo (médio)
Conteúdo integral em `git show origin/claude/feat-talkx-x048-estados-servico-261101-2100:src/components/talkx/kit/ServiceStatusSheet.tsx` (97 linhas; sem deps novas: lucide-react, `cn`, tipo do hook). Expõe `data-testid="service-status-sheet"` e botão `aria-label="Fechar painel de status"`; 3 linhas: WhatsApp (`status.whatsapp.connected`), CRM 360 (`crm==='ok'→true`, `'not_configured'→null`, senão `false`), Tempo real (`null`).

### 4. `src/components/talkx/TalkXSegments.tsx` — integração (médio)
```tsx
import { TalkXQueryBoundary, TalkXCrmUnavailableState } from './kit/states';
import { ServiceStatusSheet } from './kit/ServiceStatusSheet';
import { useTalkXServiceStatus } from '@/hooks/integrations/useTalkXServiceStatus';
// no componente:
const [statusSheetOpen, setStatusSheetOpen] = useState(false);
const serviceStatus = useTalkXServiceStatus();
// no return: envolver em <>…</>, antes do grid:
{statusSheetOpen && (
  <ServiceStatusSheet status={serviceStatus} onClose={() => setStatusSheetOpen(false)} />
)}
// dentro de <div className="min-w-0 space-y-4">, como primeiro filho:
{serviceStatus.crm === 'unavailable' && (
  <TalkXCrmUnavailableState onViewStatus={() => setStatusSheetOpen(true)} />
)}
```

### 5. Testes (médio) — copiar da branch
- `src/pages/__tests__/ViewRouter.talkx-permission.test.tsx` (3 testes: agent vê o estado; botão chama `onNavigateTo('team-chat')`; admin não bloqueado).
- `src/hooks/integrations/__tests__/useTalkXServiceStatus.test.ts` (3 testes: true / false / null em erro).
- `src/components/talkx/__tests__/TalkXSegments.crmUnavailable.test.tsx` (3 testes; mocka hook com `crm:'unavailable'`, `useTalkXSegments`, `useAuth`, supabase, framer-motion, sonner). Verificar se a assinatura de `useTalkXSegments` na main ainda bate com o mock (campos `runBulkAction`, `isBulkRunning` etc.).
`git show origin/claude/feat-talkx-x048-estados-servico-261101-2100:<caminho>` para cada um.

### 6. `docs/reconciliation/tasks/P046.json` (baixo)
X048 → `DONE_VERIFIED` após itens 1-5 mergeados; X047 só se PR #2546 (matriz `talkxStates.matrix.test.tsx`) estiver na main — confirmar antes. Ajustar `status_counts`.

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL` (`apagar_branch_seguro = false`). Tentei refutar por três vias (main já cobre / remoção deliberada / não encaixa mais) e nenhuma derruba o veredito. main em `dac285f62`.

Checagens feitas (todas contra `origin/main`):
1. **ViewRouter — lacuna real e de alto valor.** `git show origin/main:src/pages/ViewRouter.tsx` L141-143 (bloco visto em L138-146 do arquivo atual): `if (currentView === 'talkx') { return <TalkXNoPermissionState />; }` — sem `onContactAdmin`. `kit/states.tsx:207` só renderiza `GhostButton "Falar com o administrador"` se a prop existir, logo o botão hoje **não aparece**. `git grep -n onContactAdmin origin/main -- src/` → só `kit/states.tsx:194/196/207` e `kit/__tests__/states.test.tsx` (nenhum consumidor real).
2. **Não foi omissão deliberada.** `git log -S"currentView === 'talkx'" --oneline origin/main -- src/pages/ViewRouter.tsx` → único commit `11efe5fa1` (#2806, 2026-11-10). O corpo do commit cita como motivação "botão de contato ao administrador", mas o diff aplicado não passa a prop — omissão, não decisão. `git log -S"onContactAdmin={onNavigateTo" --oneline origin/main` → vazio (nenhum revert/remoção).
3. **Hook sem `crm`.** `git grep -n CrmStatus origin/main -- src/` → vazio; `origin/main:src/hooks/integrations/useTalkXServiceStatus.ts` termina em `return { whatsapp: { connected } };`; último commit do arquivo `ecfdb26ff` (#1911), anterior à branch.
4. **`ServiceStatusSheet` inexistente e `onViewStatus` sem consumidor.** `git grep -n -E "StatusSheet|service-status" origin/main -- src/` → vazio; `git grep -n onViewStatus origin/main -- src/` → só definição em `kit/states.tsx:163-175` e `kit/__tests__/states.test.tsx`. `TalkXCrmUnavailableState` só é usado em `__dev__/TalkXKit.tsx:185` e `kit/states.tsx:341` (estado forçado) — nenhum uso em tela de produção.
5. **TalkXSegments sem integração.** `origin/main:src/components/talkx/TalkXSegments.tsx:13` importa só `TalkXQueryBoundary`; grep por `ServiceStatus|CrmUnavailable|statusSheet` no arquivo da main → vazio.
6. **Testes ausentes.** `git ls-tree --name-only origin/main src/pages/__tests__/ | grep talkx` → só `ViewRouter.talkx-kit-gate.test.tsx`; `src/hooks/integrations/__tests__/` sem `useTalkXServiceStatus.test.ts`; `src/components/talkx/__tests__/` sem `TalkXSegments.crmUnavailable.test.tsx`.
7. **P046 confirmado:** X047 e X048 ainda `PARTIAL` em `origin/main:docs/reconciliation/tasks/P046.json`.
8. **Encaixe no código atual (porte viável):** o teste `ViewRouter.talkx-permission.test.tsx` casa com a API da main — `ViewRouter.tsx:118` desestrutura `{ roles, permissions, loading, permissionsLoading }` (exatamente o que o mock entrega) e `onNavigateTo?: (viewId: string) => void` existe (`ViewRouter.tsx:26`). Portável quase como está.

Ressalvas que não mudam o veredito, mas ajustam o porte:
- **O teste de Segmentos da branch NÃO roda na main como está** (verificado, não só "conferir"): o mock de `useTalkXSegments` no teste (`...crmUnavailable.test.tsx` L17-34) não devolve `viewMode`, `setViewMode`, `isSelected`, `libraryStats`, `libraryStatsLoading`, `libraryStatsError`, `refetchLibraryStats`, que o hook real da main devolve (`origin/main:src/hooks/integrations/useTalkXSegments.ts:810-837`) e a tela consome. Porte do item 5 do plano exige completar o mock.
- **O stub `crm: 'ok'` contradiz o docstring vigente do próprio arquivo na main** (`useTalkXServiceStatus.ts` L20-24: "Fora desta entrega … `crm` … depende do sinal de CAP-092, ainda parcial"). A branch adiciona o campo sem atualizar esse parágrafo. Não é motivo para OBSOLETA (nada na main substitui o trabalho), mas o porte dos itens 2-4 deve ou atualizar o docstring ou ficar atrás de CAP-092; o valor imediato real está nos itens 1 e 5.
