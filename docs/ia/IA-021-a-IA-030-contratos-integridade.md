# Bloco 03 — Contratos, integridade e persistência do sinal de IA (IA-021..IA-030)

**P0/P1 do plano** — [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md)
(seção "Bloco 03", linhas 184-256). Base do branch: `76bd9f8e` (o `origin/main` avançou durante o
bloco; o `hermes-tarefa-fechar` rebaseia antes do primeiro push).

O bloco existia para matar uma família de defeitos que se sustentavam mutuamente: **o vocabulário das
funções de IA (português) nunca casou com o das colunas (inglês)**, e não havia onde guardar a análise
completa, então a ausência de dado era representada por **valores inventados** (50%, CSAT 3, `churnRisk
'low'`, `neutral`/`normal` como default de coluna). Sem contrato, cada consumidor inventava o seu.

## O que muda para quem usa

1. **Vocabulário único.** Sentimento (`positivo/neutro/negativo/critico`) e urgência
   (`baixa/media/alta/critica`) em português — o idioma em que os modelos já respondem — e prioridade
   operacional (`low/medium/high/urgent`) em inglês, porque é o que os consumidores do front já esperam.
   Conversores explícitos traduzem o legado (`positive/neutral/negative/critical/very_positive/
   very_negative`, `normal`, `alta`, `critica`). Valor desconhecido **não é adivinhado**.
2. **Ausência deixa de ser disfarçada.** `ai_sentiment DEFAULT 'neutral'` fazia contato nunca analisado
   parecer "neutro"; `ai_priority DEFAULT 'normal'` fazia parecer priorizado num valor que nenhum
   consumidor entende. Os defaults saem, `conversation_analyses` passa a guardar a análise inteira e
   "nunca analisado" deixa de ser indistinguível de "analisado como neutro".
3. **Nada é gravado sem passar pelo contrato.** JSON válido mas com estrutura ou valor errado é
   recusado com `502` e envelope de erro; a gravação é atômica (registro imutável + projeção do contato
   na mesma transação) e só projeta quando a análise é recente.
4. **Etiquetas e memória param de vazar.** A troca de etiquetas é transacional e preserva etiqueta
   humana; o painel de memória não exibe nem grava memória de outro contato.

## Etapas: o que foi feito e onde

| Etapa | Aceite do plano | Estado | Evidência |
|---|---|---|---|
| **IA-021** Unificar sentimento | mesmo sentimento mantém significado em análise, contato, churn, alerta e CRM | ✅ | **módulo canônico único** `supabase/functions/_shared/ai-vocabulary.ts` (empacotado pelo Deno), consumido pelo front por re-export em `src/lib/ai-vocabulary.ts` — sem cópias duplicadas (o SonarCloud contava 454 linhas de duplicação do par espelhado) — com `normalizeSentiment` e tabela de aliases de legado; consumidores migrados (ver §Consumidores) |
| **IA-022** Unificar prioridade e urgência | valores inválidos não entram nas projeções; **todos** os consumidores passam na matriz de conversão | ✅ | `normalizeUrgency`, `urgencyToOperationalPriority`, `normalizeOperationalPriority`; a comparação morta com `'critical'` foi removida de `ai-conversation-analysis` e `ai-conversation-summary` |
| **IA-023** Preservar zero e ausência | zero continua zero, confiança zero não vira 70%, falta de dado não vira satisfação neutra | ✅ | **módulo canônico único** `supabase/functions/_shared/ai-values.ts`, consumido pelo front por re-export em `src/lib/ai-values.ts` (`normalizeScore`, `aggregateScores`) — sem cópias duplicadas; fim dos `\|\| 50`, `\|\| 0.7`, CSAT 3 e `\|\| 'low'` nas funções e nos consumidores |
| **IA-024** Contrato das mensagens | campos necessários não desaparecem; excesso tem tratamento explícito, não truncamento silencioso | ✅ | `_shared/schemas.ts`: `MessageSchema` aceita `id`/`type`/`mediaUrl` e recorte de período, `withConversationBudget` recusa acima de 120.000 caracteres agregados com motivo, `periodDays` 1..365 |
| **IA-025** Validar toda saída do modelo | JSON válido com estrutura/valor incorreto é rejeitado antes de renderizar ou persistir | ✅ | `_shared/ai-response-contracts.ts`: schemas por capacidade (`ConversationAnalysisOutput`, `ConversationSummaryOutput`, `AutoTagOutput`, `SuggestedRepliesOutput`, `ChatbotL1Output`), `parseModelOutput` com caminho do erro e `buildAiEnvelope` |
| **IA-026** Persistir a análise completa | reabrir o histórico reproduz a análise originalmente aceita, inclusive campos opcionais | ✅ | colunas novas em `conversation_analyses` (`agent_performance`, `churn_risk`, `sales_opportunity`, `analysis_version`, `period_days`, `coverage`, `model`, `analyzed_at`) e RPC `persist_conversation_analysis` |
| **IA-027** Gravações consistentes | falha parcial e análise de período antigo não deixam prioridade/sentimento incoerentes | ✅ | projeção do contato **dentro** da RPC, com trava de recência/versão; erro de persistência devolve 502 (antes: `warn` + 200 e projeção mesmo com insert falho) |
| **IA-028** Etiquetas atomicamente | erro intermediário não apaga classificação anterior; resposta vazia remove só o previsto | ✅ | RPC `replace_ai_conversation_tags` (transação única, dedupe, semântica de vazio) + índice único `(contact_id, tag_name)`; etiqueta `source='human'` preservada — provado ao vivo |
| **IA-029** Identidade da memória | trocar de A com memória para B sem memória não exibe nem transfere a memória de A | ✅ | `ConversationMemoryPanel.tsx`: limpa estado ao trocar de contato, separa ausência de erro, descarta resposta obsoleta por `requestId` e grava sempre com `.eq('contact_id', …)`; `key={contact.id}` no accordion |
| **IA-030** Migrar sem perda | ensaio de migração e reversão mantém contagens, vínculos, permissões e rastreabilidade | ✅ | ensaio em PostgreSQL 17 descartável (`scripts/db-audit/ai-block03-vocabulary-contract.test.sh`, **fora do CI**: o workflow é território do Joaquim): 61 asserções, 0 falhas, exit 0 — backfill correto caso a caso, **nenhuma linha perdida ou criada**, 6 constraints validadas, ACL mínima e reversão de schema provada; 3 mutações injetadas foram detectadas |

