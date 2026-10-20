# IA-006 — Verificação dos 10 achados do Plano IA 200 Etapas e classificação da natureza da inteligência

**Projeto:** Zapp_Web_V2 (adm01-debug/Zapp_Web_V2) — CRM de atendimento WhatsApp com IA (React + Vite + Supabase Cloud).
**Data:** 29/09/2026.
**Tarefa:** etapa IA-006 — distinguir IA generativa, cálculo determinístico, entrada manual e dado importado; eliminar equivalência indevida entre score, probabilidade, sentimento estimado e CSAT respondido.
**Método:** leitura estática do código. **Nenhum** teste do projeto, chamada paga, comando `git`/`supabase`, consulta ao banco ou acesso à rede foi executado. Toda conclusão abaixo é "defeito demonstrado no código" (categoria C), **não** prova de reprodução em produção.

## Proveniência do código verificado

| Item | Valor |
| --- | --- |
| Árvore inspecionada | `/home/joaquim_ataides/projetos/Zapp_Web_V2` (worktree, `refs/heads/main`) |
| Shim do worktree inspecionado | `refs/heads/main` = `cbe75963e5dae093d551733abb6ced721fe74884` |
| `refs/remotes/origin/main` | `0ab84095d34548124d0feefb6cdec0dedda7c5fe` (HEAD de main declarado na tarefa) |
| Referência declarada pelo plano | `5209b8a43730cf8e620295bc0a84850737bf9631` (não presente como ref neste clone) |
| Tarefa worktree | `refs/heads/hermes/ia-bloco-01-preparacao-26092914200da6` = `0ab84095…` (igual a `origin/main`) |

Os 28 arquivos citados neste relatório foram comparados byte a byte (`diff -q`) entre a árvore inspecionada (`refs/heads/main`) e o worktree da tarefa (`0ab84095`): **idênticos**, exceto `supabase/functions/_shared/schemas.ts`, que difere apenas a partir da linha 187 (schemas do Sicoob), mantendo a linha citada (**36**) idêntica nas duas árvores. Portanto todas as referências `arquivo:linha` abaixo valem simultaneamente para `cbe75963` e para `0ab84095`. Em nenhum ponto foi impresso valor de secret.

---

## Parte 1 — Contagem dos 10 achados

| # | Achado (seção "Achados que motivam a priorização") | Status |
| --- | --- | --- |
| 1 | Roteamento configurável e chamadas fixas ao gateway em paralelo | **CONFIRMADO** |
| 2 | Normalizações divergentes de sentimento/prioridade | **CONFIRMADO** |
| 3 | Resultados de backend não aplicados nos painéis de churn/classificação | **CONFIRMADO** |
| 4 | Perda de campos no histórico | **CONFIRMADO** |
| 5 | Fontes gerenciais insuficientes | **CONFIRMADO** |
| 6 | Quota não atômica | **CONFIRMADO** |
| 7 | Registro incompleto de streaming | **CONFIRMADO** |
| 8 | Classificações de áudio por nome/URL | **CONFIRMADO** |
| 9 | Webhook ElevenLabs em modo de observação | **CONFIRMADO** |
| 10 | Ausência de autorização por objeto no handler de download de áudio | **CONFIRMADO** |

**Totais: 10 CONFIRMADO · 0 PARCIAL · 0 NÃO CONFIRMADO · 0 NÃO VERIFICADO.**

Todas as confirmações são estáticas (código presente na árvore). A "exposição efetiva" que o próprio plano condiciona ("exige confrontar gateway, configuração e permissões em execução") **permanece NÃO VERIFICADA**: envolve estado de secrets, RLS aplicada em produção e configuração de provedores, fora do escopo desta leitura.

---

## Parte 2 — Detalhamento dos 10 achados

### Achado 1 — Roteamento configurável e chamadas fixas ao gateway em paralelo — CONFIRMADO

