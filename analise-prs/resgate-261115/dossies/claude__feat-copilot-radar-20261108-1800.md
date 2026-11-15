# claude/feat-copilot-radar-20261108-1800 (PR #2831) — OBSOLETA

- ref: `origin/claude/feat-copilot-radar-20261108-1800` · tip `be78e6cfa` · merge_base `c545e5b63` (2026-11-09)
- 12 commits, 17 arquivos, +1275/-167. Propósito: "motor RADAR ao vivo B·R·I·N·D·E — CV-141/142/143":
  painel de copiloto na aba IA da Inbox (medidor BRINDE, etapa/temperatura, insights, perguntas
  pendentes, papel do decisor), hook `useCopilotSession` com botão "Analisar" (tick manual),
  reescrita da edge `copilot-live` (cursor incremental + two-tier + merge atômico) e 3 migrations
  (gatilho de tick, presença, agregados de retenção).

## Por que está obsoleta

O mesmo escopo foi implementado na `main` por outras duas PRs, com versão mais rica e **ligada ponta
a ponta**:

- `11841dba9` 2026-11-09 — `feat(copilot): motor e telas RADAR Copiloto CV-021–060 (#2828)`
- `f369f88b2` 2026-11-15 — `feat(copiloto): liga o motor do RADAR — gatilho + handler, nasce desligado (#3127)`

