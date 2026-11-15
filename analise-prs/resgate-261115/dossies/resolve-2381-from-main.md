# Dossiê — `resolve-2381-from-main` (PR #2419, fechada 2026-11-01 sem merge)

**Propósito.** Motor do Copiloto RADAR (CV-021–045) no `ai-jobs-worker` + telas das Fases 4–6 (RadarPanel/RadarLive/RadarCards, hooks `useCopilotSession`/`useLiveSuggestions`/`useRadarPanel`, dados `src/data/copilot/*`), migration `20261030200000_copilot_live_motor.sql` e **montagem do `RadarLive` no `ChatInputArea`**. Commits: `dbfee9afc`, `fc0e79782`, `85bf846aa` (tip). Fechada como "supersedida por #2486" (também fechada sem merge); o conteúdo entrou na main por #2828 (`11841dba9`, 2026-11-10) e #3127 (`f369f88b2`, 2026-11-15).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261030200000_copilot_live_motor.sql` | **INCORPORADA** (renomeada) | `diff` byte-idêntico com `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql` (exit 0); commit `f369f88b2` (#3127). Produção: `schema_migrations` tem `20261115010000 copilot_live_motor`; colunas `last_contact_message_at…brinde_evidence` em `copilot_sessions`, `tier` em `copilot_insights`, trigger `trg_copilot_tick_on_contact_message`, função `enqueue_copilot_tick_on_contact_message`, flag `ai.capability.copilot_live enabled=false` — todos presentes (db_query 2026-11-15). |
| `scripts/db-audit/realtime-publication-baseline.json` | INCORPORADA | main lista `public.copilot_insights` (JSON minificado, linha 1); `pg_publication_tables` em produção também tem `public.copilot_insights`. |
| `supabase/functions/ai-jobs-worker/index.ts` | INCORPORADA (evoluída) | main tem `handleCopilotTickJob`, `HANDLERS["copilot.tick"]`, `EFFECTFUL_KINDS` com `copilot.tick`, `supabase` no input. Diferença única: usa `readCapabilityFlagFailClosed` em vez de `readCapabilityFlag` (fail-closed, mais seguro — #3127). |
| `supabase/functions/_shared/copilot-tick.ts` | INCORPORADA (evoluída) | main troca `parseModelOutput(gen.data)` por extração de `choices[0].message.content` + `JSON.parse` + `safeParse` — corrige o bug 1 do Qodo em #2419 (envelope do provedor passava como objeto vazio). Também adiciona `DECISION_ROLES` e `isRealDate`. A versão da branch é a **defeituosa**. |
| `supabase/functions/_shared/__tests__/copilot-tick.test.ts` | INCORPORADA (ajustada ao envelope `choices[...]`) | diff branch→main só nas 2 linhas do gerador falso. |
| `src/hooks/copilot/useCopilotSession.ts` | INCORPORADA (evoluída) | main consulta `.eq('contact_id', contactId).order('started_at',desc).limit(1)` em vez de `.eq('conversation_id', contactId)`; comentário atualizado. `contact_id` existe em `copilot_sessions` (db_query). |
| `src/components/inbox/copilot/__tests__/RadarLive.test.tsx` | INCORPORADA | mock `limit: () => query` acompanha a cadeia nova do hook; "rótulo"→"rotulo" só no nome do `it`. |
| `src/components/inbox/copilot/RadarCards.tsx` | INCORPORADA | única linha divergente: `bg-amber-500 … text-white` → `bg-warning … text-warning-foreground` (token do design system). |
| `src/components/inbox/copilot/RadarPanel.tsx` | INCORPORADA (evoluída) + **lacuna cosmética** | main acrescenta tratamento de DND (`isDnd`) em todo o corpo (bug 14 do Qodo). Porém o cabeçalho da main tem mojibake: `origin/main:…/RadarPanel.tsx:3-4` = "encãixado", "ãão perturbe" (introduzido em `11841dba9`); a branch tem "encaixado"/"não perturbe". Comentário explicativo dos atalhos (Ctrl+Shift+R / Ctrl+1..3) removido na main — sem efeito. |
| `src/components/inbox/chat/ChatInputArea.tsx` | **PERDIDA** | main não importa nem monta `RadarLive` (`git grep RadarLive origin/main -- src/` → só `RadarLive.tsx` e seu teste). Nenhum outro componente usa `<RadarPanel` nem `useRadarPanel(` (grep em `src/` fora de `copilot/`). O mount nunca entrou: ausente em `11841dba9` e `be8aa06a1`. |
| Demais 18 arquivos (`BrindeMeter`, `InsightCard`, `LiveSuggestions`, `MissingQuestions`, `OccasionAlert`, `RadarLive`, `StageIndicator`, `StakeholdersCard`, `DecisionMakerBadge`, testes, `src/data/copilot/*`, `useLiveSuggestions`, `useRadarPanel`) | INCORPORADA | `line_check.missing_in_main = 0`; diffs branch→main só newline final. |

## Veredito: `PERDIDA_PARCIAL`

Backend (migration, trigger, handler, flag) e todas as telas estão na main e em produção, **mas o painel RADAR ao vivo (Fases 4–6) não está ligado a nenhuma tela**: `RadarLive.tsx` é código morto na main. Com a flag ligada, o motor grava `copilot_sessions`/`copilot_insights` e nenhum vendedor vê o resultado. Não é DECISAO_DONO: o custo de LLM já foi aceito ao mergear #3127 (gate pela flag), e montar o painel não contradiz regra vigente — a `ChatInputArea` da main já monta `RadarPhase7Panel` e `RadarPhase8to15Panel` na mesma posição e com o mesmo guard.

`apagar_branch_seguro = false` (há lacuna).

## Lacunas a recuperar

### 1. Montar `RadarLive` no `ChatInputArea` — valor **alto** (front, ~10 linhas)

Arquivo: `src/components/inbox/chat/ChatInputArea.tsx` (main). Inserir após o bloco `RadarPhase8to15Panel` (main L220–229), antes do `<div className={cn("px-4 py-3 border-t …")}>` (L231). `setNativeValue`, `inputRef`, `logic.isMobile`, `editingMessage`, `contactId` já existem no arquivo (L30, L48, L97, L137).

```diff
-import { useMemo, useRef } from 'react';
+import { lazy, Suspense, useMemo, useRef } from 'react';
 …
 import { RadarPhase8to15Panel } from '@/components/copilot/RadarPhase8to15Panel';
+// Fases 4–6 do RADAR (dados do motor de IA): sob demanda, fora do initial-js.
+const RadarLive = lazy(() => import('@/components/inbox/copilot/RadarLive'));
 …
       {!logic.isMobile && !editingMessage && (
         <RadarPhase8to15Panel … />
       )}
 
+      {!logic.isMobile && !editingMessage && contactId && (
+        <Suspense fallback={null}>
+          <RadarLive className="mx-4 mt-2" contactId={contactId} onDraftText={(text) => setNativeValue(inputRef, text)} />
+        </Suspense>
+      )}
+
       <div className={cn("px-4 py-3 border-t border-border bg-inbox-panel", …
```

Observações para quem portar: `RadarLive` retorna `null` sem sessão (`RadarLive.tsx:33`), então nada muda na UI enquanto a flag estiver desligada. Qodo (#2419, item 9) apontou que o guard `!logic.isMobile` impede o drawer móvel do `RadarPanel` de ser usado — decidir se mantém o guard (como os painéis vizinhos) ou libera em mobile. Verificar depois com `npx tsc --noEmit -p tsconfig.app.json` e `npx vitest run src/components/inbox/copilot`.

### 2. Corrigir mojibake no cabeçalho de `RadarPanel.tsx` — valor **baixo** (cosmético, 2 linhas)

`src/components/inbox/copilot/RadarPanel.tsx:3-4` na main: `encãixado` → `encaixado`, `"ãão perturbe"` → `"não perturbe"`.

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL` (lacuna principal confirmada), com **uma correção** e **um achado novo** (ambos reduzem o escopo a recuperar, não aumentam).

### Lacuna 1 (mount do RadarLive) — CONFIRMADA, valor alto
- `git grep -n RadarLive origin/main -- src/` → apenas `src/components/inbox/copilot/RadarLive.tsx:19,25` e `__tests__/RadarLive.test.tsx:25,72,75,82`. Nenhum consumidor.
- `git grep -n "RadarPanel\|useRadarPanel" origin/main -- src/` fora de `src/components/inbox/copilot/` → só `src/hooks/copilot/useRadarPanel.ts` (definição). Confirma que `RadarPanel` só é montado por `RadarLive`, que ninguém monta → cadeia inteira é código morto.
- `origin/main:src/components/inbox/chat/ChatInputArea.tsx` L1 = `import { useMemo, useRef } from 'react';` (sem `lazy`/`Suspense`); monta `RadarPhase7Panel` (L206–218) e `RadarPhase8to15Panel` (L220–229) e vai direto para o `<div className={cn("px-4 py-3 border-t …")}>` (L231). Sem `RadarLive`.
- **Não foi removido de propósito**: `git log -S'RadarLive' --oneline origin/main -- src/components/inbox/chat/ChatInputArea.tsx` → **zero commits**; o mount nunca existiu na main. Histórico do arquivo: `be8aa06a1`, `031d5e596`, `cbe99a4fd`, `e51662a9c` — nenhum revert/remoção do RADAR ao vivo. Mensagens de `11841dba9` (#2828 — "motor e telas RADAR Copiloto CV-021–060") e `f369f88b2` (#3127 — "liga o motor do RADAR — gatilho + handler") descrevem motor e componentes; nenhuma menciona desistir da montagem.
- **Ainda encaixa na main**: `setNativeValue` (`ChatInputArea.tsx:30`), `inputRef` (L86 prop / L106 do logic), `contactId` (L48), `editingMessage` (L45), `logic.isMobile` (L184/206/220) todos presentes. Contrato de `RadarLive` na main bate com o hunk: `export default function RadarLive({ contactId, onDraftText, className })` (`RadarLive.tsx:25`), `if (!session) return null` (L29–30 da main). O próprio cabeçalho do arquivo na main diz "Carregado sob demanda (lazy) pelo ChatInputArea" (`RadarLive.tsx:8`) — documentação que a main não cumpre.
- Impacto hoje é zero (produção: flag `ai.capability.copilot_live` = `false`, `copilot_sessions` = 0 linhas, `copilot_insights` = 0 linhas), mas o motor está instalado (`schema_migrations` 20261115010000 presente, trigger `trg_copilot_tick_on_contact_message` presente, colunas `contact_id` e `brinde_evidence` presentes — `db_query` 2026-11-15). Ligar a flag sem a lacuna = motor gravando sem ninguém ver.

### Lacuna 2 (mojibake) — CONFIRMADA, cosmética
`origin/main:src/components/inbox/copilot/RadarPanel.tsx:3-4`: "Pop-up **encãixado** no Chat Panel", "**ãão perturbe**". A branch tem o texto correto. Só comentário de cabeçalho.

### Correção à triagem: `scripts/db-audit/realtime-publication-baseline.json` não tem lacuna nenhuma (a triagem acertou o veredito INCORPORADA, mas por motivo incompleto)
O `missing_sample` do JSON (`public.whisper_messages`, `public.copilot_insights`) é artefato de formatação (branch indentada vs. main minificada). Comparando os conjuntos:
- `main-only: []`; `branch-only: ['public.audit_logs', 'public.payment_links']`; demais campos idênticos.
- As duas tabelas "só da branch" **não existem** na publicação real: `select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in ('audit_logs','payment_links','copilot_insights','whisper_messages')` → devolve apenas `copilot_insights` e `whisper_messages` (produção, 2026-11-15). Ou seja, o baseline da **main** é o correto e o da **branch** está obsoleto. Portar isso seria regressão. Nada a recuperar.

### Demais alegações de INCORPORADA — aferidas, todas verdadeiras
- Migration: `diff` de `85bf846aa:supabase/migrations/20261030200000_copilot_live_motor.sql` com `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql` → **exit 0** (byte-idêntica).
- `ai-jobs-worker/index.ts` na main: `HANDLERS["copilot.tick"]` (L287), `EFFECTFUL_KINDS` com `copilot.tick` (L306), import de `_shared/copilot-tick.ts` (L261).
- `_shared/copilot-tick.ts` na main: `choices?.[0]?.message?.content` + `JSON.parse` + `CopilotTier1Schema.safeParse` (L464–470) e idem tier 2 (L498–503) — a versão da main é a corrigida; a da branch é a defeituosa. Nada a portar.
- `useCopilotSession.ts` na main: `.eq('contact_id', contactId).order('started_at', {ascending:false}).limit(1)` (L109–113); coluna `contact_id` existe em produção.
- `RadarPanel.tsx`: main é superconjunto funcional — `isDnd` (L30/71/105/138/169/204/227/259/287–294/322/330), atalho `Ctrl+Alt+1..3` (L138–142), `aria-live` (L104–105), drawer móvel (L184). As 24 linhas "missing" são comentários e linhas reescritas pelo DND.
- `RadarCards.tsx`: badge presente na main com token do design system (`RadarCards.tsx:191-192`, `bg-warning`/`text-warning-foreground`). A linha "missing" é a versão antiga (`bg-amber-500`/`text-white`) — não portar.

`apagar_branch_seguro = false` mantido: a branch é o único lugar onde o hunk do mount existe.