**Roteamento configurável (existe):**
- `supabase/functions/ai-proxy/index.ts:51-60` — `getProvider` lê a tabela `ai_providers` filtrando `is_active`, `id`/`use_for` + `is_default`.
- `supabase/functions/ai-proxy/index.ts:73-111` — `dispatchProvider` roteia por `provider_type` (`lovable_ai`, `openai_compatible`, `google_gemini`, `custom_webhook`, `custom_agent`) com fallback OpenRouter.
- `supabase/functions/ai-proxy/index.ts:139-147` — resolve o provedor por `use_for` (`copilot`/`analysis`/`summary`/`tagging`/`auto_reply`, `index.ts:18`).
- `src/components/settings/ai-providers/useAIProviders.ts:16-27,42` — UI grava `ai_providers` (`is_default`, `use_for`, `provider_type`, `model`).
- `supabase/migrations/20260408194438_1ad57139-c089-4711-86e1-71d8f461e02d.sql:12,85` — tabela `ai_providers` e seed default.

**Chamadas fixas ao gateway em paralelo (existem e ignoram o roteamento):**
- `supabase/functions/_shared/ai-usage.ts:115` — `callAiWithTracking` faz `fetch("https://ai.gateway.lovable.dev/v1/chat/completions")` fixo. Consumidores: `ai-suggest-reply/index.ts:140`, `ai-conversation-summary/index.ts:100`, `ai-conversation-analysis/index.ts:116`, `ai-auto-tag/index.ts:90`, `ai-enhance-message/index.ts:50`, `chatbot-l1/index.ts:160`.
- `supabase/functions/_shared/ai-providers.ts:21` — `callLovableAI` com o mesmo endpoint fixo (usado só pelo `ai-proxy`).
- Chamadas fixas diretas (sem helper): `classify-audio-meme/index.ts:38`, `classify-sticker/index.ts:33`, `classify-emoji/index.ts:45`, `voice-agent/index.ts:108`.
- Modelo também fixado no corpo: `ai-suggest-reply/index.ts:145` (`google/gemini-3-flash-preview`), `classify-audio-meme/index.ts:45` (`google/gemini-2.5-flash-lite`).

**Reprodução esperada:** teste que cadastra um provedor `use_for=['summary']` como default com `api_endpoint` de um mock e chama `ai-conversation-summary`; observar que o request vai para `ai.gateway.lovable.dev` e não para o endpoint configurado. Equivalente ao aceite de IA-032 ("trocar o provedor da finalidade altera todas as chamadas abrangidas").

**Atenuação:** o `ai-proxy` de fato oferece roteamento; o defeito é de **cobertura/coexistência** (funções especializadas fora do roteamento), não ausência total.

---

### Achado 2 — Normalizações divergentes de sentimento/prioridade — CONFIRMADO

**Sentimento — escrito em português, lido em inglês:**
- Escrita (IA): `ai-conversation-analysis/index.ts:220,240` grava `sentiment` ∈ `positivo|neutro|negativo|critico`; `:265` grava `contacts.ai_sentiment` com o mesmo valor em PT.
- Leitura em EN (nunca casa): `src/components/ai/churnRisk.ts:46` (`=== 'negative'`), `:49` (`=== 'neutral'`) → contato `negativo` pontua 0 no fator de sentimento do churn.
- Leitura em EN (UI): `src/hooks/integrations/useTalkXSegments.ts:51` (opções `positive|neutral|negative`); `src/components/contacts/CRMContactCard.tsx:16` (mapa `positive/neutral/negative/critical`).
- Tipos: `src/integrations/supabase/types.ts:1956,2150-2151` (`ai_sentiment: string`; `conversation_analyses.sentiment: string`).

