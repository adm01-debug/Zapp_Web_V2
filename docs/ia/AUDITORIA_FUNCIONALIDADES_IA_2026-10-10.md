# Auditoria honesta — funcionalidades de IA do Zapp_Web_V2 (10/10/2026)

- **Pergunta do dono do produto:** "todos os cards relacionados às funcionalidades de IA foram implementados e testados?"
- **Branch auditada:** `dia/2026-10-10` (lida via `git show`/`git grep` contra a ref, **sem checkout** — a working tree local está em HEAD destacado com 134 arquivos modificados/não rastreados, provavelmente de agentes da fábrica em andamento; checkar a branch trocaria o chão deles no meio do trabalho).
- **Método:** 100% leitura. Nenhum arquivo de código editado, nenhum `tsc`/`vitest`/build/E2E executado, nenhuma escrita no kanban/banco. Toda linha abaixo foi conferida no código ou no kanban nesta sessão — não é repetição do inventário de 29/09 sem checagem.
- **Já existia um inventário interno muito bom** (`docs/ia/IA-002-inventario-frontend-ia.md`, coletado em 29/09 por outra rodada de auditoria, 59 pontos de UI mapeados arquivo:linha). Usei-o como mapa de partida e **revalidei por amostragem** contra o código de hoje (10/10) e contra o kanban — encontrei pontos que já foram corrigidos desde 29/09 (churn/classificador de tickets) e pontos novos que o inventário de 29/09 não cobria (Talk X, Perfil Singu, TALK ME, agentes especializados). Divergências estão marcadas abaixo.

## Resposta curta

**Não.** A maior parte do que está nas telas de IA funciona e tem pelo menos uma camada de teste real. Mas há um número relevante de pontos "feito mas sem teste" (a maioria dos botões de IA do Inbox), pelo menos **duas funcionalidades que existem no código mas não fazem nada de real hoje** (colunas de score de IA no Talk X nunca calculadas; infraestrutura de IA do Talk X sem nenhum chamador no frontend), e um bloco inteiro ("agentes especializados") que está 8 de 10 etapas **não implementado**, apesar de ter passado por um cartão "done" no kanban — porque esse cartão era de **auditoria**, não de construção.

---

## ETAPA 1 — Onde a IA aparece no produto (mapa)

| Área | O que é | Pasta/arquivo raiz |
|---|---|---|
| Inbox — aba "IA" do chat | Sugestão de resposta, resumo, análise/sentimento, objeções, ajuda universitários | `src/components/inbox/tabs/AiTab.tsx`, `src/components/inbox/chat/ConversationTabContent.tsx:84` (`activeTab === 'ia'`) |
| Inbox — header/input do chat | Aprimorar/reescrever mensagem, voz (TTS/STS/Voice Changer/STT), comando de voz global | `src/components/inbox/chat/*`, `src/components/voice/*` |
| Painel do contato | "Insights da IA", "Inteligência comercial" (briefing/DISC/gatilhos/rapport/churn) | `src/components/inbox/contact-details/*` — dados vêm do **CRM externo** via `crm-integration` |
| Painel do contato — sidebar | "Perfil Singu": DISC, VAK, Big Five, MBTI, Eneagrama, Temperamento | `src/components/inbox/contact-details/sidebar/SinguProfileSection.tsx` |
| CRM/churn/tickets | Previsão de Churn, Classificador de Tickets, Tags automáticas, Copiloto do Supervisor | `src/components/ai/ChurnPredictionDashboard.tsx`, `AutoTicketClassifier.tsx`, `src/components/settings/AIAutoTagsConfig.tsx`, `src/components/admin/SupervisorCopilot.tsx` |
| Dashboard | "IA Quick Access", cards de IA, Tendência de Sentimento, Consumo de IA (admin), Saúde dos Provedores | `src/components/dashboard/AIQuickAccess.tsx`, `SentimentTrendChart.tsx`, `src/components/admin/AIUsageDashboard.tsx` |
| Configurações | Gestão de Provedores de IA, Chatbot IA L1, geração de voz/diálogo/SFX (ElevenLabs), biblioteca de mídia (classificação automática) | `src/components/settings/ai-providers/*`, `ChatbotL1Config.tsx`, `src/components/voice/*`, `src/components/settings/MediaLibraryAdmin.tsx` |
| Base de conhecimento | Busca determinística (RPC) + ingestão/processamento por IA no upload | `src/components/knowledge/KnowledgeBaseView.tsx`, `supabase/functions/ai-kb-ingest/` |
| Talk X (campanhas em massa) | Segmentação por "Sentimento (IA)"/"Prioridade (IA)"/"Lead score"/"Risco de churn"; infraestrutura própria de IA (`talkx-ai`) | `src/hooks/integrations/useTalkXSegments.ts`, `supabase/functions/talkx-ai/` |
| Treinamento de agentes | Simulação de atendimento com nota determinística (não é IA generativa) | `src/components/admin/TrainingMode.tsx` |
| Agentes especializados (camada futura) | Catálogo de ferramentas, executor supervisionado, especialistas por departamento | **majoritariamente não existe** — ver bloco dedicado abaixo |
| "TALK ME" | **Não é IA.** É fila de atendimentos aguardando (contador + navegação), atrás de feature flag `inbox.talk-me` | `src/features/talk-me/`, `src/components/inbox/RealtimeInboxView.tsx:62-106` |
| Mockup/Promo_Gifts_V4 | **Não encontrado neste repositório.** Só existe `supabase/functions/promogifts-catalog` (listagem/paginação de catálogo, 100% determinístico, sem IA) | — |

