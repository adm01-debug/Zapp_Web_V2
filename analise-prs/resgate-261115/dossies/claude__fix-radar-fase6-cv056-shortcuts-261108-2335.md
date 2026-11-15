# claude/fix-radar-fase6-cv056-shortcuts-261108-2335 (PR #2872)

- tip `4c63335e7` · merge_base `9183f0f6f` · 1 commit: `fix(radar): CV-056 atalho Ctrl+Shift+A e 5 erros de lint da Fase 6`
- diffstat: 5 arquivos, +565 −1 (`src/` apenas; sem migration, edge ou workflow)

## Propósito
Entregar a Fase 6 do Copiloto RADAR (CV-051–060) como um painel flutuante próprio
(`RadarPhase6Panel`), com hook de estado próprio (`useRadarPanel`), montagem no `ChatPanel`
e atalho `Ctrl+Shift+A` registrado em `defaultShortcuts.ts`.

## Veredito: DECISAO_DONO (duas telas concorrentes para a mesma função)

A `main` **já tem** uma implementação completa da Fase 6, feita por outro agente, com a mesma
numeração CV-051–060 — e ela é **incompatível** com a desta branch:

| Opção | Arquivos na `main` | Assinatura do hook |
|---|---|---|
| A (na `main`) | `src/components/inbox/copilot/RadarPanel.tsx`, `RadarCards.tsx`, `RadarLive.tsx`, `__tests__/RadarPanel.test.tsx`, `__tests__/RadarLive.test.tsx` | `useRadarPanel(userId, conversationId?)` → `{mode, collapsed, cardOrder, collapsedCards, isDnd, …}` (`origin/main:src/hooks/copilot/useRadarPanel.ts:70`) |
| B (esta branch) | `src/components/copilot/RadarPhase6Panel.tsx` (321 linhas) | `useRadarPanel(conversationId)` → `{open, mode, thinking, thinkingError, timeline, isMuted, toggle, pushInsight, …}` (branch `src/hooks/copilot/useRadarPanel.ts:142`) |

Portar a branch **sobrescreve** `src/hooks/copilot/useRadarPanel.ts` (no merge_base o arquivo não
existia; os dois lados o criaram em paralelo — daí o `CONFLICT`), e isso quebra `RadarLive.tsx:29`,
`RadarPanel.tsx:10` e os testes `RadarPanel.test.tsx:139-174` que já estão na `main`.