## Banco de dados

**Migration aditiva — aplicada e provada:**

`supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql` (14 statements, aplicada em
30/09/2026 08:36 BRT pelo `hermes-db-migrar`, versão registrada no ledger). Adiciona as colunas de
completude da análise, o rastro da projeção no contato, o índice único das etiquetas e as funções
`ai_is_canonical_sentiment`, `ai_is_canonical_priority`, `ai_text_array`,
`persist_conversation_analysis` e `replace_ai_conversation_tags`.

Provado ao vivo no banco canônico (`tnnnlkbymytvtqngbbqh`), com o rastro sintético apagado depois:

| Prova | Resultado medido |
|---|---|
| Gravação completa pelo RPC | `projected: true`, linha com `sentiment`/`urgency`/`churn_risk`/`analysis_version`/`coverage` |
| Trava de recência | análise de 2 dias atrás → `projected: false`, contato **intacto** |
| Recusa de vocabulário inválido | `sentiment: 'positive'` → `ERROR 22023: sentiment fora do vocabulário canônico` |
| Etiqueta humana preservada | `source='human'` sobrevive à troca atômica por `replace_ai_conversation_tags([])` |
| Estado depois da limpeza | `conversation_analyses` 0 · `ai_conversation_tags` 0 · contato de prova de volta a `neutral/normal` |

**Migration de contrato — pendente pós-merge (classe contrato, aplicada pelo `hermes-tarefa-mergear`
logo depois do merge e do deploy):**

`supabase/migrations/20260930150000_ai_block03_vocabulary_contract.sql`. Ela impõe o vocabulário
(traduzindo o legado **antes** de validar), tira os defaults que mascaravam ausência e restringe as RPCs
do bloco ao `service_role`. A ordem importa: aplicar antes do deploy faria a função antiga (que ainda
escreve `'neutral'`/`'normal'`) tomar erro de constraint.

- Versão **reservada** no ledger com `supabase_migrations.reserve_migration_version('hermes-ia-bloco-03', …)`
  → `20260930150000`, depois de a versão original (`20260930120000`) colidir com um arquivo de outro
  chat que foi superseded e com o `max(version)` do ledger (`20260930130000`).
- Pré-condições conferidas no banco vivo **antes** de escrever o arquivo: nenhuma das 6 constraints
  existia, `ai_is_canonical_urgency`/`ai_is_canonical_churn_risk` não existiam, `authenticated` executa
  as funções de CHECK e `anon` não (hardening de outra tarefa), e **todos** os escritores de
  `ai_sentiment`/`ai_priority`/`urgency`/`churn_risk` já enviam forma canônica — a constraint não tem
  como quebrar escrita legada quando entrar.

## Consumidores migrados para o contrato único

