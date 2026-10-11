# Área 02 — Inteligência Artificial (IA) + Dashboard / Relatórios / KPIs

Varredura de leitura em `adm01-debug/Zapp_Web_V2`, HEAD `99aa53f` (main de 09–11/10/2026). Ponto de partida: reconciliação de 03/10 (baseline `2e7cf81`, `docs/reconciliation/evidence/assessment-telefonia_ia_dashboard.json.gz`) e inventário de 07/10 (`docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv`). Todo estado abaixo foi **re-verificado no código do HEAD** (os lotes de 04/10 a 09/10 — #1890, #1897, #1900, #1902, #1905, #1908, #1911 — mexeram muito nas duas áreas). Nada foi alterado no repositório, nenhum banco consultado.

Convenção de estado: **CONCLUÍDO** = código + teste presentes no HEAD (inclui "implementado aguardando prova de runtime/produção"); **PARCIAL** = parte da correção/capacidade pedida existe; **NAO_INICIADO** = a correção/capacidade pedida não começou (ainda que o componente afetado exista); **BLOQUEADO** = depende de dono/credencial/terceiro; **DIVERGENTE** = doc × código discordam (marcado também em §4); **NV** = não verificável/não verificado.

---

## 1. Fontes lidas

| Caminho | Tipo | Nº etapas/itens | Data | Vigente/substituído |
|---|---|---|---|---|
| `docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md` | plano | 200 etapas (20 blocos) | 29/09 | vigente |
| `docs/plans/Plano_IA_Zapp_Web_V2_200_Etapas.json` | plano (espelho JSON) | 200 (todas `planejada_nao_autorizada`) | 29/09 | vigente (espelho, sem status real) |
| `docs/ia/README.md` | status | blocos 01–05, 06 (IA-058), 18 | atualiz. 07–09/10 | vigente (parcialmente divergente) |
| `docs/ia/IA-001…IA-010` (11 arquivos) | spec/status | 10 etapas | 29/09–09/10 | vigente |
| `docs/ia/IA-003-registro-achados.md` | registro de achados | A1–A10, B1–B16 | 30/09 | vigente (não incorpora achados posteriores) |
| `docs/ia/IA-004-matriz-autorizacao.md` | spec | matriz + 13 lacunas L1–L13 | 09/10 | vigente |
| `docs/ia/IA-011-a-IA-020-contencao-P0.md` + `…-verificacao-adversarial.md` | status | 10 | 30/09 | vigente |
| `docs/ia/IA-021-a-IA-030-contratos-integridade.md` | status | 10 | 01/10 | vigente |
| `docs/ia/IA-031-a-IA-040-camada-de-provedores-e-capacidades.md` | status | 10 | 02/10 | vigente |
| `docs/ia/IA-041-a-IA-050-execucao-resiliente-filas-e-consumo.md` | status | 10 | 07/10 | vigente |
| `docs/ia/IA-171-a-IA-180-agentes-especializados.md` | status | 10 | 08/10 | vigente |
| `docs/audits/PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md` | spec (DESIGN_ONLY) | 1 | 03/10 | vigente |
| `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv` (linhas IA/Dashboard/Outros-IA) | inventário | ~130 linhas relevantes | 07/10 | parcialmente desatualizado |
| `docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md` | prompt/handoff | 4 tarefas (17 subitens) | s/d (antigo) | histórico, parcialmente executado |
| `docs/reconciliation/sources/Plano_Dashboard_100_Etapas_2026-09-30.md` | plano | 100 etapas (CR-01…CR-10) | 30/09 | **vigente** (linhagem oficial, citado em `docs/dashboard/README.md`) |
| `docs/design/PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md` | plano | 100 etapas / 13 CPs | 07/09 | executado (histórico) |
| `docs/design/REDESIGN_DASHBOARD_STATUS.md` | status | CP0–CP12 | 07/09 | desatualizado (CP12 aberto) |
| `docs/design/PLANO_REDESIGN_DASHBOARD_ABAS.md` | plano | 7 fases + CP8 | set/26 | executado |
| `docs/design/REDESIGN_DASHBOARD_ABAS_STATUS.md` | status | CP1–CP8 + resíduos | set/26 | desatualizado |
| `docs/design/MODULO_TAREFAS_QUADRO_DASHBOARD.md` (parte Dashboard) | spec/descrição | 14 riscos (§6) | 09/10 | vigente |
| `docs/plans/00_PROMPT_MESTRE_DASHBOARD_WIDE_24_FULLHD_ZAPP_WEB_V2 (1).md` | prompt mestre/contrato | 10 telas + QA global | 08/10 | vigente, não executado |
| `docs/dashboard/README.md` (+ `rls-snapshot-2026-09.sql`) | mapa de fontes/débitos | matriz + ~8 débitos | 06/10 | vigente |
| `docs/reconciliation/reports/modules/TELEFONIA_IA_DASHBOARD.md` | reconciliação | 400 (IA 200 + DASH 100) | 03/10 | substituído (baseline) |
| `docs/reconciliation/RECONCILIATION_WAVE_IA_DASHBOARD_2026-10-03.md` | reconciliação (ponteiro) | — | 03/10 | substituído |
| `docs/reconciliation/evidence/assessment-telefonia_ia_dashboard.json.gz` | ledger por tarefa | 400 | 03/10 | baseline |
| `docs/audits/AUDITORIA_A11Y_MOBILE_TAREFAS_QUADRO_DASH_2026-10-07.md` | auditoria a11y | 14 achados (12 tocam Dashboard) | 07/10 | vigente |
| Código IA: `supabase/functions/{ai-*,classify-*,chatbot-l1,elevenlabs-*,voice-*,talkx-ai,sentiment-alert,send-scheduled-report}`, `supabase/functions/_shared/ai-*.ts`, `media-egress.ts`, `src/components/{ai,inbox/ai-tools,inbox/chat,admin/SupervisorCopilot,admin/TrainingMode,settings/ai-providers}`, `src/hooks/{analytics,chat,voice,crm}` | código | — | HEAD | — |
| Código Dashboard: `src/components/dashboard/**`, `src/hooks/dashboard/**`, `src/hooks/analytics/**`, `src/hooks/sla/useSLAMetrics.ts`, `src/hooks/business/{useNPSSurveys,useDemandPrediction}.ts`, `src/components/reports/**`, migrations `*dashboard*`, `scheduled_report*` | código | — | HEAD | — |
| Testes: `tests/contracts/ai-*.ts`, `ia05x-*.ts`, `ai-quality-golden-set.contract.test.ts`, `scripts/db-audit/dashboard-rls-authorization.test.sh` | teste | — | HEAD | — |

---

## 2. Placar por plano

Critério: "concluído" = verificado no código do HEAD (código + teste), sem prova de produção; itens cujo defeito descrito no plano continua igual no código contam como NAO_INICIADO mesmo que o componente exista.

| Plano | Total | Concluído | Parcial | Não iniciado | Bloqueado | Não verificável |
|---|---|---|---|---|---|---|
| Plano IA 200 etapas (29/09) | 200 | 50 | 88 | 53 | 9 | 0 |
| Plano Dashboard 100 etapas (30/09, vigente) | 100 | 19 | 36 | 35 | 4 | 6 |
| Redesign Dashboard Navy 100 etapas | 100 | 97 | 2 | 0 | 0 | 1 (DIVERGENTE) |
| Redesign Dashboard Abas (7 fases + CP8) | 8 | 5 | 3 | 0 | 0 | 0 |
| Prompt Mestre Dashboard WIDE 24" (10 telas + QA) | 11 | 0 | 0 | 11 | 0 | 0 |
| Prompt Lovable — Painel de Inteligência Comercial | 4 | 1 | 1 | 2 (1 DIVERGENTE) | 0 | 0 |
| Registro de achados IA-003 (A1–A10, B1–B16) + lacunas IA-004 (L1–L13) | 39 | 23 | 6 | 5 | 2 | 3 |
| Resíduos/débitos do Dashboard (README, STATUS, inventário RES-*) | 12 | 3 | 3 | 3 | 2 | 1 |
| Auditoria A11Y Dashboard (Y16, 07/10) | 14 | 0 | 0 | 5 (confirmados abertos) | 0 | 9 |

Observações: (a) o registro IA-003/IA-004 se sobrepõe ao Plano IA (mesmo defeito contado em duas linhagens); (b) placar por bloco do Plano IA: B01 6C/3P/1B · B02 3C/5P/2B · B03 8C/2P · B04 10C · B05 8C/2P · B06 3C/6P/1NI · B07 8P/2NI · B08 6P/4NI · B09 4P/6NI · B10 3P/7NI · B11 2C/5P/2NI/1B · B12 4C/4P/2NI · B13 2C/7P/1NI · B14 1C/3P/6NI · B15 1C/7P/2NI · B16 1P/9NI · B17 1C/6P/3B · B18 1C/4P/5NI · B19 7P/3NI · B20 5P/3NI/2B.

---

## 3. Pendências detalhadas

### 3.1 Plano IA 200 etapas — itens pendentes

**Concluídos (não listados, 50):** IA-001, 003, 004, 005, 007, 008 · 011, 013 (dedupe por `audit_logs.dedupe_key`, `supabase/migrations/20261004190606_audit_logs_dedupe_key_webhook_elevenlabs.sql`), 014 · 022, 023, 024, 026–030 · 031–040 · 041 (prazo até o corpo: `_shared/ai-providers.ts:163` `comPrazoAteOCorpo`), 042, 043, 044, 046, 047, 048, 050 (`_shared/ai-circuit.ts`) · 051, 052, 056 · 104 (`chatbot-l1/index.ts:92,133` filtra por `whatsapp_connection_id`), 105 · 112, 114, 115, 116 (`src/components/ai/ChurnPredictionDashboard.tsx:171-205`, `AutoTicketClassifier.tsx:42-81`, `src/hooks/chat/useNextBestAction.ts:49-118`) · 129, 130 (`src/hooks/voice/voiceActionPlan.ts:47-151`, `src/components/layout/VoiceActionBridge.tsx`) · 131 (`classify-audio-meme/index.ts:181-215` + `20261006100606_ia131_audio_stt_openrouter.sql`) · 148 (`AIRewriteButton.tsx:33-59`, `AIEnhanceButton.tsx:43-91`) · 168 (`useTalkXInsights.ts:162,283-290`) · 177 (`src/components/admin/TrainingMode.tsx`).

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje (evidência) | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| IA-002 | Mapa completo dos fluxos de IA | PARCIAL | Cada botão → função → provedor → tabela → teste | `docs/ia/IA-002-*` (59 UI / 25 funções na ref. `0ab8409`); funções novas sem mapa (`ai-kb-ingest`, `talkx-ai`, `voice-copilot-action` com authz) | Refazer inventário no HEAD | Recurso pago sem dono/consumidor conhecido | P3 | — |
| IA-006 | Natureza do indicador visível na tela | PARCIAL | Distinguir IA, cálculo, manual, importado na UI | Doc IA-006 existe; UI ainda chama heurística de "probabilidade" (`ChurnPredictionDashboard.tsx:276`) e previsão de "95% de confiança" (`src/components/dashboard/DemandPrediction.tsx:75`) | Rotular origem/limite em cada card | Gestor decide com base em número que parece previsão estatística e não é | P2 | — |
| IA-009 | Kill switch (desligar IA no servidor) | PARCIAL | Flags por capacidade, bot e provedor, com desligamento imediato | `_shared/ai-feature-flags.ts:34-68` (10 capacidades, lido em `ai-guards.ts:17`/`ai-auth.ts:102`); sem chave `ai.provider.*`/`ai.bot.*` (`ai-feature-flags.ts:19-20`); sem tela (nenhum `ai.capability` em `src/`); caminho HMAC do `chatbot-l1` não passa pelo gate (`chatbot-l1/index.ts:27-34`); `classify-*`, `elevenlabs-*`, `ai-proxy`, `talkx-ai`, `sentiment-alert` fora do mapa | Chaves por provedor/bot, tela admin, cobrir webhook do bot e efeitos automáticos | Em incidente/custo alto não dá para desligar só um provedor ou o bot sem SQL; o bot automático não para | P1 | — |
| IA-010 | Ambiente de ensaio com dados sintéticos | BLOQUEADO | Dados por departamento + 4 perfis de teste | `scripts/ia/ensaio-provisionamento.mjs` (só DML de dados; nenhum usuário/papel) | Executar em banco autorizado e criar identidades | Nada de IA pode ser homologado sem tocar produção | P2 | Autorização do Joaquim (escrita em `auth`) |
| IA-012 | Identidades de serviço próprias | PARCIAL | Credencial por cron/webhook/worker com escopo mínimo | Cron de jobs usa `x-cron-secret`; transcrição automática chama `ai-transcribe-audio` com `SUPABASE_SERVICE_ROLE_KEY` (`_shared/evolution-webhook-messages.ts:726-747`) | Identidade por serviço com escopo/expiração | Vazamento da service role expõe tudo | P2 | — |
| IA-015 | Separar leitura de alteração (perfil só leitura) | BLOQUEADO | Perfil leitor que só recebe sugestões | `user_roles` com 3 papéis (achado B10) | Decidir/criar papel somente-leitura | Sem perfil auditor/consulta | P2 | Decisão do dono |
| IA-016 | Restringir destinos de rede | PARCIAL | Política de egress (HTTPS, DNS, redirect, rede privada) em toda chamada | `_shared/media-egress.ts` (mídia de webhook); adaptadores de IA fazem `fetch(params.endpoint)` sem política (`_shared/ai-providers.ts:157,201`) | Egress nos adaptadores de provedor | Config errada de provedor pode enviar dados/chave a host interno | P2 | — |
| IA-017 | Allowlist de segredos por provedor | PARCIAL | Só secrets aprovados vinculados ao destino | `requireSecret` lê qualquer `Deno.env` pelo nome cadastrado (`_shared/ai-generate.ts:483-489,565`) | Lista fechada nome↔destino | Admin pode, por erro, mandar segredo de infraestrutura a terceiro | P2 | — |
| IA-018 | Limite do CRM externo | BLOQUEADO | Parecer de grants das RPCs do CRM | Contrato documentado (`docs/crm-external-grants.md`) | Consulta ao responsável | — | P2 | Responsável do CRM externo |
| IA-019 | Minimizar dados enviados ao modelo | PARCIAL | Allowlist por finalidade, proteger notas internas, mascarar | `talkx-ai` remove telefone/e-mail (`talkx-ai/index.ts:13-15`); `ai-suggest-reply` injeta notas internas e campos customizados no prompt (`ai-suggest-reply/index.ts:95-113`); nenhum mascaramento de CPF/cartão | Allowlist + mascaramento por capacidade | Risco LGPD: nota interna/dado pessoal vai a provedor externo | P1 | — |
| IA-020 | Invalidar caches/acesso | PARCIAL | Limpar resultados ao trocar usuário/papel | `queryClient.clear()` no logout (`src/hooks/auth/useAuth.tsx:145`); chaves sem usuário (`useRecentAnalyses.ts:22`), nada ao perder papel | Revalidar na troca de papel | Dado de outra identidade pode reaparecer na sessão | P2 | — |
| IA-021 | Sentimento com o mesmo significado em todo lugar | PARCIAL | Vocabulário canônico em análise, contato, churn, alerta e CRM | Normalização em `useAIStats.ts:84-95`, `useRecentSentimentAlerts.ts:35-60`; `CRMAutoSync` manda ao CRM `positive/negative/neutral` por palavra-chave (`src/components/inbox/CRMAutoSync.tsx:29-44`) e `neutral` fixo (`:110`) | Sync do CRM usar a análise canônica | CRM recebe sentimento "chutado" por palavra-chave | P2 | — |
| IA-025 | Validar toda saída de modelo | PARCIAL | Schema por capacidade, inclusive classificadores/voz | `parseModelOutput` nas funções de texto; `classify-sticker/emoji` degradam para `outros` sem estado de falha (`classify-sticker/index.ts:143,154,183,211`) | Cobrir classificadores e voz | Classificação falha vira "Outros" como se fosse resultado | P2 | — |
| IA-045 | Operações longas em fila durável | PARCIAL | Jobs com lease/heartbeat para tarefas longas | `ai_jobs` + `ai-jobs-worker` existem; handler `ai.generate` desligado por flag (`ai-jobs-worker/index.ts:84,187`); ninguém enfileira geração (só `_shared/effect-reconcile.ts:200`) | Migrar análise/resumo longos para a fila e ligar a flag | Análise longa continua síncrona e falha em timeout | P2 | Flag `AI_JOBS_ENABLE_AI_GENERATE` |
| IA-049 | Registro de consumo nunca perdido | PARCIAL (DIVERGENTE) | Outbox durável para ledger de uso | Código grava em `ai_usage_outbox`/`outbox_events` (`_shared/ai-usage.ts:453,675`) mas **as tabelas não existem** (ausentes em `supabase/migrations`, `schema-catalog.json`, `types.ts`); `reprocessarLogEssencial` (`ai-usage.ts:516`) sem chamador | DDL das 2 tabelas, cron reprocessador, secret `AI_OUTBOX_HMAC_SECRET` | Consumo pago pode sumir do relatório quando a gravação falha | P1 | DDL no lote do dia + secret |
| IA-053 | Contabilizar streaming e cancelamentos | PARCIAL | Uso registrado em stream parcial/cancelado | `medirStream` (`ai-usage.ts:963`), contrato `tests/contracts/ia053-streaming-registrado.test.ts` | Reconciliar cancelamento real com cobrança | Custo de stream interrompido subestimado | P2 | — |
| IA-054 | Quota por ação (não por linha de log) | PARCIAL | Separar ação, tentativa e cobrança na quota | `contaParaQuota` existe (`ai-usage.ts:1077`) mas a guarda conta linhas de `ai_usage_logs` e falha aberta em erro (`_shared/ai-guards.ts:224-245`) | Usar a regra na guarda; decidir fail-open | Tentativas/fallback queimam a cota do usuário; erro de infra libera gasto | P1 | — |
| IA-055 | Tarifas versionadas e custo conciliado | PARCIAL | Preço por vigência + conferência com extrato | `ai_model_prices`, `ai_usage_cost_summary` (`20261003082707`, `…102707`) | Conciliação com extrato do provedor | Custo exibido é estimativa | P2 | Extrato do provedor |
| IA-057 | Indicadores de saúde dos provedores | PARCIAL | p50/p95, erros, disponibilidade e recuperação por provedor | `AIProviderHealthPanel.tsx:28,66,87-88` (p50/p95 sobre amostra de 50 chamadas/24 h) | Visão por provedor e por fallback, amostra completa | Saúde do provedor estimada por amostra pequena | P3 | — |
| IA-058 | Alerta de consumo anômalo | PARCIAL (só projeto) | Alerta deduplicado + bloqueio por capacidade | Só `docs/audits/PROJETO_IA058_*` e `tests/contracts/ia058-design-only.contract.test.ts`; zero código | Implementar sinais, incidente e bloqueio | Gasto descontrolado só aparece na fatura | P1 | — |
| IA-059 | Retirar dado sensível dos logs | PARCIAL | Redigir tokens, prompts, trechos de conversa | `tests/contracts/log-injection-sanitizacao.contract.test.ts` (só injeção); nenhuma redação de PII/CPF em `_shared/ai-*`/`ai-proxy` | Redação + retenção + captura excepcional | Risco LGPD em telemetria | P1 | — |
| IA-060 | Medir utilidade da IA | NAO_INICIADO | Aceitação, edição, retrabalho, tempo de resposta | Nada (sem registro de uso/descarte de sugestão) | Telemetria de aceitação + painel | Não se sabe se a IA ajuda ou atrapalha | P2 | — |
| IA-061 | Resumo × análise aprofundada unificados | PARCIAL | Mesmo contexto/contrato/persistência | `_shared/ai-conversation-pipeline.ts` comum | Alinhar semântica/UX dos dois modos | Resultados diferentes para o mesmo pedido | P3 | — |
| IA-062 | Buscar histórico do período no servidor | NAO_INICIADO | Mensagens do período resolvidas no servidor com paginação | `AIConversationAssistant` filtra o array já carregado no chat; schema recebe mensagens do cliente (`_shared/schemas.ts:121`) | Busca server-side por período | Análise "dos últimos 30 dias" só vê o que está na tela | P1 | — |
| IA-063 | Conversas > 200 mensagens | PARCIAL | Lotes/seleção explícita e consolidação | Schema recusa > 200 (`_shared/schemas.ts:34,121`) | Processar em lotes | Conversa longa não é analisada | P2 | IA-062 |
| IA-064 | Datas e sessões padronizadas | PARCIAL | Fuso, limites de dia, sessão | `created_at` preservado; filtro de período local | Contrato único de fuso/sessão | Rótulos de período incoerentes na virada do dia | P3 | — |
| IA-065 | Delimitar contexto profissional | PARCIAL | Departamento/papel/canal na análise | Prompt recebe nome/regras gerais | Separar assuntos por área | Compras e vendas do mesmo contato se misturam | P2 | — |
| IA-066 | Métricas de tempo calculadas por código | NAO_INICIADO | Espera/resposta/duração por timestamps | Prompt pede ao modelo "considerar tempo de resposta" (`ai-conversation-analysis/index.ts:124`); nenhum cálculo | Calcular no servidor e passar ao modelo | Tempo de resposta "inventado" pelo modelo | P1 | — |
| IA-067 | Conclusões ligadas às mensagens | PARCIAL | Evidência por conclusão com ID de mensagem | Envelope tem campo `evidence` (`_shared/ai-response-contracts.ts:225-257`), sem IDs verificados | Exigir e validar citações | Atendente não confere de onde veio a conclusão | P2 | — |
| IA-068 | Estimativa × medida | PARCIAL | CSAT respondido separado de estimado | Zero/ausência preservados (IA-023) | Rotular estimado em todas as telas | Satisfação estimada confundida com CSAT real | P2 | — |
| IA-069 | Histórico sem nova geração | PARCIAL | Abrir/filtrar/comparar análises antigas sem pagar | `src/components/inbox/ai-tools/HistoryTab.tsx` | Acesso independente do botão gerar; comparar | Paga-se de novo para ver o que já existe | P3 | — |
| IA-070 | Detectar análise desatualizada | PARCIAL | Fingerprint e rótulo "desatualizada" | Versão de contexto atômica na gravação (`20261006160117_ai_context_version_atomic_persist.sql`) | Fingerprint + rótulo na UI | Análise velha parece atual | P2 | — |
| IA-071 | Modos de tom harmonizados | PARCIAL | Taxonomia única de tom/concisão | Chips SL-063 em `AISuggestions.tsx:12-24`; `ToneSelector`/`AIRewriteButton` com modos próprios | Taxonomia compartilhada | "Mais formal" significa coisas diferentes por botão | P3 | — |
| IA-072 | Comparar original × reescrita | PARCIAL | Diff, versão anterior e desfazer | Desfazer só no Enhance (`AIEnhanceButton.tsx:47,83`); Rewrite sem desfazer; sem diff | Diff + desfazer em todos | Atendente perde o texto original | P2 | — |
| IA-073 | Proteger números/condições | NAO_INICIADO | Preço/quantidade/data preservados na reescrita | Nada | Verificador de invariantes | IA pode alterar preço/prazo numa reescrita | P1 | — |
| IA-074 | Conferir promessas antes de sugerir | NAO_INICIADO | Checar estoque/entrega/desconto | Nada | Verificador contra fontes | Sugestão promete o que a empresa não confirmou | P1 | IA-081 |
| IA-075 | Conhecimento relevante nas sugestões | NAO_INICIADO | Busca por relevância em vez dos primeiros artigos | `ai-suggest-reply/index.ts:65-68` pega 10 artigos publicados sem relevância | Usar `search_knowledge_base` | Sugestão ignora o artigo certo | P1 | — |
| IA-076 | Seleção de contexto transparente | PARCIAL | Mostrar mensagens enviadas ao modelo | Seleção em UniversityHelp/ObjectionDetector | Exibir total/filtros/limite | Usuário não sabe o que a IA leu | P3 | — |
| IA-077 | Objeções no diálogo completo | PARCIAL | Considerar ambas as partes e ordem | Recorte de mensagens + gate de contexto | Diálogo integral | Objeção já resolvida reaparece | P2 | IA-062 |
| IA-078 | Evidência da objeção | NAO_INICIADO | Vincular objeção às mensagens + feedback | Chip de "severidade" derivado só da confiança (`ObjectionDetector.tsx:44-64`) | Citação + contestação | Severidade sem base real | P3 | — |
| IA-079 | Erros silenciosos das ferramentas | PARCIAL | Erro não vira "nenhuma objeção" | Correções pontuais (AIAutoTagsConfig, AIProviderHealthPanel) | Revisar cada ferramenta | Falha parece "nada encontrado" | P2 | — |
| IA-080 | Gerar → usar → aprovar → enviar | PARCIAL | Transições formais até o envio | Inserção de sugestão separada do envio | Trilha única e confirmação do pipeline | Sem rastreio do que a IA enviou | P2 | — |
| IA-081 | Recuperação de conhecimento compartilhada | PARCIAL | Camada única com permissões | `chatbot-l1` usa RPC; `ai-suggest-reply` monta própria | Camada única | Regras de acesso diferentes por ferramenta | P2 | — |
| IA-082 | Documentos com versão e validade | NAO_INICIADO | Dono, versão, vigência, aprovação | `knowledge_base_articles` só tem title/content/category/tags/is_published (schema-catalog) | Colunas + fluxo de aprovação | Política vencida responde cliente | P2 | — |
| IA-083 | Ingestão rastreável | PARCIAL | Extração, trechos, hash, origem | `_shared/ai-kb-ingest.ts` + `ai-kb-ingest` (só formatos texto; PDF/DOCX ficam `unsupported`, `ai-kb-ingest.ts:17,30`); sem hash/trechos | PDF/DOCX, hash, versões | Manuais em PDF não viram conhecimento | P1 | — |
| IA-084 | Melhorar busca textual | NAO_INICIADO | PT-BR, siglas, SKU | `search_knowledge_base` inalterada | Ajuste + conjunto de consultas | Busca erra códigos e siglas | P2 | — |
| IA-085 | Avaliar busca vetorial | NAO_INICIADO | Benchmark embeddings × textual | Sem pgvector; coluna `embedding_status` sem uso | Benchmark | — | P3 | — |
| IA-086 | Recuperação híbrida + reordenação | NAO_INICIADO | Só se justificada por testes | Nada | — | — | P3 | IA-085 |
| IA-087 | Validar citações | NAO_INICIADO | IDs/versões verificáveis | Chatbot só injeta título/conteúdo | Validador | Citação inventada aceita | P2 | IA-082 |
| IA-088 | Políticas conflitantes | NAO_INICIADO | Precedência por vigência/área | Nada | Regra executável | Resposta com regra antiga | P3 | IA-082 |
| IA-089 | Abster-se sem fundamento | PARCIAL | Distinguir ausência de dado e falha | Chatbot cai em 5 artigos sem relevância (`chatbot-l1/index.ts:115-116`); transfere por baixa confiança (`:259-263`) | Abstenção explícita | Resposta factual fabricada | P1 | — |
| IA-090 | Revogar fontes em todas as camadas | PARCIAL | Exclusão propagada a caches/memória | `is_published` filtra fallback | Propagação | Conteúdo revogado reaparece | P2 | — |
| IA-091 | Memória humana preservada com origem | PARCIAL | Autoria e separação fato/hipótese | Identidade da memória corrigida (IA-029); `conversation_memory` sem campo de origem | Origem por item | IA sobrescreve nota humana | P2 | — |
| IA-092 | Extrair fatos como propostas | NAO_INICIADO | Sugestões estruturadas revisáveis | Nada | — | — | P2 | — |
| IA-093 | Registro de compromissos | PARCIAL | Quem prometeu, prazo, situação | `promises_made`/`pending_items` jsonb soltos | Estrutura com dono e vencimento | Promessas ao cliente se perdem | P1 | — |
| IA-094 | Compromisso aprovado → tarefa | NAO_INICIADO | Rascunho de tarefa deduplicado | `conversation_tasks.client_task_id` (IA-047) existe, sem ligação | Fluxo | Follow-up manual | P2 | IA-093 |
| IA-095 | Detectar contradições | NAO_INICIADO | Divergência de prazo/preço | Nada | — | — | P3 | — |
| IA-096 | Memória por atendimento/assunto | NAO_INICIADO | Episódios separados | Memória só por `contact_id` | Segmentação | Problema antigo contamina conversa nova | P2 | — |
| IA-097 | Validade temporal da memória | NAO_INICIADO | Vigência e correção | Nada | — | Condição revogada persiste | P3 | — |
| IA-098 | Resolver identidades com cautela | PARCIAL | Ambiguidade explícita | Normalizações no contrato CRM | Tratamento de ambiguidade | Históricos fundidos indevidamente | P2 | — |
| IA-099 | Preferências autorizadas | NAO_INICIADO | Canal/horário/tratamento | Nada | — | — | P3 | — |
| IA-100 | Passagem de atendimento com evidências | NAO_INICIADO | Briefing automático na transferência | `HandoffDialog` só tem comentário livre (`src/components/inbox/collaboration/HandoffDialog.tsx:17`) | Gerar briefing na transferência | Novo atendente começa sem contexto | P1 | IA-093 |
| IA-101 | Governar etiquetas | PARCIAL | Catálogo versionado e protegido | RPC atômica preserva humanas (IA-028) | Catálogo/alias/revisão | IA cria etiqueta arbitrária | P2 | — |
| IA-102 | Roteamento determinístico | PARCIAL | Política de fila validada | Campos de fila/prioridade | Política única + simulação | IA pode mudar fila fora da regra | P2 | — |
| IA-103 | Escalonamento e retorno | NAO_INICIADO | Motivos, limites, ciclo | Nada | — | Conversa urgente sem destino | P2 | — |
| IA-106 | Contexto correto para o bot | PARCIAL | Histórico autorizado ordenado | Últimas 15 mensagens por conexão (`chatbot-l1/index.ts:133`) | Evidências verificáveis | — | P3 | — |
| IA-107 | Transferência real para humano | PARCIAL | Confirmar fila/atendente/ownership | Só devolve `transfer_to_human` (`chatbot-l1/index.ts:259-287`); nada no repo executa a transferência nem chama o bot no fluxo de entrada (nenhum chamador em `evolution-webhook`) | Executar transferência no pipeline | Bot diz que transferiu e ninguém assume | P1 | Chamador externo do bot (HMAC) não versionado |
| IA-108 | Disputa bot × atendente | NAO_INICIADO | Pausa do bot após intervenção humana | Nada | Lease de posse | Bot responde conversa já assumida | P1 | — |
| IA-109 | Evitar loops | PARCIAL | Filtrar ecos/duplicatas | Rate limit por IP (`chatbot-l1/index.ts:39`) | Dedupe de entrada | Ciclos de resposta automática | P2 | — |
| IA-110 | Homologar bot sem envio | BLOQUEADO | Modo observação por conexão | Nada | Ensaio sombra | Bot ligado sem prova de qualidade | P1 | Ambiente IA-010 + quem chama o bot |
| IA-111 | Inatividade real | PARCIAL | Última interação real, não `updated_at` | Servidor usa mensagens; cálculo local inicial ainda usa `contacts.updated_at` e 500 contatos (`ChurnPredictionDashboard.tsx:60-68`) | Mesma fonte no cliente | Editar cadastro "zera" o risco | P2 | — |
| IA-113 | Score × probabilidade | NAO_INICIADO | Chamar de índice o que não é calibrado | Tela diz "maior probabilidade de churn" (`ChurnPredictionDashboard.tsx:276`) | Renomear + documentar método | Falsa precisão em decisão comercial | P2 | — |
| IA-117 | Supervisor com métricas reais | PARCIAL | Backlog, espera, SLA no contexto | Contexto declara "Não medido: SLA, backlog…" (`src/components/admin/SupervisorCopilot.tsx:46-55`) mas a tela sugere justamente essas perguntas (`:17-18`) | Alimentar com métricas reais | Copiloto responde "não disponível" às perguntas que ele mesmo sugere | P1 | — |
| IA-118 | Períodos gerenciais uniformes | PARCIAL | Hoje/24h/expediente coerentes | Supervisor declara período; dashboard usa outros | Contrato único | Números diferentes entre copiloto e painel | P2 | — |
| IA-119 | Inteligência importada do CRM rotulada | PARCIAL | Origem/validade do briefing/DISC | Tooltip do ChatHeader sem rótulo de origem | Rótulo "importado do CRM" + validade | Dado do CRM parece inferência do ZAPP | P3 | — |
| IA-120 | Simulador de capacidade | NAO_INICIADO | Cenários com premissas explícitas | Só previsão heurística (capacidade fixa 35, `useDemandPrediction.ts:52`) | Simulador | Gestor sem ferramenta de dimensionamento | P3 | — |
| IA-121 | Contrato único de transcrição | PARCIAL | Idiomas/formatos/erros alinhados | Autenticação e objeto ok | Contrato por formato | — | P3 | — |
| IA-122 | Limites de áudio | PARCIAL | MIME, tamanho, duração | 5 MiB inline (`_shared/ai-audio-input.ts:38`), 25 MiB STT | Duração/canais | Áudio abusivo consome provedor | P2 | — |
| IA-123 | Transcrição revisável | NAO_INICIADO | Original + correções + timestamps | Só coluna `transcription` | Versões/correção | Erro de transcrição sem correção | P3 | — |
| IA-124 | Transcrição automática controlada | PARCIAL | Dedupe, orçamento por serviço | Webhook marca `processing` e retranscreve sem checar se já existe (`evolution-webhook-messages.ts:726-747`) | Dedupe + orçamento | Reentrega do webhook paga duas vezes | P2 | — |
| IA-125 | Reprodução/streaming de áudio | PARCIAL | Cancelamento e limpeza | `useTextToSpeech` com teste de ciclo de vida | Streaming progressivo homologado | — | P3 | — |
| IA-126 | Confirmação de áudio enviado | PARCIAL | Separar gerado/aceito/entregue | `TextToAudioButton.tsx:120-124` mostra "Áudio enviado!" após aceite, não entrega | Estado de entrega | Falso "enviado" | P2 | — |
| IA-127 | Governança de vozes | PARCIAL | Vozes autorizadas, dono, revogação | Criação exige admin/supervisor (`elevenlabs-voice-design/index.ts:76-86`); `voice_id` livre em TTS/STS (`_shared/schemas.ts:169`) | Allowlist de vozes | Uso de voz clonada não autorizada | P1 | — |
| IA-128 | Diálogos/STS/efeitos/música | PARCIAL | Contratos reais e custo antes de gerar | Rate limit + ledger em `elevenlabs-*` | Custo prévio e matriz | — | P3 | — |
| IA-132 | Categoria × falha técnica | PARCIAL | Estados distintos de falha | Áudio-meme devolve `degraded` (`classify-audio-meme/index.ts:111`); sticker/emoji devolvem `outros` | Estado de falha nos 3 | Biblioteca "Outros" cheia de falhas | P3 | — |
| IA-133 | Ingestão segura de anexos | PARCIAL | Tipo/tamanho/conteúdo ativo | `ai-image-input.ts`/`ai-audio-input.ts` com bucket permitido | Pipeline geral de anexos | — | P2 | — |
| IA-134…138 | Documentos comerciais, OCR, produto por imagem, arte × briefing, anexos × negociação | NAO_INICIADO | Extrações revisáveis com evidência | Nada no repo | Tudo | Sem apoio a cotações/pedidos/arte | P3 | Fontes autorizadas (catálogo/pedidos) |
| IA-139 | Anexos no contexto da análise | PARCIAL | Incluir transcrições/extrações | `MessageSchema` preserva type/mediaUrl | Conteúdo extraído no contexto | Resumo ignora áudio/PDF | P2 | — |
| IA-140 | Busca semântica de mídias | NAO_INICIADO | Busca por significado | Nada (sem pgvector) | — | — | P3 | — |
| IA-141 | Experiência de IA unificada | PARCIAL | Pontos de entrada coerentes | ToolPanel/AnalysisTabs parciais | Unificação | Mesma função com nomes/estados diferentes | P3 | — |
| IA-142 | Origem de cada informação | PARCIAL | Gerado/calculado/manual/importado | Envelope com origem; UI não exibe | Badge de origem | — | P2 | — |
| IA-143 | Abrir evidência sem perder a conversa | NAO_INICIADO | Painel de fontes lateral | Nada | — | — | P3 | IA-067 |
| IA-144/145/146/147 | Painel × modal, teclado, estados visuais, legibilidade | PARCIAL | A11y e estados padronizados | Estados de job padronizados; auditoria A11Y aponta botões sem nome | Correções de a11y | Uso por teclado/leitor de tela falha | P2 | — |
| IA-149 | Separar administração e operação | PARCIAL | Config de modelos só a perfis autorizados | `ai_providers` admin-only | Matriz de teste de papéis | — | P2 | — |
| IA-150 | Preferências de formato por usuário | NAO_INICIADO | Profundidade/formato/áudio | Nada | — | — | P3 | — |
| IA-151 | Conversa → briefing comercial | NAO_INICIADO | Finalidade, público, quantidade, orçamento | Nada | — | Vendedor monta briefing à mão | P2 | — |
| IA-152 | Recomendar produtos com restrições reais | PARCIAL | Quantidade mínima, estoque, técnica, prazo | Filtra estoque > 0 (`src/hooks/chat/useRecommendedProducts.ts:52-58`) | Preço, prazo, quantidade mínima | Recomenda produto inviável | P2 | Catálogo PromoGifts |
| IA-153…160 | Preço/margem, cotações de fornecedor, prazo, bloqueios do pedido, versões de arte, logística, financeiro, assistência interna por área | NAO_INICIADO | Copilotos operacionais Promo Brindes | Nada no repo | Tudo | Sem copilotos de operação | P3 | Fontes e integrações autorizadas |
| IA-161 | Rascunho de campanha por IA | BLOQUEADO | Gerar rascunho no editor | Edge `talkx-ai` (`supabase/functions/talkx-ai/index.ts:1-28`) sem tabela `talkx_ai_requests` (ausente em migrations/types) e sem consumidor em `src/` | DDL + chaves `talkx_settings` + UI | Recurso existe só no backend, inoperante | P2 | DDL da "trilha de banco" do TalkX |
| IA-162 | Público em linguagem natural → filtro | BLOQUEADO | Filtros tipados | `talkx-ai` kind `segment_suggestion` | Mesmo que IA-161 | — | P3 | idem |
| IA-163 | Personalização por destinatário | PARCIAL | Validar variáveis | `talkx-ai` rejeita variação que perde `{{nome}}` | Validação por destinatário | — | P3 | — |
| IA-164 | Variações controladas | BLOQUEADO | Variações com fatos bloqueados | `talkx-ai` kind `message_variation` | Mesmo que IA-161 | — | P3 | idem |
| IA-165/166 | Elegibilidade e estimativa de lote | PARCIAL | Revalidar e estimar custo antes de gerar | Motor de elegibilidade TalkX; teto mensal no `talkx-ai` | Estimativa de lote | — | P3 | — |
| IA-167 | Recomendação de horário sustentada | PARCIAL | Amostra e fuso corretos | Fuso corrigido; amostra limitada a 2.000 (`useTalkXInsights.ts:50`) | Amostra completa / abstenção | — | P3 | — |
| IA-169/170 | A/B controlado e explicação pós-campanha | PARCIAL (NV a fundo) | Experimento com amostra/janela | Variantes do TalkX e insights heurísticos | Controle estatístico | — | P3 | — |
| IA-171, 173, 174, 178, 180 | Catálogo de ferramentas, aprovação vinculada, especialistas por área, multiagente, caixa de propostas | NAO_INICIADO | Camada de agentes supervisionados | Nada (`docs/ia/IA-171-a-IA-180-agentes-especializados.md`) | Construir camada | — | P3 | Autorização do dono p/ efeitos |
| IA-172, 175, 176, 179 | Executor determinístico, verificação antes de agir, risco proativo, briefing periódico | PARCIAL | Ações supervisionadas e briefing agendado | Guardas da chamada de modelo; `useNextBestAction` sob demanda; SupervisorCopilot sob demanda | Executor + job periódico | Sem alerta proativo de promessa vencendo | P2 | — |
| IA-181/182/183/185 | Testes reais, contratos de provedor, isolamento, concorrência | PARCIAL | Matriz completa | Muitos contratos em `tests/contracts/ai-*.ts` | Completar matriz | — | P2 | — |
| IA-184 | Testes de injeção de prompt | NAO_INICIADO | Corpus adversarial | Nenhum teste de prompt injection | Corpus | Mensagem maliciosa pode manipular a IA | P1 | — |
| IA-186 | E2E do percurso de IA | NAO_INICIADO | Gerar→aplicar→enviar→histórico | Nenhum spec de IA em `e2e/` | Specs | Regressão de IA só aparece em produção | P2 | IA-010 |
| IA-187 | Avaliar voz/multimodal | PARCIAL | Amostras com referência humana | `scripts/qa/prova-visao-classificadores.mjs` | Avaliação humana | — | P3 | — |
| IA-188 | Conjunto de avaliação PT-BR (200 casos) | PARCIAL | ≥ 200 casos revisados por pessoa | Golden set inicial anotado por agente (`tests/contracts/ai-quality-golden-set.contract.test.ts`, 7 casos de teste) | 200 casos humanos | Meta M4 (≥95% factual) impossível de medir | P2 | Revisão humana |
| IA-189 | Ensaio de carga e orçamento | PARCIAL | Volumes acima dos limites | `scripts/qa/prova-orcamento-rate-limit.sh` (prova pontual) | Ensaio completo | Metas M8/M9 sem medida | P2 | — |
| IA-190 | Decisão técnica de liberação | NAO_INICIADO | Liberar/bloquear por capacidade | Nada | — | — | P2 | Bloco 19 |
| IA-191 | Topologia real confirmada | BLOQUEADO | Comparar deploy × código | — | Acesso aos ambientes | — | P2 | Joaquim |
| IA-193 | Integrações reais com escopo mínimo | BLOQUEADO | Contas de teste | — | — | — | P2 | Autorização + contas |
| IA-192, 196–199 | Homologar migrations, coortes, rollback, docs, evidências | PARCIAL | Rollout controlado | Flags (IA-009 parcial), replay de migrations, docs IA | Coortes e ensaio de rollback | — | P2 | — |
| IA-194, 195, 200 | Modo observação, piloto, encerramento | NAO_INICIADO | Observar antes de automatizar | Nada | — | — | P2 | IA-190 |

### 3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)

Concluídos (23): A1, A3, A4, A6, A7, A8, A9, A10, B1, B2, B3 (`elevenlabs-voice-design/index.ts:76-86`), B5 (`ai-proxy/index.ts:20-22,56-61`), B7, B11, B12, B16 (`elevenlabs-webhook/index.ts:116-139`), L1, L2, L3 (`20260930100000_harden_conversation_analyses_insert_policy.sql:38-44`), L4 (`voice-copilot-action/index.ts:141-151`), L5, L8, L13.

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| A2 | Normalização de sentimento | PARCIAL | Uma só convenção | Ver IA-021 (`CRMAutoSync.tsx:29-44`) | Sync CRM canônico | CRM com sentimento inconsistente | P2 | — |
| A5 | Fontes gerenciais do supervisor | PARCIAL | Métricas reais | Ver IA-117 | — | — | P1 | — |
| B4 | Allowlist de vozes/modelos TTS | NAO_INICIADO | Lista fechada | `voice_id` livre (`_shared/schemas.ts:155,169`) | Allowlist | Voz/modelo caro escolhido pelo navegador | P1 | — |
| B6 | Toda chamada paga no ledger | PARCIAL | Ledger em todas as funções | `elevenlabs-*` agora registram; `voice-changer` não (`voice-changer/index.ts` sem `logAiUsage`) | Ledger no voice-changer + teste que obrigue | Custo de troca de voz invisível | P2 | — |
| B8 | Kill switch no servidor | PARCIAL | Flags lidas no servidor | Ver IA-009 | — | — | P1 | — |
| B9 | Cálculo local não consome cota de IA | PARCIAL | Churn/classificação fora da quota | `registrarAcaoCalculada` grava linha que conta na quota de 500/dia (`_shared/ai-usage.ts:1211`; `ai-guards.ts:229-240`) | Excluir ações calculadas da quota | Usuário perde cota de IA real com cálculo local | P3 | — |
| B10 | Perfil somente-leitura | BLOQUEADO | Papel leitor | 3 papéis | Decisão | — | P2 | Dono |
| B13 | `ai-auto-tag/auth_test.ts` no CI | NAO_INICIADO | Rodar no CI | Nenhuma referência em `.github/workflows/ci.yml` | Incluir no CI | Teste de autorização não protege nada | P3 | — |
| B14 | Cota realmente atômica e fechada | PARCIAL | Sem fail-open | Contador compartilhado ok; quota diária falha aberta (`ai-guards.ts:236-244`) | Decisão fail-closed | Erro de banco libera gasto | P2 | — |
| B15 | RLS de `messages` × ciclo de vida; bucket `audio-memes` público | NAO_INICIADO | Filtrar apagadas; bucket privado | Bucket criado público (`20260511233306_*.sql:4`); nenhuma migration posterior altera | Bucket privado + filtro | Áudio de mensagem apagada acessível | P2 | — |
| L6 | Webhook Evolution sem assinatura | BLOQUEADO | strictMode | `evolution-webhook/index.ts:33-35,127` (GO não assina) | — | — | P2 | Fornecedor Evolution GO |
| L9 | `hasPermission` no servidor | NAO_INICIADO (inventário 07/10, não reverificado a fundo) | Policy server | `src/hooks/system/usePermissions.ts` client-side | RPC/policy | — | P2 | — |
| L11 | `departments.whatsapp_api_key` em texto puro | NAO_INICIADO (inventário 07/10) | Vault | — | Vault | — | P2 | — |
| L7, L10, L12 | Conexão por fila; tab counts p/ service_role; bypass service key | NV | — | Não reverificado | — | — | P3 | — |

### 3.3 Prompt Lovable — Painel de Inteligência Comercial

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| T1 | Painel "Inteligência Comercial" (briefing, DISC, gatilhos, rapport, horários, churn) | NAO_INICIADO (DIVERGENTE) | Accordion no ContactDetails, polido | `src/components/inbox/contact-details/ContactIntelligencePanel.tsx` existe mas **não é importado em lugar nenhum** | Montar no painel do contato | Vendedor não vê DISC/rapport/melhores horários já pagos no CRM | P2 | Flag `crm.integration` |
| T3 | Botão Sync CRM com "último sync"/"Sem CRM" | PARCIAL | Toast com score, badge de último sync, estado "Sem CRM" | Menu "Sincronizar CRM" com toast de score (`ContactActionButtons.tsx:30-55`); `CRMSyncButton` com `lastSyncTime` está órfão (`CRMAutoSync.tsx:95-130`); sem CRM o botão some | Usar o botão com badge; estado "Sem CRM" | — | P3 | — |
| T4 | Sentimento na lista de conversas/header em tempo real | NAO_INICIADO | Emoji na lista, cor no header | Nada em `src/components/inbox/conversation-list` | Implementar | — | P3 | — |

(T2 — tooltip de briefing com ícone Brain, 320 px, borda de risco — CONCLUÍDO em `src/components/inbox/chat/ChatHeader.tsx:54-83`.)

### 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

Concluídos (19, não listados): DASH-003, 011, 015, 037, 041, 042, 044, 045, 046, 048, 050, 052 (`src/hooks/sla/useSLAMetrics.ts:21,38`), 065, 066, 071, 072 (`src/hooks/analytics/useRecentAnalyses.ts`), 091, 092, 096 (`scripts/db-audit/dashboard-rls-authorization.test.sh`, no CI em `.github/workflows/db-guard.yml:327`). A regressão SQL de `dashboard_contact_counts` apontada em 03/10 foi corrigida por `supabase/migrations/20261006064630_dashboard_contact_counts_restaura_trava_e33.sql`.

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| DASH-001 | Versão publicada identificada | PARCIAL | Commit × versão em produção | Só baseline de auditoria | Confirmar deploy | — | P3 | Acesso Vercel |
| DASH-002 | Mapa de dependências atual | PARCIAL | Mapa navegável de cards/hooks/RPCs | `docs/dashboard/README.md` (não cobre aba IA nova, relatórios órfãos) | Atualizar | — | P3 | — |
| DASH-004 | Comparar repositório × banco | BLOQUEADO | Leitura só-SELECT das definições vivas | Catálogo/manifesto | Leitura de produção | — | P2 | Acesso de leitura |
| DASH-005 | Identidades documentadas | PARCIAL | auth.uid × profiles.id explícitos | RPC usa `get_profile_id_for_user` (`20261006064630_*.sql:52-55,88`) | Documento de identidades | — | P3 | — |
| DASH-006 | Dicionário de indicadores | NAO_INICIADO | Unidade, numerador, denominador por KPI | Nada | Dicionário | Cada tela calcula "atendimento" de um jeito | P1 | — |
| DASH-007 | Matriz de acesso aprovada | PARCIAL | Incluir special_agent e perda de papel | Matriz no README | Aprovação + perda de papel | — | P2 | Dono |
| DASH-008 | Períodos padronizados (São Paulo) | PARCIAL | Mesmo fuso em front/SQL/relatório | RPC com fuso SP; hooks usam relógio local (`useAIStats.ts:66-68`, `useSLAMetrics.ts:59-66`) | Fuso único | Contagem "hoje" difere conforme o navegador | P2 | — |
| DASH-009 | Contrato analítico versionado | PARCIAL | Respostas tipadas com amostra/escopo | Casts temporários (`useDashboardKpi.ts:78`, `useDashboardStats.ts:63`, `useLeaderboard.ts:62`) | Tipos/envelope | — | P3 | — |
| DASH-010 | Conjunto de aceitação | PARCIAL | Cenários de transferência/reabertura/fila vazia | Fixtures de 1.200 contatos no teste RLS | Cenários de transferência/reabertura | — | P2 | — |
| DASH-012 | Controle no servidor das abas gerenciais | PARCIAL | Endpoint nega não-staff | RPCs com guarda; leituras diretas por RLS | Matriz completa | — | P2 | — |
| DASH-013 | Escopo de fila do agente | PARCIAL | Agente vê pendências não atribuídas das suas filas | RPC filtra `c.assigned_to = e.agent` (`20261006064630_*.sql:57`) e depois conta `assigned_to IS NULL` → "pendentes" do agente é sempre 0 | Separar escopo de fila do pessoal | Agente não vê fila esperando | P1 | — |
| DASH-014 | Histórico por autoria × RLS | NAO_INICIADO | Atribuição histórica sem vazar | Nada | — | — | P2 | DASH-022 |
| DASH-016 | Revalidar aba ao perder papel | PARCIAL | Aba vedada não fica aberta | `goToTab` bloqueia clique; `Tabs onValueChange={setTab}` mantém estado (`DashboardView.tsx`) | Reset ao mudar papel | — | P3 | — |
| DASH-017 | Isolar caches | PARCIAL | Chaves por usuário/papel | `queryClient.clear()` no logout; chaves sem usuário (`useScheduledReportConfigs.ts:22`, `useRecentAnalyses.ts:22`) | Chaves com identidade | — | P3 | — |
| DASH-018 | SECURITY INVOKER/DEFINER intencional | PARCIAL | Revisar todas as funções | `search_path` restaurado em contact_counts | Revisar as demais | — | P3 | — |
| DASH-019 | Validar parâmetros no backend | NV | Limites de p_days/p_limit | Não verificado | — | — | P3 | — |
| DASH-020 | Minimizar dados sensíveis | PARCIAL | Só campos necessários | `useAIStats` faz `select('*')` em `audit_logs` (`useAIStats.ts:143`) | Projeção mínima/RPC | Supervisor recebe detalhes de auditoria além do necessário | P2 | — |
| DASH-021/023 | Ciclo de atendimento e recomposição histórica | NAO_INICIADO | Atendimento ≠ contato; backfill | Nada | — | — | P2 | — |
| DASH-022 | Autoria e fila do momento do fato | NAO_INICIADO | Não usar `assigned_to` atual | SLA por agente usa `contacts.assigned_to` atual (`useSLAMetrics.ts:93,128`) | Fatos com autor/fila do evento | Transferência reescreve produtividade passada | P1 | — |
| DASH-024 | Estoque × fluxo | NAO_INICIADO | Abertas não filtradas por `updated_at` | `c.updated_at >= p_since` (`20261006064630_*.sql:58-59`) | Separar estoque | Conversa aberta desde ontem some do card | P1 | — |
| DASH-025 | Estados contados unificados | PARCIAL | myActive só ativos | `myActive` sem filtro de status (`…:88`) | Predicados explícitos | "Minhas ativas" conta resolvidas | P2 | — |
| DASH-026/030 | Limites de dashboard_kpi; integridade temporal | NV | — | Não reverificado | — | — | P3 | — |
| DASH-027/028/029 | Instante de referência, filtros previsíveis, média×mediana | PARCIAL | Corte único, filtro global honesto | Aviso de período (`DashboardView`), realtime já recebe filtros | Completar | — | P2 | — |
| DASH-031 | SLA agregado no servidor | PARCIAL | RPC de agregação | Leitura paginada no cliente (`useSLAMetrics.ts:84-110`) | RPC | Lento em volume | P2 | — |
| DASH-032 | Metas agregadas no servidor | NAO_INICIADO | Sem transportar histórico | `useGoalsDashboard.ts:106-131` lê sem paginação (corta em 1.000) | RPC | Meta "trava" acima de 1.000 mensagens | P1 | — |
| DASH-033 | Análises/sentimento agregados | PARCIAL | Contagem completa por período | `useAIStats.ts:71-79` e `useAIInsights` (`useRecentAnalyses.ts:71`) leem linhas sem paginação | RPC agregada | Total de análises trava em 1.000 | P2 | — |
| DASH-034 | NPS sem teto de 500 | NAO_INICIADO | NPS com todas as respostas | `.limit(500)` (`src/hooks/business/useNPSSurveys.ts:46`) | Agregação | NPS errado acima de 500 respostas | P1 | — |
| DASH-035 | Heatmaps agregados no banco | NAO_INICIADO | Buckets dia/hora no servidor | `ActivityHeatmap.tsx:63` lê `messages` cru 90–365 dias (corta em 1.000 linhas) | RPC de buckets | Mapa de calor anual mostra só 1.000 mensagens | P1 | — |
| DASH-036 | Ativas com DISTINCT no servidor | NAO_INICIADO | Contagem distinta | `.limit(5000)` + distinct no cliente (`useRealtimeDashboard.ts:170`) | RPC | Subconta em pico | P3 | — |
| DASH-038/039 | Índices e restrições com evidência | NV | EXPLAIN e saneamento | — | — | — | P3 | — |
| DASH-040 | Orçamento de desempenho | NAO_INICIADO | Metas de latência/volume | Nada | — | — | P3 | — |
| DASH-043 | Deltas imutáveis | PARCIAL | Copiar acumuladores antes do setState | `pending` copiado (`useRealtimeDashboard.ts:322-326`); `minuteCountRef` lido dentro do updater e zerado fora (`:344-361`) | Copiar também o contador por minuto | Mensagens/minuto pode zerar | P3 | — |
| DASH-047 | Invalidar todos os indicadores | PARCIAL | Mapa evento→query | Invalidadores parciais | Completar | — | P3 | — |
| DASH-049 | Respostas fora de ordem | NAO_INICIADO | Descartar respostas antigas | `useLeaderboard` com `useState`+fetch manual sem id (`useLeaderboard.ts:44-60`); NPS idem | React Query/abort | Ranking de "hoje" mostra dado de "mês" | P3 | — |
| DASH-051 | Elegibilidade única de SLA | PARCIAL | Mesmo denominador em painel/fila/ranking | Tally único no hook; RPC com DISTINCT ON | Unificar com RPC | — | P2 | — |
| DASH-053 | Resolução por fatos operacionais | NAO_INICIADO | Meta de resolução por encerramentos | "Taxa de Resolução" = análises de IA com status `resolvido` (`useGoalsDashboard.ts:130,154-155`) | Usar encerramentos | Meta do agente depende de ele rodar análise de IA | P1 | — |
| DASH-054 | Contatos atendidos reais | NAO_INICIADO | Atendimento no período | Conta `contacts.created_at` atribuídos (`useGoalsDashboard.ts:118-119`) | Evidência de atendimento | Retomar cliente antigo não conta | P1 | — |
| DASH-055 | Metas sem configuração/zero | PARCIAL | Sem NaN; distinguir desativada | Fallback de alvo; divisão `current/target` sem guarda (`useGoalsDashboard.ts:185`) | Guardas | — | P3 | — |
| DASH-056 | Metas versionadas | NAO_INICIADO | Vigência por meta | Nada | — | Mudar meta reescreve histórico | P3 | — |
| DASH-057 | Período das metas na interface | PARCIAL | Virada do dia | R3-07 corrigido (`useGoalNotifications.ts:188`) | Tick de virada | — | P3 | — |
| DASH-058 | Ledger de XP idempotente | PARCIAL | Repetição não duplica XP | Triggers corrigidos; teste `gamification-marco-nao-bloqueia-envio.test.sh` | Prova por reabertura | — | P3 | — |
| DASH-059 | Ranking com variação real | PARCIAL | Sem rank anterior fictício | `previousRank: row.rank` (`src/hooks/gamification/useLeaderboard.ts:98`) | Snapshot anterior | Seta de "subiu/caiu" nunca é real | P3 | — |
| DASH-060 | Presença real no ranking | NAO_INICIADO | Online = presença | `p.is_active AS is_online` (`20261003272707_reconcile_local_replay_with_canonical.sql:537`) | Usar presença | Agente desconectado aparece online | P2 | — |
| DASH-061 | Conceito único de CSAT | BLOQUEADO | Média × % satisfeitos | — | Decisão | CSAT diferente entre telas | P2 | Decisão de produto |
| DASH-062 | Cache derivado de CSAT | PARCIAL | Atualizar junto | Breakdown keyset preservado | Unificar | — | P3 | — |
| DASH-063 | Série NPS no gráfico | NAO_INICIADO | Desenhar NPS no modo "CSAT e NPS" | Só `<Line dataKey="CSAT">` (`SatisfactionMetrics.tsx:166`); legenda mostra NPS (`:173`) | Série NPS | Gestor escolhe "CSAT e NPS" e vê só CSAT | P2 | — |
| DASH-064 | Janelas das avaliações | NV | — | — | — | — | P3 | — |
| DASH-067 | Ponderar por amostra | NAO_INICIADO | Somas, não média de percentuais | Média simples por dia (`SentimentTrendChart.tsx:40-42`) | Ponderação | % de sentimento distorcido | P2 | — |
| DASH-068 | Total de alertas ≠ lista recente | NAO_INICIADO | Total exato | 400 análises (`useRecentSentimentAlerts.ts:52`); card "Alertas de Sentimento" = até 5 de `audit_logs` 24 h (`useAIStats.ts:143-144`) | Contagem real | Card mostra no máximo 5 alertas | P1 | — |
| DASH-069 | Comparação temporal equivalente | NAO_INICIADO | Janelas reais | Metades dos dias com registro (`SentimentTrendChart.tsx:43-52`) | Calendário completo | Tendência falsa | P2 | — |
| DASH-070 | Fontes de sentimento consolidadas | PARCIAL | Mesma classificação em todas as abas | Normalizador comum; 3 hooks distintos | Fonte única | — | P3 | — |
| DASH-073 | Alertas de IA por interface restrita | NAO_INICIADO | Usar `dashboard_sentiment_alerts` | Leitura direta de `audit_logs`, erro ignorado (`useAIStats.ts:142-144`) | Trocar pela RPC | Falha vira "0 alertas" | P2 | — |
| DASH-074 | Tendências de IA corretas | NAO_INICIADO | Base zero sem "100%" | `percentage: 100` quando anterior = 0 (`useAIStats.ts:55`) | Estado "sem base" | "+100%" falso | P3 | — |
| DASH-075 | Previsão sem "95% de confiança" | NAO_INICIADO | Descrever método real | Texto "intervalo de confiança de 95%" (`DemandPrediction.tsx:75`) sobre faixa heurística (`useDemandPrediction.ts:43-45`) | Rótulo honesto | Gestor confia em previsão sem base estatística | P1 | — |
| DASH-076/077 | Observado × estimado; metodologia | NAO_INICIADO | "Dados reais" = volumes reais; backtest | "Real" = média de 7 dias (`useDemandPrediction.ts:30-35`) | Séries reais + validação | — | P2 | — |
| DASH-078 | Capacidade configurada | NAO_INICIADO | Capacidade operacional real | Fixo 35 (`DemandPrediction.tsx:24`, `useDemandPrediction.ts:52`) | Configuração | Alerta de "capacidade OK" fictício | P2 | — |
| DASH-079 | Entradas vazias/NaN na previsão | NAO_INICIADO | Proteger cálculos | Sem guardas (`useDemandPrediction.ts:77-86`); leitura de 7 dias corta em 1.000 msgs (`:55-59`) | Guardas + RPC | Previsão subestima volume | P2 | — |
| DASH-080 | Semântica dos heatmaps | NAO_INICIADO | messages/conversations/resolutions com fontes próprias | Sempre `messages` (`ActivityHeatmap.tsx:57-63,149`) | Fontes por métrica | Trocar métrica só muda o rótulo | P3 | — |
| DASH-081 | Validar configuração de relatório | PARCIAL | Nome/tipo/frequência/destinatários validados no front e back | Parse simples de e-mails no front | Validação no banco | — | P3 | — |
| DASH-082 | Frequência apresentada | PARCIAL | Calendário real por opção | Tile "Personalizada — Sob demanda" grava `custom` (`src/components/dashboard/ScheduledReportsManager.tsx:49`) sem nenhum executor | Remover ou implementar | Promessa "sob demanda" sem botão de envio | P2 | DASH-083 |
| DASH-083 | Cadeia de execução dos relatórios | NAO_INICIADO (DIVERGENTE) | Agendador → geração → envio → retorno | Aba diz "relatórios automáticos enviados por email" (`ScheduledReportsManager.tsx:94`); **nenhum código lê `scheduled_report_configs` para enviar** (só `useScheduledReportConfigs.ts:24-56`); `send-scheduled-report` lê **outra tabela** `scheduled_reports` (`supabase/functions/send-scheduled-report/index.ts:106,228`), não tem cron em nenhuma migration e usa tipos diferentes (`dashboard_summary`… × `performance/sla/conversations/satisfaction`) | Executor + cron + unificar tabela/tipos | Gestor cadastra relatório e **nunca recebe e-mail** | P0 | Resend (`RESEND_API_KEY`) + `CRON_SECRET` |
| DASH-084 | Execução idempotente | NAO_INICIADO | Chave por ocorrência | Nada para `scheduled_report_configs` | — | Envio duplicado quando existir | P1 | DASH-083 |
| DASH-085 | Controle de entrega/acesso | PARCIAL | Estados de envio, revalidar permissão | Edge distingue sent/partial/failed (`send-scheduled-report/index.ts:186-266`), mas inalcançável | Ligar ao fluxo real | — | P1 | DASH-083 |
| DASH-086 | Relatório = Dashboard | NAO_INICIADO | Mesmos contratos | Edge recalcula com `|| 50`/`|| 3` (`send-scheduled-report/index.ts:153-154`) e leituras sem paginação | Reusar RPCs | Relatório e tela divergem | P2 | DASH-083 |
| DASH-087 | Endurecer alterações | PARCIAL | Confirmar exclusão, checar linhas | Delete sem checar linhas afetadas (`useScheduledReportConfigs.ts:52-56`) | Checagem | "Removido" sem remover | P3 | — |
| DASH-088 | Estados de widget padronizados | PARCIAL | Erro ≠ vazio | `useSLAMetrics` não devolve `error` (`useSLAMetrics.ts:154-161`); AIQuickAccess trata erro como vazio (`AIQuickAccess.tsx:76-77`) | Estado de erro | Falha parece "sem dados" | P2 | — |
| DASH-089 | Acessibilidade das 9 abas | PARCIAL | Teclado, nomes, contraste | Ver §3.8 (A11Y) | Correções | — | P2 | — |
| DASH-090 | Instrumentar confiabilidade | NAO_INICIADO | Latência/completude por widget | Nada | — | — | P3 | — |
| DASH-093 | Fixtures de escala | PARCIAL | > 1.000 linhas, 500 NPS, 400 análises | 1.200 contatos no teste RLS | NPS/análises | — | P2 | — |
| DASH-094 | E2E das 9 abas | NAO_INICIADO | Fluxos por papel | Nenhum spec de dashboard em `e2e/` | Specs | Regressão de dashboard só em produção | P2 | Credencial E2E |
| DASH-095 | Testes de concorrência/realtime | PARCIAL | Corridas, reconexão, meia-noite | `useRealtimeDashboard.reconciliacao/escopo.test.tsx` | Meia-noite/reconexão | — | P3 | — |
| DASH-097/098 | Backfill e carga | NAO_INICIADO | Ensaios autorizados | Nada | — | — | P3 | Ambiente |
| DASH-099 | Revisão independente | BLOQUEADO | Revisão humana | — | — | — | P2 | Humano |
| DASH-100 | Liberação autorizada | BLOQUEADO | Autorização explícita | — | — | — | P2 | Joaquim |

### 3.5 Redesign Dashboard Navy 100 etapas

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| 96 | Gates completos | PARCIAL | 8 gates exit 0 | 6/8 (`REDESIGN_DASHBOARD_STATUS.md:16`) | Lint/typecheck-ratchet | — | P3 | — |
| 97 | E.5 funcional | PARCIAL | 21 checks | 20/21 | 1 check | — | P3 | — |
| 100 | Verificação em produção | NV (DIVERGENTE) | Screenshot e cores em produção | Status diz BLOQUEADA por regressão; correção dos tokens está na main (`tailwind.config.ts:119-123`) mas CP12 nunca foi fechado | Medir produção e fechar CP12 | — | P3 | — |
| Resíduos | Capacidade máxima, deltas de Abertas/Não lidas, geometria | NAO_INICIADO/aceito | — | `REDESIGN_DASHBOARD_STATUS.md:89-96` | Fonte de capacidade (ver DASH-078) | — | P3 | Fonte de dado |

### 3.6 Redesign Dashboard Abas (7 fases)

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| FASE1 | Metas: delta "Progresso Geral", sparklines, kebab "Ações" | PARCIAL | KPIs com delta e barras | `delta={null}`, `bars={null}` (`src/components/dashboard/GoalsDashboard.tsx:54-55`) | Snapshot de período anterior; menu de ações | Metas sem tendência | P3 | Série histórica |
| FASE3 | SLA: deltas "No Prazo"/"Total" | PARCIAL | Deltas | Sem trend dedicado (`REDESIGN_DASHBOARD_ABAS_STATUS.md:85`) | Trend | — | P3 | — |
| FASE7 | Relatórios: "Personalizada" | PARCIAL | Frequência coerente | Grava `custom` sem executor (ver DASH-082/083) | — | — | P2 | DASH-083 |

### 3.7 Prompt Mestre Dashboard WIDE 24" Full HD (08/10)

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| WIDE-1…9 | Redesign wide-first (1920×1080) de Visão Geral, Analytics, Metas, IA, SLA, Equipe, Satisfação, Sentimento, Relatórios | NAO_INICIADO | Primeira dobra planejada, densidade, QA 1920/1440/1366 | Nenhuma entrega/status/medição (`docs/plans/00_PROMPT_MESTRE_…md` é o único artefato; nenhum spec/print 1920 do dashboard) | Prompts específicos por tela + execução | Uso em monitor 24" sem otimização | P3 | Prompts por tela "a serem enviados" (§0 do prompt) |
| WIDE-10 | QA global do módulo | NAO_INICIADO | QA visual/funcional/técnico | Nada | — | — | P3 | WIDE-1…9 |
| WIDE-§100 | Auditoria inicial do shell | NAO_INICIADO | Auditar shell e componentes compartilháveis | Nada documentado | — | — | P3 | — |

### 3.8 Resíduos/débitos do Dashboard e auditoria A11Y

| ID | Funcionalidade | Estado | O que foi planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| RES-capacidade | Capacidade máxima e deltas da Visão Geral | NAO_INICIADO | Mostrar com fonte | Omitidos | Fonte de dado | — | P3 | Fonte |
| RES-personalizada | Tile "Personalizada" | PARCIAL | — | Ver DASH-082 | — | — | P2 | — |
| RES-limpeza | Componentes sem uso | PARCIAL | Remover órfãos | `RealtimeMetricsPanel` removido; `DraggableWidgetContainer.tsx`/`WidgetConfigSheet.tsx` órfãos (0 imports fora deles) | Remover ou ligar | — | P3 | — |
| E47 | Web Vitals reais | PARCIAL | Speed Insights | `src/lib/web-vitals` iniciado em `src/main.tsx:7`; sem Speed Insights | Habilitar | — | P3 | Vercel |
| DASH-CONTROLS-001 | Previsão heurística (95%, 35) | NAO_INICIADO | — | Ver DASH-075/078 | — | — | P1 | — |
| E46 | Smoke E2E do Dashboard | NAO_INICIADO | Spec Playwright | Nenhum | — | — | P2 | — |
| RES-geom / E53 | Geometria; card Search Box | BLOQUEADO | — | Aceitos/decisão de produto (`docs/dashboard/README.md`) | Decisão | — | P3 | Dono |
| RES-sla | Rótulo SLA violado / barra Equipe | NV | — | Depende de dados | — | — | P3 | — |
| A11Y-02 | Combobox de filtros sem nome acessível | NAO_INICIADO | aria-label | `DashboardFilters.tsx:210,231` `SelectTrigger` sem `aria-label` | Rótulos | Leitor de tela não identifica filtros | P1 | — |
| A11Y-04 | Botões só ícone sem nome | NAO_INICIADO | Nome acessível | `SentimentAlertsDashboard.tsx:29` | Rótulos | — | P1 | — |
| A11Y-06 | Barras de progresso sem nome | NAO_INICIADO | — | `src/components/ui/progress.tsx` sem aria-label | — | — | P2 | — |
| A11Y-09 | `aria-expanded` em div | NAO_INICIADO | — | `ProgressiveDisclosureDashboard.tsx:76-77` (`asChild` com `div`) | Botão real | — | P2 | — |
| A11Y-14 | Gráficos sem alternativa textual | NAO_INICIADO | — | `overview/VolumeChart.tsx` sem aria/sr-only | Texto alternativo | — | P3 | — |
| A11Y-01,03,05,07,08,10–13 | Demais achados Y16 | NV | — | Não reverificados após 07/10 | — | — | P2–P3 | — |

---

## 4. Divergências doc × código

1. `docs/ia/README.md:52` "Os blocos 01 a 05 estão entregues" × IA-049: outbox grava em `ai_usage_outbox`/`outbox_events` (`supabase/functions/_shared/ai-usage.ts:453,675`) que **não existem** em `supabase/migrations`, `supabase/schema-catalog.json` nem `src/integrations/supabase/types.ts`; `reprocessarLogEssencial` (`ai-usage.ts:516`) sem chamador. Também IA-045 (fila sem consumidor: `ai-jobs-worker/index.ts:84,187`) e IA-009 parcial.
2. `docs/dashboard/README.md`/aba Relatórios: "Configure e gerencie relatórios automáticos enviados por email" (`src/components/dashboard/ScheduledReportsManager.tsx:94`) × nenhum executor lê `scheduled_report_configs`; `send-scheduled-report` lê `scheduled_reports` (`index.ts:106`), sem cron.
3. `docs/design/MODULO_TAREFAS_QUADRO_DASHBOARD.md:212` "dois pontos de UI sobre a mesma tabela" × `src/components/reports/ScheduledReportsManager.tsx:38-45` usa `useScheduledReports` → tabela `scheduled_reports` (outra) e o componente é **órfão** (não importado por nenhuma view).
4. `MODULO_TAREFAS_QUADRO_DASHBOARD.md` §4.4 "Nenhuma informação sai do sistema" × a aba Relatórios aceita destinatários de e-mail livres para dados da operação (`ScheduledReportsManager.tsx:72`) — conflito de política ainda sem decisão.
5. `docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md:9` "ContactIntelligencePanel — Já integrado no ContactDetails" × nenhum `import` do componente em `src/`.
6. `docs/design/REDESIGN_DASHBOARD_ABAS_STATUS.md:89-99` ("Análises Recentes", "Insights de IA", "Alertas recentes de sentimento" sem fonte; "Modelo de IA Ativo" texto fixo) × agora reais: `src/hooks/analytics/useRecentAnalyses.ts`, `useActiveAIProvider.ts`, `useRecentSentimentAlerts.ts` (doc diz pendente, está feito).
7. `REDESIGN_DASHBOARD_ABAS_STATUS.md:103` "Personalizada mapeia para biweekly" × código grava `custom` (`ScheduledReportsManager.tsx:49`).
8. `REDESIGN_DASHBOARD_ABAS_STATUS.md:111` "Coluna SLA no ranking de Equipe não incluída" × `AgentPerformancePanel.tsx:50-53` (feito).
9. `docs/design/REDESIGN_DASHBOARD_STATUS.md:16` CP12 "etapa 100 BLOQUEADA — regressão em produção" × correção dos tokens já na main (`tailwind.config.ts:119-123`); status nunca fechado.
10. `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv` marca NAO_IMPLEMENTADA itens hoje feitos: B3 (`elevenlabs-voice-design/index.ts:76-86`), B8/IA-009 (`_shared/ai-feature-flags.ts`), L4 (`voice-copilot-action/index.ts:141-151`), ETAPA-40a (`AISuggestions.tsx:12-24`), ETAPA-40b (`ObjectionDetector.tsx:44-64`), RES-sla-equipe, RES-ia (chip "Ativo" em `AIQuickAccess.tsx:107`), R3-07 (`useGoalNotifications.ts:188`), L3 (`20260930100000_*.sql:38-44`); e "Blocos 08–13 sem entrega" × entregas IA-104, 112, 114–116, 130, 131, 148.
11. Inventário 07/10 "Gateway central IMPLEMENTADA (DIVIDA_IA_033 zerada na prática)" × a allowlist continua listando `voice-agent` e `classify-audio-meme` (`tests/contracts/ai-central-routing-ratchet.contract.test.ts:139-142`).
12. Reconciliação 03/10 (`docs/reconciliation/reports/modules/TELEFONIA_IA_DASHBOARD.md`) dá como abertos itens hoje corrigidos: regressão `dashboard_contact_counts` (`20261006064630_*.sql`), IA-050 (`_shared/ai-circuit.ts`), replay do webhook IA-013 (`20261004190606_*.sql`), timeout do corpo IA-041 (`_shared/ai-providers.ts:163`), DASH-071/072, IA-112/114/115/116, IA-021 em `useAIStats`.
13. `src/components/dashboard/aiFeatures.ts:46,71` e `AIQuickAccess.tsx:175` navegam para `/sentiment-alerts`, rota inexistente em `src/routes/AppRoutes.tsx:50-114` (a tela é `?view=sentiment`, `src/pages/ViewRouter.tsx:56`) → 404.
14. `AIQuickAccess.tsx:119,122` "Processamentos este mês / vs. mês anterior" × `useAIStats(30)` usa janela móvel de 30 dias; `:138` "vs. ontem" × compara negativos de 30 dias com os 30 anteriores (`useAIStats.ts:160`); "Alertas de Sentimento — Conversas com sentimento negativo" × conta até 5 linhas de `audit_logs` de 24 h (`useAIStats.ts:143-144`).
15. `CLAUDE.md:494` "Merge em main NÃO deploya edge function" × commit `e5dcb3c` (07/10, "volta o deploy automático das Edge Functions no push da main") e `docs/ia/README.md:64-66`.
16. `SupervisorCopilot.tsx:17-18` sugere "Quais filas estão em risco de SLA?"/"Quem está com maior backlog?" × o próprio contexto declara essas métricas "Não medido" (`:55`).
17. `talkx-ai/index.ts:24-28` declara depender de `talkx_ai_requests` e chaves de `talkx_settings` "criadas na trilha de banco" × nenhuma migration cria a tabela.
18. `docs/ia/IA-171-a-IA-180` corrige o inventário (IA-177 implementada) — confirmado no código (`TrainingMode.tsx`), inventário ainda diz "sem entrega".

---

## 5. Achados fora dos planos

- **Chatbot L1 sem gatilho no repositório**: nada em `supabase/functions/evolution-webhook` nem em outra edge chama `chatbot-l1`; o único chamador é o botão "testar conexão" (`src/components/settings/ChatbotL1Config.tsx:234`). O caminho HMAC (chamador externo não versionado) **pula** `enforceAiGuards` → sem kill switch e sem cota (`chatbot-l1/index.ts:27-34`).
- **Editor visual de fluxos de chatbot sem motor**: `ChatbotFlowEditor`/`useChatbotFlows.ts` gravam `chatbot_flows` (nós/arestas), mas nenhuma edge executa fluxos (só o `chatbot-l1` lê config do tipo `ai_l1`).
- **Relatórios — componentes órfãos**: `src/components/reports/ScheduledReportsManager.tsx` (com "enviar agora") e `ScheduledReportConfigs.tsx` não são montados; `getExportData` em `src/components/reports/useReportsData.ts:251` é desestruturado e nunca usado (exportação de relatórios sem botão; `AutoExportManager` bloqueado por política).
- **`send-scheduled-report`**: `calculateNextSend` ignora `biweekly`/`custom` (`index.ts:287-295` → próximo envio = agora); defaults `|| 50` e `|| 3` violam IA-023 (`:153-154`); leituras sem paginação.
- **Dashboard (agente)**: "Pendentes da fila" sempre 0 para agente (filtro `assigned_to = agente` + contagem `assigned_to IS NULL`, `20261006064630_*.sql:57,87`).
- **Aba Analytics**: `ActivityHeatmap` e `useDemandPrediction` leem `messages` cru (teto de 1.000 linhas do PostgREST) — heatmap de 90–365 dias e previsão de 7 dias calculados sobre amostra truncada.
- **Kill switch**: `sentiment-alert` (efeito automático) e `voice-changer` fora do mapa de capacidades; nenhuma tela para ligar/desligar `ai.capability.*`.
- **ObjectionDetector**: "severidade" = confiança do modelo (`ObjectionDetector.tsx:44-64`) — semântica enganosa.
- **`ai-suggest-reply`** envia notas internas e campos customizados do contato ao provedor (`index.ts:95-113`) sem minimização.
- **`ContactIntelligencePanel`** e **`CRMSyncButton`** órfãos; `CRMAutoSync` classifica sentimento por palavra-chave em inglês e manda ao CRM.
- **`DraggableWidgetContainer`/`WidgetConfigSheet`**: personalização de widgets do dashboard meio-feita e órfã.
- **`knowledge_base_articles.embedding_status`**: coluna sem pipeline de embeddings (sem pgvector).
- **Transcrição automática** sem dedupe por mensagem (`evolution-webhook-messages.ts:726-747`).
- **Bucket `audio-memes` público** e permitido no transcritor (B15) segue aberto.
- **`AIQuickAccess`/`useAIInsights`/`useRecentAnalyses`**: erro de consulta exibido como "Nenhuma análise"/"Sem insights" (sem estado de erro); `useAIInsights` agrega sem paginação.

---

## 6. Top 10 da área

1. **Relatórios agendados nunca são enviados**: a aba Relatórios promete e-mail automático, mas nada lê `scheduled_report_configs`; a edge de envio usa outra tabela, sem cron e com tipos incompatíveis (DASH-083/084/086).
2. **Chatbot L1 desconectado e sem freio**: não há gatilho no fluxo de mensagens recebidas no repo, a "transferência para humano" é só uma flag, e o caminho de webhook ignora kill switch/cota (IA-107/108/110, IA-009).
3. **Custo de IA pode sumir e não gera alerta**: outbox "durável" grava em tabelas inexistentes, alerta de consumo anômalo é só projeto, quota conta linhas e falha aberta (IA-049/058/054).
4. **Aba Analytics e cards com números truncados/falsos**: heatmap e previsão sobre 1.000 linhas, "intervalo de confiança de 95%" e capacidade fixa 35 (DASH-035/075/078/079/080).
5. **Metas e ranking medem a coisa errada**: resolução vem de análises de IA, "contatos atendidos" de cadastro criado, "online" = perfil ativo, variação de posição fictícia; agente vê pendentes = 0 (DASH-053/054/059/060/013).
6. **Privacidade (LGPD) nos prompts e logs de IA**: notas internas e dados pessoais vão ao provedor sem mascarar CPF/cartão; logs sem redação (IA-019/059).
7. **Base de conhecimento fraca para a IA**: sugestões usam os 10 primeiros artigos sem relevância, PDF/DOCX não viram conhecimento, sem versão/validade/citação (IA-075/082/083/087).
8. **NPS/sentimento/alertas com tetos e série ausente**: NPS corta em 500, série NPS não é desenhada, total de alertas limitado a 5/400, sentimento sem ponderação (DASH-034/063/067/068/069).
9. **Copiloto do supervisor sem métricas reais e sem briefing periódico**: sugere perguntas de SLA/backlog que não pode responder (IA-117/179).
10. **Atalhos quebrados e painéis órfãos**: "Ver todas"/cards de Alertas e Tendências de Sentimento abrem 404; Painel de Inteligência Comercial e tela de relatórios com "enviar agora" existem mas não estão montados.