**Prioridade — dois vocabulários incompatíveis:**
- Escrita (IA): `ai-conversation-analysis/index.ts:266` → `ai_priority = urgency === 'critica' ? 'urgent' : urgency`, misturando `urgent` com `baixa|media|alta|critica`.
- Escrita manual: `src/components/inbox/chat/useChatPanelHandlers.ts:155` → `/priority high|medium|low` grava `ai_priority` em EN.
- Leitura em EN: `src/adapters/inboxAdapter.ts:96`, `src/pages/ChatPopup.tsx:114`, `src/components/inbox/VirtualizedRealtimeList.tsx:303` esperam `high|urgent|medium|low`. Um contato com `ai_priority='alta'` cai no default `'medium'`; `'critica'` só é lido como `'urgent'`.
- Classificação de ticket usa outro enum: `src/components/ai/ticketClassification.ts:20-25` (`urgent|high|medium|low`); urgência analítica usa `src/components/inbox/ai-tools/analysisConfigs.ts:66-71` (`baixa|media|alta|critica`).
- Churn: `src/components/ai/churnRisk.ts:25` retorna nível `'critical'`, mas `analysisConfigs.ts:83-87` (`churnConfig`) cobre apenas `low|medium|high` — `critical` não tem rótulo/cor mapeados.

**Reprodução esperada:** teste unitário de `computeChurnRisk({ai_sentiment:'negativo', …})` esperando +30 pontos e obtendo 0; e teste de `inboxAdapter` com `ai_priority='alta'` esperando `high` e obtendo `medium`.

---

### Achado 3 — Resultados de backend não aplicados nos painéis de churn/classificação — CONFIRMADO

**Churn:** `src/components/ai/ChurnPredictionDashboard.tsx`
- `:126-131` chama `ai-churn-analysis`, **descarta** o corpo retornado e refaz `analyzeChurnRisk()` (recomputação local).
- `:133-134` em erro mostra `toast.success('Análise local concluída com sucesso!')` — mascara falha como sucesso.
- `:45-98` recomputa o score localmente, duplicando `churnRisk.ts` **com divergência**: `:46` não aplica o clamp `Math.max(0, …)` que existe em `churnRisk.ts:33` (dias negativos por clock skew).
- Backend retorna o resultado e não o persiste: `ai-churn-analysis/index.ts:111-126` (`return jsonResponse({ results }, 200, req)`); cálculo por regras em `:82-104`.

**Classificação:** `src/components/ai/AutoTicketClassifier.tsx`
- `:121-129` chama `ai-classify-tickets`, **descarta** `data` e só recarrega as tags por `loadClassifiedTickets()`.
- `:128` em erro mostra `toast.success('Classificação local aplicada com sucesso!')` — mascara falha.
- `:47-63` duplica localmente `classifyTag`/`derivePriority` de `src/components/ai/ticketClassification.ts:27-43`.
- Backend retorna `{classified, results, summary}` e **não persiste**: `ai-classify-tickets/index.ts:82-98`.

**Reprodução esperada:** mockar `supabase.functions.invoke('ai-churn-analysis')` para retornar `riskScore` fixo e distinto do cálculo local e afirmar que o painel renderiza o valor do backend — falha, pois o painel ignora a resposta e renderiza o cálculo local. Idem para `ai-classify-tickets`.

---

### Achado 4 — Perda de campos no histórico — CONFIRMADO

**Perda na gravação:** `supabase/functions/ai-conversation-analysis/index.ts:235-249` insere apenas `contact_id, department, relationship_type, summary, sentiment, sentiment_score, customer_satisfaction, key_points, next_steps, topics, urgency, status, message_count`. Campos calculados e devolvidos **não são persistidos**: `agentPerformance` (`:225`, devolvido em `:279`), `churnRisk` (`:226`), `salesOpportunity` (`:227`).

**Perda na leitura:** `src/components/inbox/ai-tools/HistoryTab.tsx:8-23` (`HistoryItem`) e `:59-71` (`onLoadHistory`) mapeiam só `department, relationshipType, summary, status, keyPoints, nextSteps, sentiment, sentimentScore, topics, urgency, customerSatisfaction` — omitem `analysisId`, `agentPerformance`, `churnRisk`, `salesOpportunity` (que existem em `AnalysisData`, `analysisConfigs.ts:24-40` e são renderizados por `SummaryTab.tsx:39-44,84-91` e `SentimentTab.tsx`).
- Interface do hook também não os declara: `src/hooks/chat/useConversationAnalyses.ts:5-20` (select `*` em `:42`, mas tipo sem esses campos).