A linha "Escopo técnico" do plano (linha 190) nomeia `schemas.ts`, `conversation_analyses`, `contacts`,
`ai_conversation_tags`, `ConversationMemoryPanel` e tipos compartilhados. O aceite do IA-022 ("**todos**
os consumidores passam na matriz de conversão") e o do IA-023 ("falta de dado não vira satisfação
neutra") exigiram ir além dessa lista, sempre com a mesma correção:

| Arquivo | Defeito | Correção |
|---|---|---|
| `src/components/inbox/VirtualizedRealtimeList.tsx` | rótulos e badges com chave inglesa; `ai_priority === 'high' \|\| 'urgent'` | `SENTIMENT_LABEL: Record<Sentiment, …>` + normalizadores; desconhecido → "sem análise" |
| `src/components/inbox/contact-details/ContactHeaderSection.tsx` | `ai_sentiment === 'positive'`, `ai_priority === 'high'` (nunca disparavam com dado canônico) | normalizadores; selo de prioridade para `high\|urgent` |
| `src/components/ai/churnRisk.ts` + `ChurnPredictionDashboard.tsx` | bônus de churn comparava `'negative'`/`'neutral'` | comparação sobre `normalizeSentiment(...).value` |
| `src/hooks/integrations/useTalkXSegments.ts` | opções de filtro em inglês | `[...SENTIMENT_VALUES]` / `[...OPERATIONAL_PRIORITY_VALUES]` |
| `src/components/inbox/tabs/AiTab.tsx` | `SENTIMENT_CONFIG` chaveado em inglês (`positive`…): com dado canônico o selo **nunca** aparecia | config tipada por `Sentiment`, com o estado `critico` que faltava |
| `src/adapters/inboxAdapter.ts` + `src/pages/ChatPopup.tsx` | prioridade fora da matriz de conversão | mapa explícito via `normalizeOperationalPriority` |
| `src/components/inbox/chat/useChatPanelHandlers.ts` | `/priority` gravava o texto do comando direto em `ai_priority` | valida antes de gravar; valor inválido não entra |
| `src/components/ai/ticketClassification.ts`, `AutoTicketClassifier.tsx`, `src/hooks/analytics/useAIStats.ts`, `src/hooks/inbox/useRealtimeSentimentAlerts.ts` | `\|\| 70`, `\|\| 0.7`, `\|\| 50`, dia sem dado = 50 na média | `normalizeScore`/`aggregateScores`; ausente é ausente, 0 é 0, dia sem dado é `null` |
| `src/components/dashboard/useSentimentData.ts`, `SentimentTabContent.tsx`, `AIStatsWidget.tsx`, `SentimentAlertsDashboard.tsx` | 12 pontos de `(score \|\| 50)`: ausência entrava na média como 50, contava como "Crítico" e entrava no histograma | ausente excluído das médias (`null` sem amostra), UI mostra `—`, sem cor de faixa nem badge |
| `AIConversationAssistant.tsx`, `ConversationSummary.tsx`, `ai-tools/analysisConfigs.ts` | consumiam o corpo cru da função (`data`), sem tratar envelope/erro | `payload.data`/`payload.analysisId`/`payload.error` (o corpo de erro vive em `error.context`) |

## Prova (medido, não afirmado)

| Gate | Resultado |
|---|---|
| `bun run typecheck` | exit 0 |
| `node scripts/ci/typecheck-ratchet.mjs` | `novas=0` |
| `node scripts/ci/lint-ratchet.mjs` | `baseline=971, atual=955, novas=0` — nenhuma dívida nova |
| `bun run test:contracts` | 23 arquivos / 491 testes |
| `bun run test` (suíte unitária) | exit 0 |
| `deno test --config scripts/ci/deno.json --allow-env supabase/functions/_shared/__tests__/` | 262 passed / 0 failed |
| `deno check` nas 4 funções tocadas | 0 erros |
| `bun run db:guard` | 0 violações novas, 666 migrations válidas |
| `node scripts/edge-deploy/generate-manifest.mjs --check` | OK (67 funções, 101 fontes) |

**Teste de mutação (o teste pega o defeito?).** Reintroduzido o defeito real no código: ausência virando
`70` na tabela numérica e `?? 50` na gravação → **3 testes vermelhos** (exit 1), restaurado do backup com
sha256 conferido. O mesmo exercício foi feito em cada frente delegada (vocabulário no módulo canônico único,
memória por contato, dashboard: `expected 60 to be 40` e `expected 50 to be null`), sempre com restauração
conferida por hash.

**Testes que travavam o defeito foram corrigidos, não contornados:** `src/lib/__tests__/scenario-simulation.test.ts`
esperava confiança 70 para confiança não-numérica; o caso foi reescrito para a semântica do aceite
(ausência/escala trocada/zero).

**Ensaio de migração (IA-030) em PostgreSQL descartável.** A migration de contrato nunca tinha sido
executada — só classificada. O ensaio
(`bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/ai-block03-vocabulary-contract.test.sh`)
reproduz o estado prévio, aplica o arquivo e mede: **61 asserções [PASS], 0 [FAIL], exit 0** —
tradução caso a caso do legado (incluindo valor desconhecido → `NULL`), contagem e conteúdo das linhas
preservados, as 6 constraints criadas **e validadas**, `INSERT`/`UPDATE` inválido recusado citando a
constraint, defaults mascaradores removidos (`NULL` no lugar de `neutral`/`normal`/50/3), ACL mínima nas
RPCs com `EXECUTE` preservado nas funções de CHECK, e reversão de schema (`drop constraint` + `set
default`) funcionando. Mutação: sem os `UPDATE` de backfill o `validate constraint` **falha**; com
`'normal' → 'high'` a asserção fica **vermelha** — o ensaio pega o defeito, e o arquivo do repo ficou
intacto (sha256 conferido antes e depois).

## Decisões do executor

1. **Sentimento/urgência em português, prioridade operacional em inglês.** Os modelos já respondem em
   português e o front já consome `low/medium/high/urgent`; trocar a escala do front seria uma mudança de
   produto não pedida. Toda a tradução acontece em conversores explícitos.
2. **Ausência representável** (`{ value: null }`, `null` no banco, `—` na tela) em vez de default
   "neutro". Um contato nunca analisado não pode parecer analisado.
3. **Cobertura de teste em `tests/contracts`** (onde o `ci.yml` executa). Os testes Deno novos ficam em
   `supabase/functions/_shared/__tests__/` e rodam localmente, mas a lista do workflow é explícita e é
   território do Joaquim: pedido de duas linhas está no corpo do PR.
4. **Fila de deploy/`mergear` não é bloqueio**: a migration de contrato vai pelo caminho sancionado
   (aplicada após merge + deploy), e o manifesto de edge foi regenerado no mesmo commit, como o gate exige.
5. **Reversão sem down-migration** (o repo não tem esse mecanismo): a reversão é ensaiada no PostgreSQL
   descartável, e o ledger guarda o SQL real aplicado — é a rastreabilidade prevista pelo repo.

## Limites declarados (o que este bloco não prova)

- **Não há prova de runtime das funções em produção**: as 4 funções tocadas (`ai-conversation-analysis`,
  `ai-conversation-summary`, `ai-auto-tag`, `chatbot-l1`) só passam a rodar o código novo depois do
  deploy que o merge dispara. Até lá, a prova é de contrato (testes + `deno check`) e de banco (RPCs).
- O deploy de Edge Functions do repo é manual e pausa aguardando aprovação humana.
- **O ensaio do IA-030 não é o banco de produção**: o container reproduz o estado a partir da
  especificação (roles, 3 tabelas, atributos usados), sem RLS/policies/FKs e sem executar o **corpo** das
  duas RPCs (nelas foi provada a ACL, não o comportamento funcional — esse já foi medido no banco canônico
  durante a fase aditiva). A reversão ensaiada é de **schema**: o backfill de dados não volta atrás, como
  o repo não tem down-migration.
- O ensaio **não roda no CI** (`.github/workflows/db-guard.yml` é território do Joaquim).
- Métricas de qualidade (latência, custo por análise) não foram medidas — pertencem aos blocos de
  observabilidade.

## Achados fora do escopo (NÃO corrigidos)

- `supabase/functions/voice-copilot-action/index.ts` — `.in('ai_sentiment', ['negative','very_negative'])`:
  filtro morto com o vocabulário canônico (nunca casa), e o mesmo bloco de código nunca considerou
  `critico`.
- `supabase/functions/elevenlabs-webhook/index.ts` — a `SUPABASE_SERVICE_ROLE_KEY` injetada pela
  plataforma não corresponde a nenhuma chave atual do projeto: o webhook responde 200 e **não grava**.
  Afeta qualquer função que escreva pelo cliente service_role (registro B16 de `IA-003`).
- `src/hooks/integrations/useTalkXSegments.ts` — os filtros passam a oferecer os valores canônicos; as
  linhas históricas em inglês só serão alcançáveis depois do backfill (a migration de contrato as
  traduz), o que é a compatibilidade temporária prevista pelo IA-030.
- `src/components/ai/__tests__/AutoTicketClassifier.test.tsx` — mantém `(0 || 0.7) * 100` como molde do
  defeito antigo num teste local; não quebra o componente nem os gates.
- Quatro consumidores que ainda comparavam literal cru (`src/adapters/inboxAdapter.ts`,
  `src/pages/ChatPopup.tsx`, `src/components/inbox/tabs/AiTab.tsx`,
  `src/components/inbox/chat/useChatPanelHandlers.ts`) foram corrigidos **neste** bloco — a varredura
  final não encontrou comparação crua de sentimento/prioridade nos caminhos de IA.