---

## ETAPA 2 — Tabela por funcionalidade

Legenda de evidência: `arquivo:linha` é do código na ref `dia/2026-10-10`. "Cartão" cita o id do kanban (`hermes kanban show <id>`) quando existe um que prova o estado.

### A — Inbox: ferramentas de IA sobre a conversa

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Depende de IA externa? |
|---|---|---|---|---|---|
| Sugestão de resposta (aba IA, "Copilot IA") | Sim — chama `ai-suggest-reply` | **Não** (frontend). Backend tem `supabase/functions/ai-suggest-reply/index.test.ts` | — | `src/components/inbox/AISuggestions.tsx:37-65`; teste mocado em `AiTab.test.tsx:24-28` | Sim, via `ai-proxy`/provedor configurado em `ai_providers` |
| Resumo da conversa | Sim — chama `ai-conversation-summary`, exige ≥10 mensagens | Parcial — `ConversationSummary.test.tsx` cobre render/prop, **não cobre a chamada à IA** | — | `src/components/inbox/ConversationSummary.tsx:30-67` | Sim |
| Análise profunda/sentimento ("Visão") | Sim — chama `ai-conversation-analysis`, dispara alerta de sentimento | **Não** para o componente; hook `useConversationAnalyses.test.tsx` só confirma que `saveAnalysis` existe | — | `src/components/inbox/AIConversationAssistant.tsx:78-133` | Sim |
| Detector de Objeções | Sim — `ai-proxy`, prompt com tom | **Não** | — | `src/components/inbox/ObjectionDetector.tsx`, `src/hooks/inbox/useObjectionDetector.ts:70` | Sim, modelo fixo no cliente (`google/gemini-3-flash-preview`) |
| Ajuda dos Universitários | Sim — `ai-proxy` | **Não** | — | `src/components/inbox/UniversityHelp.tsx`, `src/hooks/ui/useUniversityHelp.ts:104,116` | Sim, modelo fixo no cliente |
| Aprimorar/Reescrever mensagem (Sparkles/tom) | Sim — `ai-enhance-message` | **Não** | — | `src/components/inbox/chat/AIEnhanceButton.tsx:45-67`, `AIRewriteButton.tsx:33-50` | Sim |
| Copiloto do Supervisor | Sim — `ai-proxy`, só supervisor/admin | **Não** | — | `src/components/admin/SupervisorCopilot.tsx:29-60`; gate `AdminView.tsx:89` | Sim, modelo fixo no cliente |
| Alertas de sentimento (automático) | Sim — `sentiment-alert`, dedupe, Realtime | **Sim** — `useSentimentAlerts.test.ts`, `useRealtimeSentimentAlerts.test.ts` | — | `src/hooks/inbox/useSentimentAlerts.ts:26-86` | Não é chamada de IA nova; usa score já calculado |
| Chatbot IA L1 (atendimento automático) | Sim — grava `chatbot_flows`, roda no backend | **Não** no frontend de config | — | `src/components/settings/ChatbotL1Config.tsx:68-105,232-244` | Sim |

