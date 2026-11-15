# Dossiê — claude__radar-motor-copilot-live-301030 (PR #2381, fechada sem merge em 2026-10-31)

**Ref:** `origin/claude/radar-motor-copilot-live-301030` · tip `fcf880a45` · merge-base `c4c7139e7` (2026-10-30)
**Propósito:** motor do Copiloto RADAR (`copilot.tick` no `ai-jobs-worker`, migration `20261030200000_copilot_live_motor.sql`, nasce desligado) + telas das Fases 4–6 (B·R·I·N·D·E, sugestões ao vivo, `RadarPanel`/`RadarLive`) montadas no `ChatInputArea` (commits `dbfee9afc`, `0dab1997e`, `fc0e79782`).

**Para onde foi na main:** #2828 (`11841dba9`, 2026-11-09 — motor + 11 componentes + hooks + testes, "zero churn": não tocou em arquivo existente) e #3127 (`f369f88b2`, 2026-11-15 — migration renomeada `20261115010000_copilot_live_motor.sql` + registro do handler no worker). Depois `2cf0153ae` endureceu o motor (DECISION_ROLES, `isRealDate`, parse do envelope do provedor).

## Veredito: PERDIDA_PARCIAL (confiança alta)

Tudo do motor, banco, dados, hooks, componentes e testes está na main (igual ou melhor). **Falta uma única peça funcional: ninguém monta `RadarLive` na Inbox** — a main tem `src/components/inbox/copilot/RadarLive.tsx` (cujo cabeçalho diz "Carregado sob demanda (lazy) pelo ChatInputArea"), mas `git grep RadarLive origin/main -- src` fora do próprio arquivo e dos testes devolve **vazio**. Painel RADAR das Fases 4–6 é código morto na main: quando o dono ligar `ai.capability.copilot_live`, o motor vai gravar sessões/insights e o vendedor não verá nada.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261030200000_copilot_live_motor.sql` | INCORPORADA (renomeada) | sha1 idêntico ao `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql` (`9488a142…`); prod: `schema_migrations` tem `20261115010000`, `pg_proc` tem `enqueue_copilot_tick_on_contact_message`, trigger `trg_copilot_tick_on_contact_message` existe, `feature_flags` `ai.capability.copilot_live enabled=false`, colunas `last_contact_message_at/last_processed_message_at/intent/stakeholders/brinde_evidence` e `copilot_insights.tier/latency_ms/data` existem |
| `supabase/functions/_shared/copilot-tick.ts` | OBSOLETA (main superior) | branch passa o envelope do provedor direto a `parseModelOutput` (bug apontado pelo Qodo #4 na PR); main extrai `choices[0].message.content` + `JSON.parse` + `safeParse` (`origin/main` ~l.461-475), valida `DECISION_ROLES` (l.53-55) e `isRealDate` (l.181-186); `npm:` em vez de `esm.sh` é padrão da main (`ai-jobs-worker/index.ts:34`) |
| `supabase/functions/_shared/__tests__/copilot-tick.test.ts` | OBSOLETA | `gerador` da main embrulha em `{choices:[{message:{content}}]}` (l.97-101) porque o motor da main parseia envelope; versão da branch só vale para o motor antigo |
| `supabase/functions/ai-jobs-worker/index.ts` | OBSOLETA (main mais segura) | main usa `readCapabilityFlagFailClosed` (l.260, 272; definida em `ai-feature-flags.ts:177`), decisão explícita no corpo da PR #3127 ("fail-closed"); branch usava `readCapabilityFlag` |
| `src/integrations/supabase/types.ts` | OBSOLETA | branch `tier: number \| null`; main `tier: number` (l.3319/3336/3353) porque `20261031160000_copilot_radar_delta_columns.sql:11-12` criou `tier smallint NOT NULL DEFAULT 1` |
| `src/hooks/copilot/useCopilotSession.ts` | INCORPORADA (equivalente) | branch `.eq('conversation_id', contactId)`; main `.eq('contact_id', contactId).order('started_at', desc).limit(1)` (l.108-112). O gatilho grava `conversation_id = contact_id = NEW.contact_id` (migration main l.86-87), logo as duas consultas devolvem a mesma linha |
| `src/components/inbox/copilot/RadarPanel.tsx` | INCORPORADA + 1 lacuna cosmética | main (via #2828) é superconjunto: trata `isDnd` em todo o corpo (l.104, 139, 170, 204-209, 222, 254, 317, 348...). Só faltam 2 linhas de comentário: main l.3-4 tem mojibake `encãixado` / `"ãão perturbe"` (branch: `encaixado` / `"não perturbe"`) |
| `src/components/inbox/copilot/RadarCards.tsx` | OBSOLETA | badge de alertas: branch `bg-amber-500 text-white`; main `bg-warning text-warning-foreground` (l.192) usa tokens do tema (`tailwind.config.ts:92-93`) — intencional |
| `src/components/inbox/copilot/__tests__/RadarLive.test.tsx` | INCORPORADA | diferenças só no mock (`limit` devolve `query` em vez de Promise) e acento no nome do teste; suíte da main passou no CI de #2828 |
| `scripts/db-audit/realtime-publication-baseline.json` | OBSOLETA | main é JSON compacto e já contém `public.copilot_insights` e `public.whisper_messages` (prod `pg_publication_tables` confirma ambas); `audit_logs`/`payment_links` que a branch mantinha foram removidos de propósito em `bd25801a2` (#2693) e não estão na publicação em prod |
| `src/components/inbox/chat/ChatInputArea.tsx` | **PERDIDA** | branch monta `RadarLive` (lazy) abaixo do `RadarPhase7Panel`; main não importa `RadarLive` em lugar nenhum (`git grep RadarLive origin/main -- src ':!**/RadarLive.tsx' ':!**/__tests__/**'` = vazio). Linhas removidas pela branch nesse arquivo (`RadarPhase8to15Panel`, `ConnectionHealthBanner`) são só desatualização — NÃO portar as remoções |
| Demais 18 arquivos (`BrindeMeter`, `LiveSuggestions`, hooks, `src/data/copilot/*`, testes…) | INCORPORADA | `missing_in_main = 0` no line_check; todos existem em `origin/main` (ls-tree) |

## Lacunas a recuperar

### 1. Montar `RadarLive` no `ChatInputArea` — valor ALTO (sem isso a feature RADAR Fases 4–6 nunca aparece)
Arquivo: `src/components/inbox/chat/ChatInputArea.tsx` (main). Portar só as adições abaixo; manter `RadarPhase8to15Panel` e `ConnectionHealthBanner` da main.

```diff
-import { useMemo, useRef } from 'react';
+import { lazy, Suspense, useMemo, useRef } from 'react';
 ...
 import { RadarPhase8to15Panel } from '@/components/copilot/RadarPhase8to15Panel';
+// Fases 4–6 do RADAR (dados do motor de IA): sob demanda, fora do initial-js.
+const RadarLive = lazy(() => import('@/components/inbox/copilot/RadarLive'));
 ...
       {!logic.isMobile && !editingMessage && (
         <RadarPhase8to15Panel ... />
       )}
+
+      {!logic.isMobile && !editingMessage && contactId && (
+        <Suspense fallback={null}>
+          <RadarLive className="mx-4 mt-2" contactId={contactId} onDraftText={(text) => setNativeValue(inputRef, text)} />
+        </Suspense>
+      )}
```
Notas: `RadarLive` é `export default` e devolve `null` sem sessão, então com a capacidade desligada (estado atual em prod) a Inbox não muda. Qodo (#2381, achado 6) apontou que gatear por `!logic.isMobile` deixa o drawer móvel do `RadarPanel` inalcançável — decidir ao portar se mantém a condição. Testar: `npx vitest run src/components/inbox/chat` + `npx tsc --noEmit -p tsconfig.app.json`.

### 2. Corrigir mojibake no cabeçalho de `RadarPanel.tsx` — valor BAIXO
`src/components/inbox/copilot/RadarPanel.tsx:3-4`: `encãixado` → `encaixado`; `"ãão perturbe"` → `"não perturbe"`.

## Apagar branch
`apagar_branch_seguro = false` — a lacuna 1 ainda não foi portada (o hunk está acima; depois de portada, a branch pode ser apagada).

## Verificação adversarial

**Veredito revisado: DECISAO_DONO** (a triagem disse PERDIDA_PARCIAL). `concorda = false`.
`apagar_branch_seguro = false` (mantido).

### O que a triagem acertou (confirmado linha a linha)
- **A lacuna existe mesmo.** `git grep -n RadarLive origin/main -- src` só devolve o próprio
  `src/components/inbox/copilot/RadarLive.tsx:19,25` e o teste `__tests__/RadarLive.test.tsx:25,72,75,82`.
  `origin/main:src/components/inbox/chat/ChatInputArea.tsx` importa `RadarPhase7Panel` (l.7) e
  `RadarPhase8to15Panel` (l.8), nenhum `RadarLive`; o cabeçalho de `RadarLive.tsx:8` ainda afirma
  "Carregado sob demanda (lazy) pelo ChatInputArea" — referência morta. Componente órfão: confirmado.
- **O hunk da branch é o descrito** (`git diff c4c7139e7 origin/claude/radar-motor-copilot-live-301030 --
  src/components/inbox/chat/ChatInputArea.tsx`): troca `import { useMemo, useRef }` por
  `import { lazy, Suspense, useMemo, useRef }`, `const RadarLive = lazy(...)` e o bloco `Suspense` gateado por
  `!logic.isMobile && !editingMessage && contactId` (+8 linhas, 1 alterada).
- **Mojibake existe:** `origin/main:src/components/inbox/copilot/RadarPanel.tsx:3-4` tem `encãixado` e
  `"ãão perturbe"`; a branch tem o texto correto. Lacuna cosmética real.
- **Nenhuma outra lacuna nos 24 demais arquivos.** Spot-check das afirmações de "main superior":
  `copilot-tick.ts` main l.464-469/498-503 extrai `choices[0].message.content` + `JSON.parse` + `safeParse`,
  valida `DECISION_ROLES` (l.54-55) e `isRealDate` (l.182, 218, 473) — a branch não tem nada disso;
  `ai-jobs-worker/index.ts:260,272` usa `readCapabilityFlagFailClosed` (`ai-feature-flags.ts:177`) no lugar do
  `readCapabilityFlag` da branch; `RadarPanel.tsx` da main tem 461 linhas contra 451 da branch e é superconjunto
  (`latestSuggestionText` l.105, `aria-live` l.338-344, `Ctrl+Alt+1/2/3` l.138/458, todos com supressão por
  `isDnd` que a branch não tem). As 24 linhas "missing" do `RadarPanel` e as 10 do `copilot-tick` são
  comentário/forma, não função. Nada a recuperar nesses arquivos.

### Por que o veredito muda: a main já documenta que esta montagem é decisão do dono
`origin/main:PENDENCIAS.md` (commit `1d4702804`, 2026-11-15 — mesmo dia do HEAD `dac285f62`) tem **dois itens
abertos** que a triagem não viu, e ambos travam exatamente este hunk:

1. **Item 6 — "RADAR ao vivo na Inbox — o painel existe, não está ligado, e o teto de bundle não deixa"**
   (PENDENCIAS.md:255-307). Alguém **já montou** o `RadarLive` no `ChatInputArea` ("Montei em
   `src/components/inbox/chat/ChatInputArea.tsx` (18 linhas) e medi") e bateu em dois bloqueios medidos:
   - `total-assets` da main está em **4097,0 KB de um teto de 4100 KB** (3,0 KB de folga). O painel custa
     4,6 KB: import estático → 4101,6 KB; `lazy()` → **4103,4 KB** (pior, o chunk separado duplica módulos).
     Confirmei o teto: `origin/main:performance-budget.json` → `"total-assets":{"maxKB":4100}`, com ratchet
     versionado citado em `scripts/ci/bundle-budget.unit.mjs:178-179`. **O hunk desta branch usa `lazy()`, que
     é justamente o pior caso medido** — portar como está deixa a CI vermelha.
   - 10 unhandled rejections nos testes existentes do `ChatInputArea` (`useCopilotSession` sem mock),
     `npx vitest run src/components/inbox/chat` saindo com código 1 (medição registrada na main; não
     re-executei aqui — **NÃO VERIFICADO** por mim, motivo: evitar build/suite completa nesta verificação).
   O texto da main é explícito: *"Não subi o teto por conta própria porque sua regra é explícita sobre não
   afrouxar guardas, e isso é um guard de CI… falta sua palavra."* Subir `total-assets` é afrouxar guarda de CI
   — contradição direta de regra vigente do `AGENTS.md`, não é DDL/edge/workflow (que o dono já autorizou).
2. **Item 2 — "RADAR Copiloto — escolha entre dois painéis (issue #2967)"** (PENDENCIAS.md:168-181). Há dois
   painéis concorrentes e incompatíveis: opção **A** = `RadarLive` + `RadarPanel` (o desta branch, já na main,
   órfão) e opção **B** = `RadarPhase6Panel` da branch `claude/fix-radar-fase6-cv056-shortcuts-261108-2335`
   (PR #2872), com assinatura diferente de `useRadarPanel`. A main registra: *"Não escolhi por você porque são
   duas telas diferentes para a mesma função: é decisão de produto."* Montar o `RadarLive` **é** escolher a
   opção A — trade-off de negócio pendente, não tarefa de execução.

### Consequência prática
A triagem descreve a lacuna como "lacuna de 7 linhas (lazy import + bloco Suspense)" de valor alto e portável,
sem citar nenhum dos dois bloqueios. Seguir o dossiê como está levaria o próximo executor a abrir uma PR que
(a) estoura o `total-assets` por 3,4 KB e morre na CI, e (b) decide por conta própria o item 2 da issue #2967.
A lacuna é real, mas não é "recuperar trabalho perdido": é **o dono responder** "sobe o teto do bundle para o
RADAR" (ou "RADAR opção A"), e só então portar — e, se portar, medir import estático contra `lazy()`, porque a
medição da main diz que o estático é melhor que o hunk desta branch.

Qodo (#2381, achado 6) já apontava que gatear por `!logic.isMobile` deixa o drawer móvel do `RadarPanel`
inalcançável — mais um motivo para não portar o hunk literalmente.

### Branch
`apagar_branch_seguro = false`. Enquanto o dono não decidir, a branch é a única cópia viva do hunk de montagem
(o texto está também neste dossiê) e a convenção da própria main é manter branches de pé enquanto a decisão
pende (PENDENCIAS.md:181, 307: "nada se perde"). Depois do "sim" do dono e da PR de montagem mergeada, pode
apagar.