Essa escolha **já está registrada na `main` como decisão do dono**: `origin/main:PENDENCIAS.md:168-181`
(item 2, issue #2967) descreve exatamente estas duas opções e termina com
*"responda 'RADAR opção A' ou 'RADAR opção B' … Não escolhi por você porque são duas telas diferentes
para a mesma função: é decisão de produto."* O item cita esta branch e a PR #2872 pelo nome.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/copilot/RadarPhase6Panel.tsx` (+251, ausente na main) | **Concorrente**, não duplicata literal: a `main` cobre os mesmos CVs em `inbox/copilot/RadarPanel.tsx` (drag CV-051, 3 modos, DND, mobile drawer, `aria-live` CV-055/057, timeout CV-054, atalhos CV-056) | `git ls-tree origin/main src/components/copilot/` não lista `RadarPhase6Panel.tsx`; `origin/main:src/components/inbox/copilot/RadarPanel.tsx:2,62,104,128,321,338,455` |
| `src/hooks/copilot/useRadarPanel.ts` (+177, 166 linhas ausentes) | API **incompatível** com a da main; aplicar substitui o hook usado pela opção A | compare `origin/main:…/useRadarPanel.ts:57-70` (`UseRadarPanelResult`) com a branch (`UseRadarPanelReturn`, `open/thinking/timeline/pushInsight`) |
| `src/components/inbox/ChatPanel.tsx` (+8, 6 ausentes) | A `main` **não monta nenhum painel RADAR** no ChatPanel (`git grep -n Radar origin/main -- src/components/inbox/ChatPanel.tsx` → vazio). O `RadarLive` da opção A também está órfão (`origin/main:PENDENCIAS.md:175,260`) | diff abaixo |
| `src/hooks/shortcuts/defaultShortcuts.ts` (+3) | **Lacuna real e reaproveitável**: a `main` não tem nenhuma entrada `radar` em `defaultShortcuts.ts` (0 ocorrências). O painel da main usa `Ctrl+Shift+L` (recolher) e `Ctrl+Alt+1..3` (usar sugestão), não `Ctrl+Shift+A` (`origin/main:…/RadarPanel.tsx:128-145`) | diff abaixo |
| `src/components/copilot/index.ts` (+4, −1) | Só o barrel do painel B; depende do item 1 | diff |

## Fato que pesa na decisão: a opção B é casca, sem motor
O painel B só renderiza `radar.timeline`, e **nada** chama `pushInsight`/`startThinking` em toda a
branch (`git grep -n "pushInsight\|startThinking" <branch> -- src/` só acha a definição no hook,
linhas 43/45/167/183/223-224). Montado, ele mostraria sempre "RADAR pronto" /
"Aguardando análise da conversa…" (`RadarPhase6Panel.tsx:108-111,196`). A opção A, ao contrário, já
está ligada ao motor (`RadarLive.tsx:27-29` usa `useCopilotSession` + `useLiveSuggestions`).

## Bloqueios externos (valem para A ou B)
1. **Motor desligado** — `origin/main:PENDENCIAS.md:183-198` (item 3): custo de IA por mensagem,
   peças em `#2831`/`#2500`/`#2487` e handler `copilot.tick` ausente em `ai-jobs-worker`.
2. **Teto de bundle saturado** — `total-assets: {maxKB: 4100}` em `origin/main:performance-budget.json`;
   `PENDENCIAS.md:265-300` mediu 4097,0 KB na main e 4101,6 KB com o painel ligado (estoura por 1,6 KB),
   mais 10 unhandled rejections nos testes do `ChatInputArea`.

## Lacunas a recuperar (se o dono escolher B, ou só o atalho)

### 1. Atalho CV-056 — único trecho aproveitável nas duas opções
`src/hooks/shortcuts/defaultShortcuts.ts`
```diff
@@ -22,6 +22,8 @@ export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
   { id: 'audio-toggle-mute', … },
+  // CV-056 — painel flutuante RADAR Fase 6
+  { id: 'radar-toggle', name: 'Painel RADAR', description: 'Abre ou fecha o painel RADAR de análise de vendas', defaultKey: 'a', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'chat' },
@@ -98,6 +100,7 @@ export const SHORTCUTS_SOMENTE_INFORMATIVOS: readonly string[] = [
   'archive-chat',
+  'radar-toggle',
```
Observação: o painel da opção A não tem estado `open`/`toggle` (só `collapsed`), então com A o
`radar-toggle` precisa apontar para `toggleCollapsed` ou ganhar um estado de abertura.

### 2. Montagem no ChatPanel (o que falta na main para o RADAR aparecer)
`src/components/inbox/ChatPanel.tsx`
```diff
+// CV-051–060 — painel flutuante RADAR Fase 6
+const RadarPhase6Panel = lazy(() => import('@/components/copilot/RadarPhase6Panel').then(m => ({ default: m.RadarPhase6Panel })));
@@ -505,6 +507,14 @@
+        {/* CV-051–060 — painel flutuante RADAR Fase 6 */}
+        <Suspense fallback={null}>
+          <RadarPhase6Panel
+            conversationId={conversation.id}
+            contactName={conversation.contact.name}
+          />
+        </Suspense>
```
Com a opção A o equivalente é montar `RadarLive` (`PENDENCIAS.md:263` mediu 18 linhas em
`src/components/inbox/chat/ChatInputArea.tsx`).

### 3. Painel + hook da opção B
`git show 4c63335e7:src/components/copilot/RadarPhase6Panel.tsx` (321 linhas) e
`git show 4c63335e7:src/hooks/copilot/useRadarPanel.ts` (227 linhas). Só portar junto, e **renomeando
o hook** (ex.: `useRadarPanel6`) para não sobrescrever o da opção A; o barrel em
`src/components/copilot/index.ts` acompanha.

## Branch
`apagar_branch_seguro = false` — a branch é a única cópia da opção B e a `main` a cita como a peça
preservada da decisão pendente (`PENDENCIAS.md:177`).

## Verificação adversarial

**Parecer: concordo com DECISAO_DONO e com `apagar_branch_seguro = false`** — mas por um motivo mais
forte do que o da triagem, e com duas afirmações dela corrigidas.

### O que se confirmou
1. `origin/main:PENDENCIAS.md:168-181` (item 2, issue #2967) existe e pede a escolha, citando esta
   branch e a PR #2872 ("fechada sem merge") pelo nome: *"responda 'RADAR opção A' ou 'RADAR opção B'"*.
2. Colisão real no mesmo caminho: `origin/main:src/hooks/copilot/useRadarPanel.ts:57-70`
   (`UseRadarPanelResult` = `mode/collapsed/cardOrder/collapsedCards/isDnd`, assinatura
   `useRadarPanel(userId, conversationId?)`) vs. branch (`UseRadarPanelReturn` =
   `open/thinking/thinkingError/timeline/pushInsight`, `useRadarPanel(conversationId)`). Aplicar como
   está quebra 3 consumidores vivos: `RadarLive.tsx:16,29`, `RadarPanel.tsx:10`, `RadarCards.tsx:9`
   e `__tests__/RadarPanel.test.tsx:139-174`.
3. Painel B é casca: `git grep -n "pushInsight\|startThinking" <branch> -- src/` só acha a definição
   (`useRadarPanel.ts:43,45,167,183,223-224`). Nenhum consumidor.
4. `git grep -in radar origin/main -- src/hooks/shortcuts/defaultShortcuts.ts` → exit 1 (zero).

### Correção 1 — a frase "nenhum painel RADAR aparece na tela" é falsa
A `main` **monta** dois painéis RADAR em produção:
`origin/main:src/components/inbox/chat/ChatInputArea.tsx:7-8,207,221` → `RadarPhase7Panel`
(CV-063–070) e `RadarPhase8to15Panel` (CV-071–150). O que não está na tela é só o painel de
CV-051–060 (opção A, órfã) e o `RadarLive` alimentado por IA. Correção, não mudança de veredito.

Isso também enfraquece o enquadramento "duas telas concorrentes": a `main` já tem a família
`src/components/copilot/RadarPhase{7,8,9,10,8to15}Panel.tsx` montada, e o `RadarPhase6Panel` desta
branch é o irmão que falta dessa família (o barrel da branch só troca "Fases 7–13" por "Fases 6–13").
A incompatibilidade é de **nome de arquivo do hook**, resolvível por rename (`useRadarPanel6`) —
engenharia, não produto.

### Correção 2 — o atalho `radar-toggle` NÃO vale "médio"; vale quase zero isolado
A branch põe `radar-toggle` em `SHORTCUTS_SOMENTE_INFORMATIVOS`, e `listarAtalhosEditaveis`
(`origin/main:src/hooks/shortcuts/defaultShortcuts.ts:113-115`) corta os informativos das **quatro**
telas que exibem atalhos: `InboxEmptyChat.tsx:71`, `KeyboardShortcutsHelp.tsx:23`,
`KeyboardShortcutsDialog.tsx:151`, `KeyboardShortcutsSettings.tsx:207`. O executor do Ctrl+Shift+A
mora **dentro** do painel (`RadarPhase6Panel.tsx:124-133`, `window.addEventListener('keydown')`).
Portar só as 3 linhas → entrada invisível e sem efeito. Ela só vale junto com um painel montado.

### Por que DECISAO_DONO se sustenta (motivo melhor que o da triagem)
Não é o A-vs-B: é **contradição de regra vigente**. Montar qualquer painel de CV-051–060 estoura um
guard de CI já saturado — `origin/main:performance-budget.json` `total-assets: maxKB 4100`, com
`PENDENCIAS.md:265-300` (item 6) medindo 4097,0 KB na `main` (3,0 KB de folga) e 4101,6 KB com o
painel ligado. Subir o teto é afrouxar guarda de CI → `AGENTS.md` manda chamar o dono, e o item 6 já
está aberto pedindo exatamente isso. Somado a (3) acima — o painel B mostraria sempre "Aguardando
análise da conversa", o que `AGENTS.md` proíbe entregar como pronto — não existe recuperação
executável sem a palavra do dono. Rebaixar para PERDIDA_* colocaria o agente a mexer no
`performance-budget.json` por conta própria.

Não há sinal de remoção proposital do conteúdo da branch na `main` (os arquivos de B nunca existiram
lá; o `merge_base 9183f0f6f` não tinha `useRadarPanel.ts` — os dois lados o criaram em paralelo).