**Reprodução esperada:** gerar uma análise com `churnRisk='high'`, `salesOpportunity` e `agentPerformance`; recarregar o painel e abrir a entrada do histórico → "Oportunidade de Venda", badge "Churn" e desempenho do colaborador ausentes, apesar de terem sido calculados e devolvidos.

---

### Achado 5 — Fontes gerenciais insuficientes — CONFIRMADO

`src/components/admin/SupervisorCopilot.tsx` monta o contexto apenas com três consultas:
- `:37-42` — `queues (id, name)`, `profiles (id, name, role, is_active)` ativos, e contagem de `messages` das últimas 24h.
- `:44-51` — o texto enviado ao modelo é só a contagem de filas/agentes/mensagens e os nomes. Não há consulta de SLA, backlog por fila, tempo de espera, performance por atendente nem motivos de encerramento.
- As perguntas rápidas oferecidas pedem exatamente esses dados ausentes: `:17-21` ("Quais filas estão em risco de SLA?", "Quem está com maior backlog?", "…sem resposta há mais de 1h?", "Qual atendente tem melhor performance hoje?", "…motivos de encerramento mais comuns?").
- O modelo (generativo) responde então sem base factual (`:54-64`), apresentando-se como copiloto "que responde com base nos dados reais" (`:57`) — sem separar dado de estimativa.

**Reprodução esperada:** perguntar "Quais filas estão em risco de SLA?" e inspecionar o payload do `ai-proxy` — o `system` conterá apenas contagens de filas/agentes/mensagens, sem nenhuma métrica de SLA. Corresponde ao aceite de IA-117 ("cada resposta gerencial reproduzível a partir de consulta, período e amostra").

---

### Achado 6 — Quota não atômica — CONFIRMADO

`supabase/functions/_shared/ai-guards.ts`:
- `:30` chama `checkRateLimit(...)`, que é **em memória, por isolate**: `validation.ts:180-210` (comentário `"In-memory rate limiter (per-isolate, resets on cold start)"`). Vários isolates somam capacidades independentes.
- `:42-55` a quota diária é um **COUNT lido antes da chamada** (`ai_usage_logs`, `gte created_at`), sem reserva nem incremento atômico; o log de uso é gravado **depois** e de forma *fire-and-forget* (`ai-usage.ts:82-93`). Chamadas paralelas com contagem abaixo do teto passam todas.
- `:49-51` e `:56-58` — **fail-open** em erro de infraestrutura (a checagem retorna `null` = liberado).
- Existe um limitador persistente/atômico (`validation.ts:233-259`, RPC `consume_rate_limit`), mas o guard de IA **não o usa**.

**Reprodução esperada:** disparar N requisições paralelas ao `ai-proxy` (ou a qualquer função com `enforceAiGuards`) com a contagem prévia em `quota-1`; observar que todas são aceitas — total efetivo > quota. Corresponde ao aceite de IA-043.

---

### Achado 7 — Registro incompleto de streaming — CONFIRMADO

- `supabase/functions/ai-proxy/index.ts:204-208` — no caminho `stream`, retorna `response.body` diretamente com apenas `log.done(...)`; **não há `logAiUsage`** com tokens no caminho de streaming. Contraste: o caminho não-stream loga tokens em `:214-220` (`logAiUsage({ … inputTokens, outputTokens … })`).
- `supabase/functions/_shared/ai-usage.ts:139-153` — `callAiWithTracking` só registra tokens após `await response.json()`; com `stream: true` (setado em `ai-providers.ts:19,48`) o corpo é SSE, não há `usage` e o caminho de sucesso não grava tokens (o `catch` em `:154-167` grava apenas `error`).