### B — Classificação automática e scores

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Externa? |
|---|---|---|---|---|---|
| Previsão de Churn (botão "Análise IA") | **Sim, e corrigida.** Até ~29/09 o resultado da IA era descartado (tela só mostrava cálculo local, e no erro mentia "análise local concluída"). **Isso foi corrigido**: hoje `applyAiResults()` aplica score/nível/motivos reais do backend e os toasts de erro são honestos | **Sim, boa.** 4 testes dedicados simulam sucesso, falha, resultado vazio e resultado fora da lista de contatos carregados | `t_18acead7` (SL-012) **done**, resultado real conferido: "83/83 verdes" | `src/components/ai/ChurnPredictionDashboard.tsx:148-196`; teste: `src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx:231-345` | Sim, `ai-churn-analysis` → `ai-proxy` |
| Classificador de Tickets (lote) | **Sim, e corrigida** no mesmo cartão SL-012 — hoje consome o resultado do servidor | **Sim** — bloco `describe('Resultado de ai-classify-tickets aplicado (IA-114)')` | `t_18acead7` (SL-012) **done** | `src/components/ai/AutoTicketClassifier.tsx`; teste: `src/components/ai/__tests__/AutoTicketClassifier.test.tsx:211-...` | Sim, `ai-classify-tickets` |
| Switch "Auto-classificar" (Classificador de Tickets) | Existe no UI, mas **decorativo** — o estado não é lido em nenhum outro lugar do arquivo | Teste só confirma o rótulo, não o efeito (porque não há efeito) | — | `AutoTicketClassifier.tsx:154` (estado em `:41`, não referenciado depois) | n/a |
| Tags automáticas por IA | Sim — `ai-auto-tag`, loop de 20 contatos com 1s de intervalo | **Não** de verdade — mocado em `SettingsView.test.tsx:45` | `t_72e0c632` (done, corrigiu bug de etiqueta remanescente) | `src/components/settings/AIAutoTagsConfig.tsx:40-73` | Sim |
| Classificação de figurinha/emoji/áudio-meme | Sim — `classify-sticker`/`classify-emoji`/`classify-audio-meme`, grava categoria | **Não** no frontend | `t_b7058d3c`, `t_041c6e40` (SL-215A, done) corrigiram falha/baixa-confiança/categoria | `src/components/inbox/chat/MessageBubble.tsx:214-217`, `src/hooks/sticker-picker/useStickerPicker.ts:47-73` | Sim |
| "Próxima melhor ação" | **Não é IA.** Heurística 100% local sobre 4 consultas ao banco | `Crm360Tab.test.tsx` cobre o card | — | `src/hooks/chat/useNextBestAction.ts:25-145` | Não |

### C — Perfil Singu / CRM 360 (DISC, VAK, Big Five, MBTI)

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Externa? |
|---|---|---|---|---|---|
| Widget "Perfil Singu" na sidebar do contato (DISC/VAK/Big Five/MBTI/Eneagrama/Temperamento) | Sim — renderiza o que vier de `data.singu_profile` | **Sim** (render/formatação) — `SinguProfileSection.test.tsx`, `SinguProfileTile.test.tsx`, `SinguProfileDetailSheet.test.tsx`, `singuLabels.test.ts` | — | `src/components/inbox/contact-details/sidebar/SinguProfileSection.tsx:135-204` | **A classificação em si roda fora deste repositório.** O frontend só pede `crm-integration` com `lookup: 'sidebar'` (`src/services/crm/external-crm.service.ts:109-110`) e **não verificado** se o CRM externo (Singu) está configurado/ativo em produção — se não estiver, a seção simplesmente não aparece (kill switch fail-closed) |
| "Inteligência comercial" (briefing, DISC, gatilhos, rapport, horários, risco) no painel do contato | Sim — mesmo caminho (`crm-integration`/`intelligence`) | **Não** | — | `src/components/inbox/contact-details/ContactIntelligencePanel.tsx:257-286` | Idem — IA roda no CRM externo, não aqui |
| Integração completa Contatos ↔ Singu (filtros, ficha 360 completa, edição) | **Ainda não.** Projeto de 100 etapas em planejamento; vários cartões `CT-0xx` ainda **scheduled** (nunca entraram em execução) | — | `t_80961d8c` (CT-036 "Ficha completa do Singu"), `t_cf618390` (CT-032), `t_25d57f66` (CT-034) — todos `scheduled` | `docs/plans/PLANO_MODULO_CONTATOS_100_ETAPAS...` (citado nos cartões) | — |