Na `main` hoje: `src/components/inbox/tabs/AiTab.tsx:111` monta `CopilotPanel` + `LiveSuggestions`,
alimentados por `src/hooks/copilot/useCopilotSession.ts:96` e `src/hooks/copilot/useLiveSuggestions.ts`
(Realtime de `copilot_insights`); o tick é **servidor**: gatilho
`trg_copilot_tick_on_contact_message` → fila `ai_jobs` (`kind = 'copilot.tick'`, debounce 4 s) →
`ai-jobs-worker` → `supabase/functions/_shared/copilot-tick.ts` (motor real) → `copilot-live`.
Produção confirma: migration `20261115010000 copilot_live_motor` aplicada, funções
`enqueue_copilot_tick_on_contact_message` e `merge_brinde_state` existentes.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/inbox/copilot/BrindeMeter.tsx` | Reimplementado na main, mais rico (tooltip, clique→mensagem de origem, letra sugerida) | `origin/main:...BrindeMeter.tsx:29` `BrindeMeter({ state, evidence, onLetterClick, suggestedLetters })` vs branch `({ meter, evidence })` |
| `src/components/inbox/copilot/StageIndicator.tsx` | Idem; main usa fonte única `@/data/copilot/sale-stages` (`SALE_STAGE_META`) e 10 barras de temperatura | `origin/main:...StageIndicator.tsx:15`; `origin/main:src/data/copilot/sale-stages.ts:13` |
| `src/components/inbox/copilot/MissingQuestions.tsx` | Idem; main usa `@/data/copilot/brinde-questions` e pergunta clicável (insere no composer) | `origin/main:...MissingQuestions.tsx:24` `({ brinde_state, stage, onSelectQuestion })` |
| `src/components/inbox/copilot/DecisionMakerBadge.tsx` | Idem; stakeholders saíram para componente próprio `StakeholdersCard.tsx` | `origin/main:...DecisionMakerBadge.tsx:22`; `git ls-tree origin/main -- src/components/inbox/copilot/StakeholdersCard.tsx` |
| `src/components/inbox/copilot/InsightCard.tsx` | Idem; main recebe `type/content/sources/tier/onSelectContent/onGoToMessage` | `origin/main:...InsightCard.tsx:32` |
| `src/components/inbox/copilot/CopilotPanel.tsx` | Main tem CopilotPanel com outro recorte (objeção, risco de perda, âncora de preço, termômetro) + `LiveSuggestions` ao lado | `origin/main:...CopilotPanel.tsx:24`; `origin/main:src/components/inbox/tabs/AiTab.tsx:111-125` |
| `src/components/inbox/copilot/index.ts` | Barrel ausente na main de propósito: os consumidores importam direto | `origin/main:src/components/inbox/tabs/AiTab.tsx:17-22` |
| `src/hooks/chat/useCopilotSession.ts` | Hook existe na main em `src/hooks/copilot/useCopilotSession.ts` (127 l), com `brinde_evidence`, `intent`, `sentiment`, `stakeholders` e seleção por `contact_id`+`started_at DESC`. O `tick` manual da branch não existe porque a main **não** tem botão "Analisar": o tick é agendado pelo gatilho do banco | `origin/main:src/hooks/copilot/useCopilotSession.ts:96`; `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:52-125` |
| `src/components/inbox/tabs/AiTab.tsx` | **Idêntico em efeito**: `Brain` importado e `SectionCard` "Copiloto B·R·I·N·D·E" já na main | `origin/main:src/components/inbox/tabs/AiTab.tsx:4` e `:111` |
| `supabase/functions/copilot-live/index.ts` | Reescrita da branch (cursor, two-tier, 4 padrões de momento-chave) coberta e ampliada por `_shared/copilot-tick.ts`: cursor `last_processed_message_at` (:440), `detectKeyMoments` com 7 tipos (:104-124), roteamento `TIER2_MOMENTS` (:118), trava otimista `state_version` (:518), insights com `tier` e `data` | `origin/main:supabase/functions/_shared/copilot-tick.ts`; `origin/main:supabase/functions/ai-jobs-worker/index.ts:254-261`; contrato executável em `origin/main:supabase/functions/copilot-live/index.test.ts` |
| `supabase/functions/_shared/ai-response-contracts.ts` | `SALE_STAGE_VALUES`/`DECISION_ROLE_VALUES`/`KEY_MOMENT_VALUES`/`BrindeDeltaSchema`/`CopilotLiveOutputSchema` não estão nesse arquivo na main, mas existem equivalentes (mais completos) em `copilot-tick.ts`: `SALE_STAGES` (:49), `DECISION_ROLES` (:54), `CopilotTier1Schema` (:59), `CopilotTier2Schema` (:85), `KEY_MOMENT_RULES` (:104) | `git show origin/main:supabase/functions/_shared/copilot-tick.ts` |
| `supabase/migrations/20261108180000_copilot_tick_trigger.sql` | **Obsoleta e quebrada.** Mesmo nome de função que a main (`enqueue_copilot_tick_on_contact_message`), versão mais pobre e com timestamp ANTERIOR à da main (20261115010000) — aplicar hoje substituiria a função viva por uma sem porta do feature flag e sem filtro de `contact_type`. Pior: referencia `NEW.from_me` e `NEW.conversation_id`, colunas que **não existem** em `public.messages` (produção só tem `sender` e `contact_id`) → o gatilho erraria em todo INSERT de mensagem. Também grava `kind = 'copilot_tick'`, enquanto a main usa `'copilot.tick'` | consulta produção (information_schema.columns: messages → `sender`, `contact_id`; sem `from_me`/`conversation_id`); `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:95-125` |
| `supabase/migrations/20261108180100_copilot_presence.sql` | Ausente na main e em produção (`pg_tables` sem `copilot_presence`). **Sem consumidor algum**, nem na própria branch: `git grep copilot_presence` na branch não acha nada fora da migration. Modelo também desalinhado: pressupõe `conversation_id` de conversa real; na main `copilot_sessions.conversation_id` recebe o `contact_id` | `git grep -n "copilot_presence" <branch> -- src/ supabase/functions/ scripts/` → vazio; `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:12-16` |
| `supabase/migrations/20261108180200_copilot_retention.sql` | Ausente na main e em produção. Também sem consumidor. A função `run_copilot_retention()` conta `ai_jobs.kind = 'copilot_tick'`, mas a main enfileira `'copilot.tick'` → `ticks_processed` sairia sempre 0 | mesmo grep; `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:99` (`'copilot.tick'`) |
| `ESTADO.md`, `inventario/estado/rotas.json`, `supabase/deployment-manifest.json` | Artefatos gerados por automação; as entradas da branch descrevem caminhos que a main não usa (`src/hooks/chat/useCopilotSession.ts`). Regerados a cada push | `AGENTS.md` (contexto gerado); `scripts/ai-context/gerar.mjs` |

## Lacunas (nada a portar como está)

Nenhuma lacuna de valor alto ou médio. As duas únicas coisas realmente ausentes da main são DDL
morta na própria branch:

1. `supabase/migrations/20261108180100_copilot_presence.sql` — tabela `copilot_presence` (TTL 90 s) +
   RPCs `upsert_copilot_presence` / `copilot_has_presence` + cron de limpeza a cada 5 min.
   Valor **baixo**: nada chama. Se a ideia ("não gastar modelo quando ninguém está olhando a conversa")
   voltar a interessar, o corte certo hoje é no handler `_shared/copilot-tick.ts`, não nesta tabela —
   e a chave seria `contact_id`, não `conversation_id`. Portar o arquivo como está = tabela órfã.
2. `supabase/migrations/20261108180200_copilot_retention.sql` — tabela
   `copilot_retention_aggregates` + `run_copilot_retention()` + cron diário 02:00 UTC.
   Valor **baixo**: nenhum leitor (nenhuma tela/relatório) e a contagem de ticks usa o `kind` errado
   (`copilot_tick` vs `copilot.tick`). Precisa de reescrita, não de port.

Risco explícito de NÃO portar `20261108180000_copilot_tick_trigger.sql`: aplicá-lo **derrubaria** o
gatilho vivo e quebraria a gravação de mensagens (coluna inexistente). Não recuperar.

## Veredito

**OBSOLETA** — todo o trabalho útil foi reimplementado na `main` pelas PRs #2828 e #3127, com versão
mais completa, testada (`copilot-live/index.test.ts`, `_shared/__tests__/copilot-tick.test.ts`,
`src/components/inbox/copilot/__tests__/*`) e ligada ponta a ponta. O que falta é DDL sem consumidor
e um gatilho incompatível com o schema real. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **concordo com OBSOLETA** — `apagar_branch_seguro = true`. Nada da branch é recuperável:
cada peça existe na `main` em versão mais rica. Mas a triagem **exagera num ponto** e isso virou
lacuna adicional (de `main`, não da branch).

### Confirmado (refutação falhou)

- Componentes: `main` é superconjunto. `BrindeMeter` 74 l na main (`state`/`evidence`/`onLetterClick`/
  `suggestedLetters`, tooltip, clique→mensagem de origem) vs 53 l na branch (`meter: number`);
  `InsightCard` 109 vs 43; `CopilotPanel` 181 vs 102; `MissingQuestions` 57 vs 45 (main com
  `@/data/copilot/brinde-questions` e pergunta clicável). `DecisionMakerBadge` da main (41 l) tem os
  5 papéis + botão "Gerar resumo para encaminhar"; os stakeholders da branch estão em
  `origin/main:src/components/inbox/copilot/StakeholdersCard.tsx:18` com ir-para-mensagem.
- Hook: `origin/main:src/hooks/copilot/useCopilotSession.ts:96` cobre o da branch (`brinde_evidence`,
  `intent`, `sentiment`, `stakeholders`, `state_version`), lendo por `contact_id`.
- Motor: `origin/main:supabase/functions/_shared/copilot-tick.ts` tem os 4 momentos-chave da branch
  mais 3 (`deadline_request`, `logo_sent`, `unanswered_question`) em `KEY_MOMENT_RULES:104-112`,
  `TIER2_MOMENTS:115`, cursor `last_processed_message_at:440` e trava otimista `state_version:518`;
  roteado pelo worker em `origin/main:supabase/functions/ai-jobs-worker/index.ts:287`
  (`"copilot.tick": handleCopilotTickJob`).
- Produção (somente leitura, `SUPABASE - ZAPP WEB V2`): migration `20261115010000` aplicada; gatilho
  `trg_copilot_tick_on_contact_message` vivo em `public.messages`; funções
  `enqueue_copilot_tick_on_contact_message` e `merge_brinde_state` presentes;
  `copilot_presence` e `copilot_retention_aggregates` **não existem**.
- `public.messages` tem `sender` e `contact_id`; **não tem** `from_me` nem `conversation_id`
  (`information_schema.columns`). A migration `20261108180000_copilot_tick_trigger.sql` da branch
  referencia as duas colunas inexistentes e, diferente da da main, **não** envolve o corpo em
  `BEGIN … EXCEPTION WHEN OTHERS` → aplicar derrubaria a gravação de toda mensagem de contato.
  Confirmado: não recuperar.
- `copilot_presence` / `copilot_retention_aggregates`: zero consumidor na própria branch
  (`git grep` em `src`, `supabase/functions`, `scripts`, `e2e` → vazio). Na `main` só aparecem em
  `docs/_arquivo/**` — a mesma DDL já havia sido proposta e não mergeada em
  `claude/feat-copiloto-cv011-020-migrations-261016-1930`. Valor baixo confirmado.

### Correção na triagem (não muda o veredito)

A triagem diz que a `main` está "ligada ponta a ponta". O **motor** está; a **tela do B·R·I·N·D·E
não**. Em `origin/main:src/components/inbox/tabs/AiTab.tsx:111-113` o `SectionCard` chamado
"Copiloto B·R·I·N·D·E" renderiza o `CopilotPanel` da main, que é outro recorte (objeção, risco de
perda, âncora de preço, termômetro — `origin/main:src/components/inbox/copilot/CopilotPanel.tsx:26-41`)
e **não mostra nenhuma letra**. Os componentes do RADAR da main estão órfãos: `BrindeMeter`,
`StageIndicator`, `MissingQuestions`, `StakeholdersCard`, `OccasionAlert`, `RadarCards`, `RadarPanel`
e `RadarLive` não têm importador fora de `__tests__`
(`git grep -l "BrindeMeter\|StageIndicator\|MissingQuestions\|StakeholdersCard\|OccasionAlert" origin/main -- src`
→ só os próprios arquivos + 2 testes; `RadarLive` só em `__tests__/RadarLive.test.tsx:25`).
Resultado: o gatilho paga modelo e grava `brinde_*`, e nenhuma tela lê.

Isso **não** torna a branch recuperável. O hunk de integração da branch em `AiTab.tsx` é a mesma
linha que a main já tem; o que diferia era o conteúdo do `CopilotPanel`. E portar o painel da branch
criaria um segundo rastro de sessão: o hook da branch lê/grava `copilot_sessions.conversation_id =
conversation.id` (`Conversation.id` ≠ `contact.id`, `origin/main:src/types/chat.ts:104-106`), enquanto
o gatilho da main grava `conversation_id = NEW.contact_id`
(`origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:86-88`) — linhas duplicadas e
custo de modelo dobrado. Observação: `copilot-live` da main ainda aceita o payload antigo
(`origin/main:supabase/functions/copilot-live/index.ts:21-29,86`), então o botão "Analisar" da branch
funcionaria — e é justamente por isso que ele é perigoso, não valioso.

O conserto certo é na `main`, em ~10 linhas: montar `RadarLive` (ou `BrindeMeter` +
`StageIndicator` + `MissingQuestions` alimentados por `useCopilotSession(contactId)`) dentro do
`SectionCard` que já existe no `AiTab`. Registrado como lacuna adicional.