**Reprodução esperada:** chamar `ai-proxy` com `stream: true` e consultar `ai_usage_logs` para esse `user_id`/`function_name` → nenhuma linha (ou linha sem tokens), enquanto a mesma chamada sem `stream` produz linha com tokens. Corresponde ao aceite de IA-053 ("o caminho de streaming não fica ausente dos relatórios").

**Observação correlata (não é achado isolado):** `useAIUsageDashboard.ts:70` limita a consulta a `.limit(1000)`, de modo que totais do painel são calculados sobre um subconjunto (relacionado a IA-056, fora dos 10).

---

### Achado 8 — Classificações de áudio por nome/URL — CONFIRMADO

`supabase/functions/classify-audio-meme/index.ts`:
- `:21` — entrada é `{ audio_url, file_name }` (`ClassifyAudioMemeSchema`).
- `:30-36` — o prompt instrui: "Com base no **nome do arquivo** \"${file_name}\" e na **URL** \"${audio_url}\", classifique…".
- `:38-51` — envia esse prompt ao LLM (generativo); **o áudio nunca é baixado, transcrito ou analisado**. A URL entra só como texto.
- `:53-57` e `:67-70` — em erro/timeout retorna `{ category: 'outros' }` com HTTP 200, indistinguível de uma classificação válida.
- Não há `requireAuth` no handler (`:11-19`); a proteção depende do `verify_jwt` padrão do gateway (nenhuma entrada para `classify-audio-meme` em `supabase/config.toml`).

**Reprodução esperada:** enviar dois áudios de conteúdo diferente com o mesmo `file_name` → mesma categoria; enviar um clipe real de risada nomeado `001.mp3` → categoria derivada só do nome. Corresponde a IA-131 ("não afirmar ter ouvido um arquivo quando recebeu somente seu nome").

---

### Achado 9 — Webhook ElevenLabs em modo de observação — CONFIRMADO

- `supabase/functions/elevenlabs-webhook/index.ts:14-19` — comentário `[WEBHOOK_AUTH_SHADOW] "Modo sombra: valida mas NUNCA bloqueia nesta etapa"`; chama `logElevenLabsAuthShadow(...)` (nome "log").
- `supabase/functions/_shared/hmac-validation.ts:325-369` — `logElevenLabsAuthShadow` **nunca lança e nunca bloqueia**; o contrato em `:255-262` explicita: "none of these helpers ever throw, and their return value must NEVER be used to gate/short-circuit the HTTP response".
- `elevenlabs-webhook/index.ts:38-43` grava em `audit_logs` e `:68-69` **sempre** retorna 200, sem caminho de rejeição.
- `supabase/config.toml:20-21` — `[functions.elevenlabs-webhook] verify_jwt = false` (endpoint público por design).

**Reprodução esperada:** `POST` no `elevenlabs-webhook` com `ElevenLabs-Signature` inválida → resposta 200 `{received:true}` e nova linha em `audit_logs`; nenhuma rejeição 401. Corresponde a IA-013.

---

### Achado 10 — Ausência de autorização por objeto no handler de download de áudio — CONFIRMADO

`supabase/functions/ai-transcribe-audio/index.ts`:
- `:31-61` — `downloadAudio` valida **apenas** bucket/origem via `parseApprovedStorageUrl(audioUrl, supabaseUrl, APPROVED_AUDIO_BUCKETS)` (`:41-46`) e o limite de 25MB (`:57-58`). **Não** verifica se o objeto pertence ao solicitante (usuário, contato, conexão ou mensagem).
- `:36,50-51` — o download é feito com **service role** (`sb.storage.from(bucket).download(path)`), contornando RLS de Storage.
- `_shared/ssrf.ts:72-110` — `parseApprovedStorageUrl` confere origem exata do projeto e bucket na allowlist (`whatsapp-media`, `audio-messages`, `audio-memes`, `ai-transcribe-audio/index.ts:21-25`), além de barrar path traversal — mas não há checagem de posse por objeto.
- O parâmetro `messageId` é recebido (`:104`) mas **não** é usado para autorizar o download.