### D — Voz (ElevenLabs) e transcrição

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Externa? |
|---|---|---|---|---|---|
| Transcrição de áudio recebido (sob demanda) | Sim — `ai-transcribe-audio`, persiste em `messages.transcription` | **Não** no componente; backend tem `supabase/functions/ai-transcribe-audio/index.test.ts` | `t_fa27e926` (SL-195a, done — usa magic bytes para validar o áudio) | `src/components/inbox/AudioMessagePlayer.tsx:52-67` | Sim, ElevenLabs |
| STT em tempo real / Voice Changer / TTS / STS / Diálogo multi-voz / Voice Design / SFX | Sim, todas chamam Edge Functions dedicadas (`elevenlabs-*`) | **Nenhuma tem teste real** (todas mocadas em `SettingsView.test.tsx`) | **4 cartões de kill switch pendentes:** `t_80b50903` (SL-010b-1, **blocked**), `t_65fedb4a`/`t_e152e9a1`/`t_879a5b56` (SL-010b-2/3/4, **todo**) | `src/components/inbox/RealtimeTranscription.tsx`, `VoiceChangerPicker.tsx`, `TextToAudioButton.tsx`, `VoiceChanger.tsx`, `src/components/voice/ElevenLabsDialogue.tsx`, `ElevenLabsVoiceDesign.tsx` | Sim, ElevenLabs — **sem gating por papel na aba "Sons"**: qualquer agente comum pode gerar diálogo/voz hoje (`SettingsView.tsx:165-171` não está sob `isStaff`) |
| Comando de voz global (busca por voz) | Sim — `voice-agent` + `elevenlabs-scribe-token` + `elevenlabs-tts-stream`, com fallback para `speechSynthesis` do navegador se a IA falhar | **Não** | — | `src/hooks/communication/useVoiceAgent.ts:17-105`, fallback em `src/hooks/voice/playTtsAudio.ts:114-136` | Sim, com fallback local honesto |
| Simulação de atendimento para treinamento | Sim — cenários fixos anonimizados, nota por critério de texto observável (**determinístico, não é IA generativa**) | **Sim** — `TrainingMode.avaliacao.test.tsx` prova determinismo (mesmo texto → mesma nota) | `t_38778cb9` (SL-218) cita esta etapa como a única "IMPLEMENTADA" do bloco de agentes | `src/components/admin/TrainingMode.tsx`; doc: `docs/ia/IA-171-a-IA-180-agentes-especializados.md:92-102` | Não |

