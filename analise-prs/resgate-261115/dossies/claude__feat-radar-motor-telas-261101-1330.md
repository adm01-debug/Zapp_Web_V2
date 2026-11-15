# Dossiê — claude__feat-radar-motor-telas-261101-1330 (PR #2486)

**Ref:** `origin/claude/feat-radar-motor-telas-261101-1330` (tip `34d14be7`, merge-base `1252bb5a`, 22 commits, 2026-11-01)
**PR #2486:** "feat: motor e telas do RADAR Copiloto (CV-021–060), nasce desligado" — CLOSED 2026-11-01 pelo congelamento de features (#2545). Triagem 2804: PERDIDA.
**main analisada:** `dac285f62`.

## Propósito
Motor `copilot.tick` (edge `_shared/copilot-tick.ts` + roteamento no `ai-jobs-worker`), 11 componentes do painel RADAR (`src/components/inbox/copilot/`), 3 hooks (`src/hooks/copilot/`), dados (`src/data/copilot/`), migration `20261031160000_copilot_radar_delta_columns.sql`, testes Deno/Vitest, e **integração na Inbox**: `<RadarLive />` lazy dentro de `ChatInputArea`.

## Achado central
Praticamente tudo entrou na `main` pela PR **#2828** (`11841dba9` "feat(copilot): motor e telas RADAR Copiloto CV-021–060"), mas **#2828 não tocou `ChatInputArea.tsx`** (`git show --stat 11841dba9 | grep -c ChatInputArea` = 0). Resultado: `RadarLive.tsx` existe na main e **ninguém o importa** (`git grep "copilot/RadarLive" origin/main -- src/` → só `RadarLive.tsx` e seu teste). O painel ao vivo das Fases 4–6 é código morto na main — o cabeçalho do próprio arquivo diz "Carregado sob demanda (lazy) pelo ChatInputArea", o que não acontece.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/inbox/chat/ChatInputArea.tsx` | **PERDIDA** — lazy import + render de `<RadarLive>` ausentes | `git grep -n 'RadarLive\|lazy\|Suspense' origin/main -- <arq>` vazio; main L1 `import { useMemo, useRef } from 'react'`; `git log -S'RadarLive' origin/main -- <arq>` vazio (nunca entrou, não foi removido de propósito). `setNativeValue` e `contactId` existem em main L30/L48 — o hunk aplica. |
| `src/components/inbox/__tests__/ChatPanel.atalhos-busca.test.tsx` | PERDIDA (dependente) — `vi.mock('../copilot/RadarLive')` | `git grep RadarLive origin/main -- <arq>` vazio. Só é necessário junto com o hunk acima (RadarLive usa `useAuth`, testes não montam AuthProvider). |
| `src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx` | PERDIDA (dependente) — idem | idem |
| `src/components/inbox/chat/__tests__/ChatInputArea.limite-enter.test.tsx` | PERDIDA (dependente) — idem | idem |
| `src/components/inbox/copilot/RadarLive.tsx` + 10 componentes, hooks, data, 4 testes Vitest, `copilot-tick.test.ts` | INCORPORADA | `line_check.missing_in_main=0` em todos; `11841dba9` (#2828) lista os 25 arquivos. `useRadarPanel.ts` PRESENT_BYTE. |
| `supabase/functions/_shared/copilot-tick.ts` | INCORPORADA em outra forma | main L22 usa `npm:@supabase/supabase-js@2.87.1` (branch: `esm.sh`); main L468-470/L502-504 usa `Schema.safeParse` com comentário "evita TS2589" no lugar de `parseModelOutput` — escolha deliberada, mesmo comportamento (tier1 inválido → `COPILOT_TIER1_CONTRACT`, tier2 inválido não perde tier1). |
| `supabase/functions/_shared/ai-feature-flags.ts`, `ai-jobs-worker/index.ts` | INCORPORADA | PRESENT_REVERSE_APPLIES |
| `supabase/migrations/20261031160000_copilot_radar_delta_columns.sql` | INCORPORADA e **aplicada em produção** | `missing_in_main=0`; `schema_migrations` tem `20261031160000 copilot_radar_delta_columns`; `copilot_sessions` tem `comm_style text`, `decision_role text`, `brinde_deadline date`, `state_version integer`, `last_processed_message_at timestamptz`. |
| `src/components/inbox/copilot/RadarCards.tsx` (1 linha) | INCORPORADA em outra forma | main L192 badge com tokens `bg-warning text-warning-foreground` em vez de `bg-amber-500 text-white` — padronização de tema, cosmético. |
| `scripts/db-audit/realtime-publication-baseline.json` | INCORPORADA | main L1 (JSON compacto) contém `"public.copilot_insights"`. |
| `scripts/db-audit/runtime-config.test.sh` | INCORPORADA (conteúdo); mode `100755` não entrou | main L38 e L66 têm `copilot_insights`; `git ls-tree origin/main` = `100644`. Irrelevante: `db-guard.yml:1176` invoca via `bash scripts/db-audit/runtime-config.test.sh`. |
| `supabase/deployment-manifest.json` | nenhum | artefato gerado (hashes/contagem); main já regenerado (`source_file_count: 179`). |

## Veredito: PERDIDA_PARCIAL (confiança alta)
Motor, telas, hooks, dados, testes e migration estão na main (#2828). Falta **só a integração na UI**: montar `<RadarLive>` no `ChatInputArea` (7 linhas) + 3 mocks de teste. Sem isso o painel ao vivo (Fases 4–6) nunca aparece, mesmo com a flag `ai.capability.copilot_live` ligada. Não é DECISAO_DONO: montar o componente não gera custo externo (os ticks/LLM já estão no worker da main, disparados pelo trigger) e não contradiz regra vigente — RadarLive retorna `null` sem sessão, Inbox fica igual com a flag desligada.

Contexto: a PR foi fechada pelo congelamento de features (#2545), não por rejeição técnica. #2828 reabriu o escopo e trouxe tudo menos este arquivo.

## Lacunas a recuperar (hunks exatos)

### 1. `src/components/inbox/chat/ChatInputArea.tsx` — valor médio
```diff
@@ -1,10 +1,12 @@
-import { useMemo, useRef } from 'react';
+import { lazy, Suspense, useMemo, useRef } from 'react';
 ...
 import { RadarPhase7Panel } from '@/components/copilot/RadarPhase7Panel';
+// Fases 4–6 do RADAR (dados do motor de IA): sob demanda, fora do initial-js.
+const RadarLive = lazy(() => import('@/components/inbox/copilot/RadarLive'));
 import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';
@@ -205,6 +207,12 @@ export function ChatInputArea(props: ChatInputAreaProps) {
         />
       )}
 
+      {!logic.isMobile && !editingMessage && contactId && (
+        <Suspense fallback={null}>
+          <RadarLive className="mx-4 mt-2" contactId={contactId} onDraftText={(text) => setNativeValue(inputRef, text)} />
+        </Suspense>
+      )}
+
       <div className={cn("px-4 py-3 border-t border-border bg-inbox-panel", logic.isMobile && "px-2.5 py-2 safe-area-bottom")}>
```
Na main atual o ponto de inserção é logo após o bloco `<RadarPhase8to15Panel ... />` (main L221+), antes do `<div className={cn("px-4 py-3 border-t ...`. Nota: a main hoje importa `RadarPhase7Panel` e `RadarPhase8to15Panel` em `@/components/copilot/`; `RadarLive` vive em `@/components/inbox/copilot/` — caminhos distintos, sem conflito. Preferir colocar o `const RadarLive = lazy(...)` depois do último `import` (lint `import/first`).

### 2–4. Mocks de teste (valor baixo, obrigatórios junto com o item 1 — RadarLive usa `useAuth`)
- `src/components/inbox/__tests__/ChatPanel.atalhos-busca.test.tsx` (após `vi.mock('../CRMAutoSync', ...)`, ~L100):
  ```ts
  // RadarLive (lazy no ChatInputArea) usa useAuth; estes testes não montam AuthProvider.
  vi.mock('../copilot/RadarLive', () => ({ default: () => null }));
  ```
- `src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx` (após `vi.mock('../tabs/FileActionsMenu', ...)`, ~L74): mesmas 2 linhas.
- `src/components/inbox/chat/__tests__/ChatInputArea.limite-enter.test.tsx` (após `vi.mock('@/components/inbox/CustomEmojiPicker', ...)`, ~L100):
  ```ts
  vi.mock('@/components/inbox/copilot/RadarLive', () => ({ default: () => null }));
  ```
Verificar depois: `npx vitest run src/components/inbox/__tests__/ChatPanel.atalhos-busca.test.tsx src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx src/components/inbox/chat/__tests__/ChatInputArea.limite-enter.test.tsx` e `npx tsc --noEmit -p tsconfig.app.json`.

## apagar_branch_seguro: false
A lacuna é pequena e está integralmente transcrita acima, mas o veredito não é INCORPORADA/OBSOLETA. Após portar o item 1 (+ mocks) a branch pode ser apagada.

## Verificação adversarial

**Parecer: CONCORDO com PERDIDA_PARCIAL** (tentei refutar, não consegui). `apagar_branch_seguro=false` mantido.

Refutações tentadas e resultado:

1. **A lacuna já estaria na main por outro caminho?** Não. `git grep -n "RadarLive" origin/main -- src/` devolve só `src/components/inbox/copilot/RadarLive.tsx:19,25` e `src/components/inbox/copilot/__tests__/RadarLive.test.tsx:25,72,75,82` — nenhum importador em qualquer grafia. `git show origin/main:src/components/inbox/chat/ChatInputArea.tsx` L1 = `import { useMemo, useRef } from 'react';` (sem `lazy`/`Suspense`); L7-8 importam `RadarPhase7Panel` e `RadarPhase8to15Panel`, nunca `RadarLive`.
2. **Foi removida de propósito?** Não. `git log -S'RadarLive' --oneline origin/main -- src/components/inbox/chat/ChatInputArea.tsx` → vazio: o trecho nunca existiu na main, logo não há revert/remoção deliberada a respeitar.
3. **O hunk ainda encaixa na main atual?** Sim. `setNativeValue` importado em L30, `inputRef` em L86/L106, props `editingMessage` L45 e `contactId` L48, `logic.isMobile` em uso (L184, L206, L220). O bloco irmão `{!logic.isMobile && !editingMessage && (<RadarPhase8to15Panel … onInsertText={(text) => setNativeValue(inputRef, text)} />)}` vai de L220 a ~L229, e o `<div className={cn("px-4 py-3 border-t …` começa em L231 → ponto de inserção L230. A assinatura casa: `origin/main:src/components/inbox/copilot/RadarLive.tsx:19-25` expõe exatamente `{ contactId, onDraftText, className }` com `export default`.
4. **Os 3 mocks de teste são realmente necessários/ausentes?** Ausentes (`git grep RadarLive` nos três arquivos da main → vazio) e necessários: `RadarLive.tsx:13` chama `useAuth`. Em `ChatInputArea.limite-enter.test.tsx:52` já existe `vi.mock('@/hooks/auth/useAuth', …)`, então esse arquivo talvez passe sem o mock — detalhe a confirmar rodando o vitest, não altera o veredito.
5. **Mitigação que a triagem não registrou (reduz impacto, não anula a lacuna):** a main **já exibe** parte das Fases 4–6 pela aba IA da Inbox — `origin/main:src/components/inbox/tabs/AiTab.tsx:21-22` usa `useCopilotSession`/`useLiveSuggestions` e L116 renderiza `<LiveSuggestions …>` dentro do card "Plays em tempo real". Ou seja, as sugestões do motor são alcançáveis hoje. O que continua inalcançável é o painel RADAR completo: `git grep -ln` por `StageIndicator|StakeholdersCard|BrindeMeter|OccasionAlert|MissingQuestions|RadarCards|RadarPanel` fora de `src/components/inbox/copilot/` → nenhum arquivo (só `InsightCard` aparece, e é outro componente, o do TalkX/dashboard). Logo RadarLive + RadarPanel + 7 cartões seguem código morto. Valor "médio" da lacuna 1 confirmado (nem alto, pois LiveSuggestions já aparece; nem nulo, pois o painel não).
6. **"Incorporada em outra forma" conferida nos pontos citados:** `origin/main:supabase/functions/_shared/copilot-tick.ts:467-470` (`JSON.parse` + `CopilotTier1Schema.safeParse` + `throw new CopilotTickError("COPILOT_TIER1_CONTRACT")`) e L502-504 (`CopilotTier2Schema.safeParse`, tier2 inválido não perde tier1) cobrem o `parseModelOutput` da branch; L22 `npm:@supabase/supabase-js@2.87.1`. `RadarCards.tsx:192` tem o badge com `bg-warning`/`text-warning-foreground` — cosmético. `realtime-publication-baseline.json` da main (JSON compacto, 1 linha) contém `"public.copilot_insights"` **e** `"public.whisper_messages"`: os 2 `missing_in_main` eram artefato de formatação, não lacuna.
7. **DECISAO_DONO?** Não se aplica: montar um componente que retorna `null` sem sessão (`RadarLive.tsx:30 if (!session) return null;`) não cria custo externo novo — os ticks/LLM já rodam no worker da main.

Nenhum hunk adicional de valor ≥ médio encontrado nos 34 arquivos do diff (os 8 com `line_check` de lacuna foram todos conferidos um a um).