**Reprodução esperada:** usuário A obtém uma URL de Storage assinada do áudio de B (bucket aprovado) e chama `ai-transcribe-audio` com essa `audioUrl` → download service-role e transcrição de áudio de B retornam 200. Corresponde a IA-014 ("conhecer a URL de outro usuário não concede acesso ao áudio").

**Atenuação:** existe controle de escopo **por bucket/origem** (allowlist + mesma origem do projeto) e limite de tamanho; o que falta é a autorização **por objeto**.

---

## Parte 3 — Natureza da inteligência por indicador/recurso (IA-006)

Legenda: **G** = IA generativa (LLM); **D** = heurística/cálculo determinístico; **M** = entrada manual do usuário; **I** = dado importado de sistema externo (CRM externo).

| Indicador / recurso | Onde (arquivo:linha) | Natureza | Nota de limite |
| --- | --- | --- | --- |
| Sentimento da conversa (`sentiment`, `sentiment_score`) | `ai-conversation-analysis/index.ts:141-142,220-221,240-241` | **G** (saída estruturada de LLM) | É sentimento **estimado**; exibido como `%` (`HistoryTab.tsx:86-88`) |
| "Satisfação" / `customer_satisfaction` | `ai-conversation-analysis/index.ts:103,145,222,242` | **G** (estimativa 1-5) | Não é CSAT respondido; `SummaryTab.tsx:74` rotula só "Satisfação" |
| Desempenho do colaborador (empatia/clareza/eficiência/conhecimento) | `ai-conversation-analysis/index.ts:104,146-154` | **G** (avaliação textual) | "desempenho estimado"; não persistido (Achado 4) |
| Risco de churn do painel (`riskScore`) | `ChurnPredictionDashboard.tsx:45-98`; `churnRisk.ts:31-79` | **D** (regras de inatividade/sentimento) | Apresentado como "% de probabilidade" (`:213,232`) |
| Análise de churn do backend (`riskScore`) | `ai-churn-analysis/index.ts:82-120` | **D** (regras) | Botão "Análise IA" (`ChurnPredictionDashboard.tsx:175-178`); resultado descartado |
| `churn_probability` do CRM | `useContactIntelligence.ts:62`; `ContactIntelligencePanel.tsx:187-189` | **I** (CRM externo) | Exibido como "%"; método de cálculo não auditado |
| Classificação de tickets (categoria/prioridade/confiança) | `AutoTicketClassifier.tsx:47-63`; `ai-classify-tickets/index.ts:45-80` | **D** (regras por palavra-chave) | Cabeçalho diz "IA classifica" (`:149`); `confidence` default 0.7 (`ticketClassification.ts:59`) |
| Auto-tag (`tag_name`, `confidence`) | `ai-auto-tag/index.ts:90` | **G** | Alimenta a classificação acima |
| Sugestão de resposta | `ai-suggest-reply/index.ts:140` | **G** | — |
| Melhoria/reescrita de mensagem | `ai-enhance-message/index.ts:50` | **G** | — |
| Resumo de conversa | `ai-conversation-summary/index.ts:100` | **G** | — |
| Chatbot L1 | `chatbot-l1/index.ts:160` | **G** | — |
| Classificação de áudio meme | `classify-audio-meme/index.ts:38` | **G** (entrada só nome/URL) | Não ouve o áudio (Achado 8) |
| Classificação de sticker/emoji | `classify-sticker/index.ts:33`; `classify-emoji/index.ts:45` | **G** | — |
| Voice agent | `voice-agent/index.ts:108` | **G** | — |
| Copiloto do supervisor | `SupervisorCopilot.tsx:54-64` | **G** com contexto determinístico insuficiente | Responde sobre SLA/backlog sem esses dados (Achado 5) |
| Próxima melhor ação (`useNextBestAction`) | `useNextBestAction.ts:36-140` | **D** (regras sobre mensagens/tarefas/SLA/memória) | Sem tratamento de erro: consulta falha → default "upsell" (`:129-137`) |
| Briefing, triggers, rapport, melhores horários, DISC tips | `useContactIntelligence.ts:13-89`; `ContactIntelligencePanel.tsx:47-251` | **I** (RPC do CRM externo) | Sem rótulo de origem/validade na UI |
| `relationship_score` | `ContactFormDialog.tsx:221` (**M**); `useSyncToCRM.ts:38` (**I** recálculo externo); `ContactIntelligencePanel.tsx:91`, `ContactHeaderSection.tsx:64` (leitura) | **M + I** | Mesmo conceito, dois produtores |
| `ai_priority` | `useChatPanelHandlers.ts:155` (**M**, `/priority`) + `ai-conversation-analysis/index.ts:266` (**G**, da urgência) | **M + G** | Dois escritores no mesmo campo com vocabulários distintos (Achado 2) |
| `ai_sentiment` | `ai-conversation-analysis/index.ts:265` | **G** | Comparado em EN por consumidores (Achado 2) |
| `lead_score` / `risk_score` | `integrations/supabase/types.ts:1976,1985`; `useTalkXSegments.ts:48-49` | **I** (CRM externo) | Rótulos "Lead score"/"Risco de churn" na segmentação |
| CSAT respondido | Tabelas `csat_surveys`/`csat_auto_config` (`types.ts:2832,2908`); `types/contact.ts:15-16` | **dado medido** (respondido pelo cliente) | **Separado** do "CSAT Estimado" da análise |