### E — Talk X (campanhas em massa)

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Externa? |
|---|---|---|---|---|---|
| Segmentar audiência por "Sentimento (IA)" / "Prioridade (IA)" | Sim, e **os valores são reais** — `ai_sentiment`/`ai_priority` são gravados por `ai-conversation-analysis`, `ai-auto-tag` e `chatbot-l1` | Teste de contrato cobre o vocabulário (`ai-vocabulary-parity.contract.test.ts`) | — | `src/hooks/integrations/useTalkXSegments.ts:25,85-86`; escritores: `supabase/functions/ai-conversation-analysis/index.ts:282`, `chatbot-l1/index.ts:270` | Sim (indiretamente, via essas funções) |
| Segmentar audiência por "Lead score" / "Risco de churn" | **Existe no filtro, mas é morto.** `contacts.lead_score` e `contacts.risk_score` foram criados com `DEFAULT 0` (`supabase/migrations/20260409014536_...sql:136-137`) e **nenhum lugar do repositório grava um valor diferente de 0** nessas duas colunas (busquei em todas as Edge Functions, hooks e migrations) | — | — | `src/hooks/integrations/useTalkXSegments.ts:80-81` | Não se aplica — nunca é calculado |
| Infraestrutura própria de IA do Talk X (`talkx-ai`: insight, variação de mensagem, sugestão de segmento) | **Implementada no backend** (teto de custo, cache 24h, trilha, limpeza de PII), **mas sem nenhum chamador no frontend** (`grep` por `talkx-ai`/`insight_text`/`message_variation`/`segment_suggestion` em `src/` não retorna nada) — é código morto do ponto de vista do produto hoje | Backend: `supabase/functions/talkx-ai/index.test.ts` | `t_4834e8b8` (TL-063) **done** | `supabase/functions/talkx-ai/index.ts:1-30` (comentário do próprio arquivo já assume esse desenho) | Sim, via `ai-proxy`, mas feature flag `ai_insights` com orçamento padrão **0 = desligada** |
| "IA classificação e risco de perda" nos cards/barras de Talk X | **Em rodada de correção** — recusado 1x (nome acessível/axe incompletos), aguardando 2ª entrega | — | `t_33649b00` ([refazer 2] N-172) **ready** | — | — |
| "IA: sugestão de resposta usa artigos da base" (vincula KB à sugestão) | **Em rodada de correção** — código aprovado tecnicamente, recusado 2x por qualidade do **relato** (não do código) | Sim — 2 testes novos em `ai-suggest-reply/index.test.ts:216,240` | `t_505039f2` ([refazer 2] N-170) **ready** | `supabase/functions/ai-suggest-reply/index.test.ts` | Sim |

### F — Base de conhecimento (treina as respostas de IA)

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Externa? |
|---|---|---|---|---|---|
| Busca na base de conhecimento (painel do contato) | Sim, mas **não é IA** — RPC `search_knowledge_base` determinística | **Não** | — | `src/components/inbox/KnowledgeBaseSearchPanel.tsx:17-40` | Não |
| Ingestão/processamento por IA no upload de documento | **Sim, após 2 rodadas de correção.** 1ª entrega foi **rejeitada pelo revisor** por falha grave de autorização (qualquer usuário autenticado podia processar `fileId` de outro e publicar artigo na base, contornando RLS) + corrida de dados + teste que mascarava o estado. A 2ª rodada corrigiu com checagem `is_admin_or_supervisor` antes de ler o arquivo — **confirmei no código de hoje** que o check está presente | **Sim** — 14 casos no `index.test.ts` do backend; hook `useKnowledgeBase.uploadIngest.test.tsx` no frontend | `t_83dca7ad` → **rejeitado** → `t_f4fe89b4` (refazer 1) → `t_4ba8a3c5` (refazer 2) **done, aprovado** | `supabase/functions/ai-kb-ingest/index.ts:66,114`; teste: `supabase/functions/ai-kb-ingest/index.test.ts` | Sim — extração de texto roda localmente (sem IA generativa nessa etapa); a IA usa o artigo publicado depois |

### G — Dashboards e administração de IA