### Onde a UI apresenta estimativa/índice como se fosse medida

1. **Score de churn heurístico exibido como probabilidade** — `ChurnPredictionDashboard.tsx:213` descreve "maior probabilidade de churn" e `:232` renderiza `riskScore` como `{n}%`. Natureza **D**; sem calibração histórica, não é probabilidade (IA-113).
2. **`churn_probability` importado exibido como "%"** — `ContactIntelligencePanel.tsx:187-189` mostra `Risco de churn` = `Math.round(churn_probability)%` sem indicar origem externa nem método; dado **I** apresentado como inferência do ZAPP (IA-119).
3. **Confiança de classificação com default indevido** — `ticketClassification.ts:59` (`confidence > 0 ? confidence : 0.7`) e `AutoTicketClassifier.tsx:86` (`(tag.confidence || 0.7) * 100`) transformam confiança ausente/**zero** em **70%**, exibido como "Confiança 70%" (`:225-226`) — viola o aceite de IA-023 ("confiança zero não vira 70%").
4. **"Satisfação" sem rótulo de estimativa** — `SummaryTab.tsx:72-82` exibe estrelas e `{n}/5` sob o rótulo seco "Satisfação", enquanto `SentimentTab.tsx:45` usa o rótulo correto "CSAT Estimado". A mesma grandeza estimada aparece rotulada de duas formas (IA-068).
5. **Sentimento estimado como `%`** — `HistoryTab.tsx:86-88` (`{item.sentiment_score}%`) e `useSentimentAlerts.ts:22-82` tratam o score 0-100 do modelo como se fosse leitura precisa de sentimento.

### Equivalências indevidas a eliminar (síntese para IA-006)

- **score ≠ probabilidade:** `riskScore` (D, 0-100) e `churn_probability` (I) não são probabilidades calibradas; hoje ambos aparecem como "%".
- **sentimento estimado ≠ CSAT respondido:** `conversation_analyses.customer_satisfaction`/`sentiment_score` (G) não são `csat_surveys` (medido) — só `SentimentTab.tsx:45` distingue.
- **confiança do modelo ≠ precisão:** default 0.7 e exibição em `%` sugerem precisão inexistente.
- **dado importado ≠ inferência do ZAPP:** briefing/rapport/melhores horários/churn/DISC (`I`) não têm badge de origem; o cabeçalho do painel sugere geração própria (`ContactIntelligencePanel.tsx:1-7`).
- **input manual ≠ IA:** `ai_priority` (`M` via `/priority` e `G` via análise) e `relationship_score` (`M` no formulário e `I` no recálculo externo) compartilham o mesmo campo sem distinguir procedência.

---

## Parte 4 — Itens verificados de passagem (fora dos 10) e limitações

**Confirmados de passagem (seção "ampliação desta revisão", linha 34 do plano):**
- Contrato de análise com máximo de 200 mensagens: `supabase/functions/_shared/schemas.ts:36` (`.max(200)`), campos enviados pelo frontend não declarados no schema. **CONFIRMADO**.
- Painel de memória não reinicializa estado quando o novo contato não tem registro: `ConversationMemoryPanel.tsx:42-61` — `setMemory` só é chamado dentro de `if (data)`, então a memória do contato anterior permanece, e o `saveMemory` (`:97-99`) usa o `memory.id` antigo (`update … eq('id', memory.id)`) — risco de sobrescrever/mesclar memória entre contatos. **CONFIRMADO** (relacionado a IA-029).
- CRM externo fornece briefing/rapport/horários/churn/DISC: `useContactIntelligence.ts:1-6,79-89,98`. **CONFIRMADO** (dado **I**); métodos de cálculo e estado real do serviço externo **NÃO VERIFICADOS** (requer acesso ao CRM, fora do escopo).

**NÃO VERIFICADO (fora do recorte dos 10):** estado de secrets (`ELEVENLABS_WEBHOOK_SECRET`), RLS efetivamente aplicada em produção, configuração real dos provedores em `ai_providers`, existência de deploy/versão em produção (IA-191) e qualidade dos métodos do CRM externo.

---

## Anexo — Reprodução por teste (resumo)

| # | Teste que demonstraria o achado |
| --- | --- |
| 1 | Cadastrar provedor default para `use_for=summary` apontando a mock e verificar que `ai-conversation-summary` ainda usa `ai.gateway.lovable.dev` |
| 2 | Unitário: `computeChurnRisk` com `ai_sentiment='negativo'` → espera 30 pts, obtém 0; `inboxAdapter` com `ai_priority='alta'` → espera `high`, obtém `medium` |
| 3 | Mockar `ai-churn-analysis`/`ai-classify-tickets` com resultado fixo e afirmar que o painel renderiza o valor do backend (hoje ignora) |
| 4 | Analisar conversa com `churnRisk`/`salesOpportunity`/`agentPerformance`, recarregar e abrir o histórico → campos ausentes |
| 5 | Perguntar "filas em risco de SLA?" e inspecionar o payload do `ai-proxy` → sem métricas de SLA |
| 6 | N requisições paralelas com contagem prévia = `quota-1` → N aceitas |
| 7 | Chamada a `ai-proxy` com `stream:true` → nenhuma linha/nenhum token em `ai_usage_logs` |
| 8 | Dois áudios distintos com mesmo `file_name` → mesma categoria; clipe real com nome genérico → categoria pelo nome |
| 9 | `POST` com assinatura inválida no `elevenlabs-webhook` → 200 + `audit_logs`, sem 401 |
| 10 | Usar URL assinada de áudio de outro contato → download service-role e transcrição retornam 200 |

**Conclusão:** os 10 achados do plano estão **CONFIRMADOS** no código atual (10/10), e a classificação de natureza de IA-006 confirma que a maior parte dos indicadores hoje exibidos como "IA" é, na verdade, cálculo determinístico (churn do painel, classificação de tickets, próxima melhor ação) ou dado importado do CRM externo (churn probability, briefing, rapport, horários, DISC, lead/risk score); os recursos realmente generativos são sugestão/reescrita/resumo/análise/auto-tag/chatbot/classificadores de mídia/voz, e há pontos em que estimativa do modelo é apresentada como medida (score→probabilidade, satisfação estimada como CSAT, confiança defaultada para 70%).