| Funcionalidade | Implementada? | Testada? | Cartão/status | Evidência | Externa? |
|---|---|---|---|---|---|
| "IA Quick Access" (6 cards de feature) | Sim, mas **2 dos 6 cards navegam para `/sentiment-alerts`, rota que não existe** (`AppRoutes.tsx` não a define) → cai em NotFound | `DashboardView.test.tsx`, `AIToolsCard.test.tsx` mocam o componente | `t_30e309b9` (SL-165, done — mas sobre o chip "Ativo"/CSAT, não sobre a rota quebrada) | `src/components/dashboard/AIQuickAccess.tsx:154`, `src/components/dashboard/aiFeatures.ts:46,71` | — |
| Consumo de IA (admin) / Saúde dos Provedores | Sim — lê `ai_usage_logs`/`ai_providers` | **Não** | — | `src/components/admin/AIUsageDashboard.tsx`, `src/components/settings/ai-providers/AIProviderHealthPanel.tsx` | Leitura de telemetria já gravada |
| Gestão de Provedores de IA (CRUD + teste de conexão) | Sim — grava em `ai_providers`, testa via `ai-proxy` com `provider_id` explícito | Mocado em `SettingsView.test.tsx:46` | — | `src/components/settings/ai-providers/useAIProviders.ts:29-95` | Sim — **é o único lugar do frontend que escolhe o provedor por id**; os outros fluxos usam modelo fixo no cliente ou deixam o backend decidir |
| Alertas de consumo anômalo por capacidade | **Não implementado em operação.** Existe só o **projeto** (documento de design) | — | `t_59307667` (SL-011) e `t_30c7abe3` (#134) **done** — mas ambos são cartões de *auditoria confirmando que o gap continua*, não de construção | `docs/audits/PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md` | — |

### H — Agentes especializados / ações supervisionadas (camada futura)

Bloco de 10 etapas (IA-171 a IA-180). Estado medido em `docs/ia/IA-171-a-IA-180-agentes-especializados.md` (ponta de 08/10, reconfirmado por amostragem hoje):

| Etapa | Estado |
|---|---|
| IA-171 Catalogar ferramentas executáveis | **Não implementada** |
| IA-172 Separar planejamento de execução | Parcial (existe para a chamada de modelo, não para ação de negócio) |
| IA-173 Vincular aprovação ao efeito exato | **Não implementada** (nenhuma tabela/fluxo de aprovação existe) |
| IA-174 Especialistas por departamento | **Não implementada** (só existe o vocabulário de departamento, não assistentes com escopo próprio) |
| IA-175 Verificar respostas antes de agir | Parcial |
| IA-176 Sinalizar riscos proativamente | Parcial |
| IA-177 Simular atendimentos para treinamento | **Implementada** (ver `TrainingMode.tsx` acima) |
| IA-178 Avaliar múltiplos agentes por benefício | **Não implementada** |
| IA-179 Gerar briefing operacional periódico | Parcial |
| IA-180 Centralizar propostas e decisões | **Não implementada** |

**Importante para a pergunta do dono do produto:** o cartão `t_38778cb9` (SL-218, **done**) é sobre esse bloco — e "done" aqui significa "a auditoria confirmou que a lacuna existe e não cabia corrigir no tamanho de um cartão", **não** que o bloco foi construído. É o exemplo mais claro de cartão "done" que não corresponde a feature pronta.

---

## ETAPA 3 — Os três baldes

### Balde 1 — Feito e testado (de verdade, não é teste vazio)
- Previsão de Churn — resultado da IA aplicado + 4 testes de comportamento real (`ChurnPredictionDashboard.tsx`/`.test.tsx`)
- Classificador de Tickets — idem (`AutoTicketClassifier.tsx`/`.test.tsx`)
- Alertas de sentimento (automático + Realtime) — `useSentimentAlerts.test.ts`, `useRealtimeSentimentAlerts.test.ts`
- Transcrição de áudio — backend testado (14 casos no padrão do projeto), magic-bytes valida o arquivo
- Ingestão de documentos da base de conhecimento por IA — corrigida após rejeição de segurança, 14 testes no backend + teste no hook
- Perfil Singu (DISC/VAK/Big Five/MBTI) na sidebar — bem testado na **renderização**; a classificação de verdade acontece fora deste repo
- Dictado por voz mobile (Web Speech API) — sem IA paga, testado
- Simulação de treinamento (TrainingMode) — determinístico, testado

### Balde 2 — Feito, mas sem teste (ou teste fraco/mascarado)
- Sugestão de resposta de IA no chat (`AISuggestions`)
- Resumo de conversa (`ConversationSummary` — só testa render, não a chamada real)
- Análise profunda da conversa (`AIConversationAssistant`)
- Detector de Objeções, Ajuda dos Universitários, Copiloto do Supervisor — todos sobre `ai-proxy`, **nenhum teste**
- Aprimorar/Reescrever mensagem com IA
- Toda a família de voz ElevenLabs (Voice Changer, TTS, STS, Diálogo, Voice Design, SFX) — **e sem gating de papel na aba "Sons"**: qualquer agente comum usa
- Chatbot IA L1 (tela de configuração)
- Tags automáticas por IA, classificação de figurinha/emoji/áudio-meme
- Gestão de Provedores de IA (CRUD) — mocado, não testado de verdade

### Balde 3 — Não implementado (ou implementado mas não funciona de verdade)
Com cartão programado:
- Talk X "IA classificação e risco de perda" nas barras — `t_33649b00` (ready, [refazer 2])
- Talk X "sugestão de resposta usa artigos da base" — `t_505039f2` (ready, [refazer 2])
- Kill switch das Edge ElevenLabs restantes — `t_80b50903` (blocked), `t_65fedb4a`/`t_e152e9a1`/`t_879a5b56` (todo)
- Integração completa Contatos ↔ Singu (ficha 360, filtros por Singu) — `CT-032`/`CT-034`/`CT-036`/`CT-040`/`CT-073`/`CT-077`/`CT-111`/`CT-112`/`CT-113` (todos scheduled, nenhum iniciado)
- Alertas de consumo anômalo por capacidade — projeto existe, implementação não tem cartão de construção ainda (os 2 cartões achados são de auditoria, não de build)
- 8 das 10 etapas de "agentes especializados" (IA-171/173/174/178/180 não implementadas; IA-172/175/176/179 parciais) — sem cartão de construção dedicado hoje, só o cartão de auditoria `t_38778cb9`

Sem plano e sem cartão (lacuna "solta"):
- `contacts.lead_score` e `contacts.risk_score` nunca calculados (sempre 0) apesar de aparecerem como filtro de segmentação no Talk X e serem lidos em `useContactCrm360.ts` — não achei nenhum cartão abrindo essa lacuna especificamente
- Infraestrutura `talkx-ai` sem consumidor no frontend — o cartão `t_4834e8b8` fechou a construção do backend, mas não existe cartão cobrando o lado do frontend que o chame
- 2 dos 6 cards de "IA Quick Access" no dashboard apontam para rota `/sentiment-alerts` inexistente

Fora do escopo deste repositório (não é lacuna do Zapp_Web_V2):
- "Mockup Generator"/geração de imagem por IA (Promo_Gifts_V4) — não encontrado no código; `promogifts-catalog` é só listagem de catálogo, sem IA
- "TALK ME" — confirmado que não é uma funcionalidade de IA (fila de atendimento aguardando); citá-lo como "IA" seria um erro de nomenclatura visual, não um gap de produto

---

## As 2-3 mais preocupantes

1. **`lead_score`/`risk_score` do Talk X são decorativos.** O usuário final vê "Lead score" e "Risco de churn" como opção de segmentação para disparar campanhas, mas essas colunas nunca saem de `0` — nenhuma função do sistema as calcula. Qualquer campanha segmentada por esses campos hoje produz um filtro vazio ou aleatório (tudo empatado em 0), sem ninguém ter avisado isso em lugar nenhum do produto.
2. **Ingestão de documentos da base de IA já teve um buraco de segurança real, corrigido só na 2ª tentativa.** A 1ª entrega (fechada como "pronta") permitia qualquer usuário autenticado processar arquivo de terceiro e publicar artigo na base pública da IA, contornando a RLS — pego pelo revisor antes de integrar, não em produção, mas mostra que "cartão done" não é garantia de primeira tentativa seja segura.
3. **"Agentes especializados" (ações automáticas da IA, aprovação, especialistas por área) está 8 de 10 etapas não construído**, e o único cartão que passou por ele no kanban foi de auditoria ("confirme que a lacuna existe"), não de construção — se alguém olhar só o kanban e ver "SL-218 done", pode concluir erroneamente que esse bloco foi entregue.

Relatório completo: `docs/ia/AUDITORIA_FUNCIONALIDADES_IA_2026-10-10.md`.
