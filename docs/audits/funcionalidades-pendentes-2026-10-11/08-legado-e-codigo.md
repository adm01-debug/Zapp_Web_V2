# Área 08 — Documentos legados/transversais de funcionalidade + varredura do código inteiro

HEAD verificado: `99aa53f` (main, 2026-10-11). Tudo foi conferido **no código** (src/, supabase/functions/, supabase/migrations/,
supabase/schema-catalog.json). Nada foi consultado no banco de produção (proibido nesta missão): onde o executor de uma
funcionalidade poderia existir fora do repositório (pg_cron criado à mão, n8n), o item está marcado "não verificável em produção".

Legenda de estado: PARCIAL · NAO_INICIADO · BLOQUEADO · DIVERGENTE (doc diz feito e o código não entrega, ou o contrário).

---

## 1. Fontes lidas

| caminho | tipo | nº de etapas/itens | data | vigente/substituído |
|---|---|---|---|---|
| docs/FORGOTTEN_FEATURES_REPORT.md | relatório/inventário | 14 módulos + 5 edges + 12 itens P2 "pendentes" | 2026-03-17 | substituído (histórico) |
| docs/IMPROVEMENT_PLAN.md | plano/status | 52 melhorias (P0–P3) + 21 itens de auditoria técnica | 2026-06-12 | declara "100% completo" — não confiável |
| docs/COMPLETE_SYSTEM_FEATURES.md | inventário/status | 48 seções, 400 linhas numeradas, 264 caminhos citados | 2026-03-15 (editado 10/09) | declara "✅ 100% IMPLEMENTADO" — desatualizado |
| docs/FUNCTIONALITIES_INVENTORY.md | inventário | 22 seções, 75 caminhos | 2026-09-28 | vigente (descritivo) |
| docs/CAPACIDADES.md | spec (telefonia) | 1 pendência (BITRIX_WEBHOOK_URL) | 2026-10 | vigente |
| docs/TECHNICAL_DOCUMENTATION.md | spec técnica | 15 módulos, sem roadmap | 2026-03 | desatualizado |
| docs/REFACTORING_REPORT_2026-06-12.md | relatório/backlog | 6 críticos + 10 backlog | 2026-06-12 | parcialmente de OUTRO banco (migrations em `_foreign/`) |
| docs/audit_report.md | auditoria | 5 checklist + 4 riscos | 2026-05-14 | substituído |
| UX_AUDIT_REPORT.md (raiz) | auditoria UX | 5 achados + 3 próximos passos | 2026-09-03 | desatualizado (itens já resolvidos) |
| README.md | doc produto | 33 bullets de funcionalidade | 2026-10 | vigente com divergências |
| CHANGELOG.md ([Unreleased]) | changelog | ~34 entradas | 2026-10-08 | vigente com 1 divergência |
| .lovable/plan.md | plano | 5 passos | 2026 | concluído na prática |
| docs/audits/auditoria-zapp-v3/PLANO_100.md | plano | 4 fases (~22 itens) | 2026-09-27 | **não aplicável**: é do repo `Zapp_Web_V3` (AUDITORIA.md:1-6) |
| docs/handoffs/HANDOFF_ZAPP_WEB_V2_2026-08-29.md | handoff | 4 gates + 18 tarefas | 2026-08-29 | substituído |
| docs/handoffs/handoff_cline_100_etapas_2026_08_30.md | plano | 100 etapas (engenharia) | 2026-08-30 | substituído por planos posteriores |
| docs/handoffs/auditoria_exaustiva_plano_100_etapas_2026_08_30.md | auditoria/status | 100 etapas + matriz de autenticidade (25 áreas) | 2026-08-30 | baseline histórica |
| docs/handoffs/handoff_cline_execucao_corretiva_exaustiva_2026_08_30.md | plano corretivo | mesmas 100 etapas (cartões 001–100) | 2026-08-30 | substituído |
| docs/audits/HANDOFF_CORRECOES_PENDENTES_2026-08-27.md | handoff/status | 15 + 3 abertos | 2026-08-27 | concluído |
| docs/audits/REVISAO_PLANO_100_ETAPAS_2026-09-10.md | status | 100 (3V/69P/9F/3A/16N) | 2026-09-10 | baseline histórica |
| docs/audits/REVISAO_PLANO_100_ETAPAS_2026-09-28.md | status | 100 (plano GH Actions 27/09) | 2026-09-28 | substituído (plano 01/10 — área 07) |
| docs/POP-ATENDIMENTO-BASICO.md | procedimento operacional | 7 atalhos, 5 KPIs, 7 passos | 2026-10 | vigente com divergências |
| docs/WEBHOOK_EVENTS.md | spec | 5 eventos suportados + 6 "não implementados" + 1 pendência de segurança | 2026-10-09 | desatualizado |
| docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md | spec | 26 eventos | 2026-04-13 | parcialmente obsoleto (wpp2/v2) |
| docs/PROJECT_TEMPLATE.md | template genérico | — | 2026 | não aplicável |
| docs/prompts/* (3 arquivos) | prompts de ferramentas | — | 2026-10 | não aplicável ao produto |
| docs/hermes/FLUXO-HERMES.md | processo | 6 passos | 2026-10 | não aplicável ao produto |
| docs/decisions/ADR-001…006 (7 arquivos) | ADR | 7 | 2026 | ADR-005 parcial; ADR-003 com ID duplicado |
| qa/tel/*.png | evidência (3 imagens) | — | 2026-10 | n/a |
| infrastructure/preview-egress-proxy/* | código (Go) | 1 serviço | 2026-09 | código pronto, deploy não comprovado |
| GitHub: issues abertas (`github_list_issues`, state=open) | issues | 15 (14 issues + 1 PR) | até 2026-10-06 | vigente |
| src/, supabase/functions/ (82), supabase/migrations/, supabase/schema-catalog.json (168 tabelas, 12 views, 264 funções) | código | varredura completa | HEAD 99aa53f | vigente |

---

## 2. Placar por plano

Critério: "concluído" = artefato encontrado no código que entrega o que o doc promete (sem prova E2E em produção). Coluna extra
"divergente" = afirmação do doc contradita pelo código. Para COMPLETE_SYSTEM_FEATURES a unidade é **grupo de linhas** com o mesmo defeito.

| plano | total | concluído (verificado no código) | parcial | não iniciado | bloqueado | não verificável | divergente |
|---|---|---|---|---|---|---|---|
| FORGOTTEN_FEATURES_REPORT (14 módulos + 12 P2) | 26 | 9 | 12 | 1 | 2 | 0 | 2 |
| IMPROVEMENT_PLAN (52 + 21 auditoria) | 73 | 56 (13 por amostragem) | 4 | 0 | 0 | 8 (DB-1..8 são de outro banco) | 5 |
| COMPLETE_SYSTEM_FEATURES (400 linhas) | 400 | ≈355 linhas (artefato presente) | 14 grupos | 0 | 2 grupos | — | 10 grupos (+49 caminhos citados inexistentes) |
| FUNCTIONALITIES_INVENTORY | 75 caminhos | 70 | 0 | 0 | 0 | 0 | 5 caminhos removidos |
| TECHNICAL_DOCUMENTATION | 24 caminhos | 21 | 0 | 0 | 0 | 0 | 3 caminhos + seção Catálogo |
| REFACTORING_REPORT_2026-06-12 | 16 | 2 | 4 | 0 | 0 | 10 (7 são de outro banco) | 0 |
| audit_report.md | 9 | 4 | 1 | 2 | 0 | 2 | 1 |
| UX_AUDIT_REPORT.md | 8 | 7 | 0 | 0 | 0 | 1 | 2 |
| README (funcionalidades) | 33 | 30 | 2 | 0 | 0 | 0 | 1 |
| CHANGELOG [Unreleased] | ~34 | 33 | 0 | 0 | 0 | 0 | 1 |
| .lovable/plan.md | 5 | 4 | 0 | 0 | 0 | 1 | 0 |
| PLANO_100 auditoria-zapp-v3 | ~22 | n/a (outro repositório) | — | — | — | — | — |
| 100 etapas Cline (handoff + corretivo + auditoria 08-30) | 100 | 10 (3 V em 10/09 + 7 reverificadas hoje) | 5 | 3 | 0 | 82 (P/F de 10/09 sem reverificação) | 0 |
| REVISAO 2026-09-28 (plano GH Actions 27/09) | 100 | 4 (na data) | 5 | 91 | — | substituído → área 07 | — |
| HANDOFF 2026-08-29 | 22 | 7 | 0 | 0 | 0 | 15 (infra/secrets) | 0 |
| HANDOFF_CORRECOES 2026-08-27 | 18 | 16 | 1 | 0 | 0 | 1 | 0 |
| WEBHOOK_EVENTS.md | 8 | 7 | 0 | 0 | 0 | 1 | 7 (doc diz "não implementado") |
| EVOLUTION_WEBHOOKS_DOCUMENTATION | 27 (26 eventos + sync labels→pipeline) | 23 | 0 | 4 | 0 | 0 | 1 |
| POP-ATENDIMENTO-BASICO | 12 (7 atalhos + 5 KPIs) | 6 | 0 | 0 | 0 | 0 | 6 |
| ADRs docs/decisions | 7 | 6 | 1 (ADR-005) | 0 | 0 | 0 | 1 (ID ADR-003 duplicado) |
| CAPACIDADES.md | 1 pendência | 0 | 0 | 0 | 1 | 0 | 0 |
| Issues GitHub abertas | 15 | 0 | 4 | 0 | 1 | 2 | 5 (já resolvidas e abertas) — 3 são só relatórios |
| Varredura de código (sem plano) | 20 achados | — | 14 | 3 | 2 | 1 | 1 |

---

## 3. Pendências detalhadas

Colunas: ID | funcionalidade | estado | planejado | existe hoje (evidência) | falta | impacto no negócio | prio | dependência.

### 3.1 Inbox / Chat

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-01 | Envio de mensagem agendada | PARCIAL | CSF 21.1/21.6 e IMPROVEMENT P1.10 ✅ "agendar para envio futuro" | UI grava `scheduled_messages` status `pending` (`src/components/inbox/ChatPanel.tsx:222`, `src/hooks/chat/useScheduledMessages.ts:48,72`); calendário lista/cancela (`ScheduleCalendarView.tsx:62`). **Nenhuma** Edge, cron ou trigger lê a tabela para enviar (grep em supabase/functions e migrations: 0 consumidores; reconciliação 03/10 já anotou `docs/reconciliation/reaudit/2026-10-03/reports/database/report.md:1153`) | processador (cron + Edge) que envie, marque `sent/failed` e trate anexos | O atendente agenda e o cliente **não recebe**; a agenda mostra mensagens que nunca saem | P0 antes de divulgar o recurso (latente) | conferido em 12/10 (só leitura): nenhum job do `pg_cron` de produção nem função do banco processa a tabela, e ela estava vazia (sem uso hoje; nenhum histórico consultado); N8N não conferido |
| L-02 | Mensagens interativas (botões/listas) | DIVERGENTE | IMPROVEMENT P2.6 ✅; CSF lista botões/listas na Evolution | Builder abre (`ChatDialogs.tsx:9`), Edge tem rotas `send-list`/`send-buttons` (`supabase/functions/evolution-api/index.ts:861-862`, `_shared/evolution-go-routes.ts:129-139`), mas o handler **sempre lança** `ENVIO_INTERATIVO_INDISPONIVEL` (`src/components/inbox/chat/useChatPanelHandlers.ts:74-75,421`); clique em botão só faz toast (`:424-425`) | publicar o transporte (handler → Edge) e tratar resposta de botão | Vendedor não consegue mandar menu/botões ao cliente | P1 | validar suporte de botões na Evolution GO |

### 3.2 Automação, chatbot e atendimento automático

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-04 | Chatbot / fluxos e Chatbot L1 | PARCIAL | FORGOTTEN #2, CSF 36: triggers keyword/first_message/menu/webhook/schedule | CRUD + editor (`src/hooks/integrations/useChatbotFlows.ts:87,108`); Edge `chatbot-l1` lê fluxo `ai_l1` (`supabase/functions/chatbot-l1/index.ts:87-94`) mas só é chamada pelo botão "testar conexão" (`src/components/settings/ChatbotL1Config.tsx:234`); `evolution-webhook` não aciona chatbot (grep 0) | ligar o recebimento de mensagem ao motor de fluxos/L1 e gravar `chatbot_executions` | Atendimento automático (triagem/FAQ fora do horário) não acontece | P1 | pode existir chamada via n8n — não verificável |
| L-05 | Automações genéricas (regras gatilho→ação) | PARCIAL | CSF 19.1, IMPROVEMENT P2.10, FORGOTTEN 3.11 | CRUD em `automations` (`src/components/automations/useAutomations.ts:29,40,62`); nenhum executor em functions/migrations (só cadastro) | executor de `trigger_type/actions` | Regras salvas não fazem nada; gestor acredita que estão rodando | P1 | — |
| L-06 | Sequências de follow-up | PARCIAL | FORGOTTEN #12, CSF 46 | CRUD (`src/components/settings/FollowUpSequences.tsx:38,48,62`) e histórico de execuções só leitura; nenhum produtor de `followup_executions` em functions/migrations | executor com delay por passo | Follow-up comercial automático não é enviado | P1 | — |
| L-07 | Mensagem de ausência / horário de atendimento | PARCIAL | CSF 23.2–23.3 ✅ | Config por conexão (`src/hooks/business/useBusinessHours.ts:46,68`); a própria tela admite "Nenhum executor versionado envia esta mensagem automaticamente hoje" (`src/components/settings/MessagesSettings.tsx:40-42`) | envio automático fora do horário | Cliente que escreve fora do expediente fica sem resposta | P1 | — |
| L-08 | Mensagens automáticas de boas-vindas e encerramento | NAO_INICIADO | CSF 23.3 ✅ | Retiradas da gravação: "nenhum executor versionado lê ou envia esses campos" (`MessagesSettings.tsx:19-20`, `:195`) | executor + campo versionado | Sem saudação/encerramento padronizados | P2 | — |
| L-09 | Auto-fechamento de conversas inativas | PARCIAL | CSF 19.5–19.7 ✅ | Config (`src/hooks/inbox/useAutoCloseConversations.ts`, `AutoCloseSettings.tsx`) e Edge com modo cron (`supabase/functions/auto-close-conversations/index.ts:134`); **nenhum** `cron.schedule` nas migrations chama a Edge (lista de jobs versionados não inclui auto-close) | agendamento versionado | Fila acumula conversas mortas; SLA/indicadores distorcidos | P1 | pode haver cron fora do repo (PLANO_BANCO_UNICO cita "8 cron jobs" incl. auto-close) — não verificável |
| L-10 | Distribuição automática por `user_settings` (round-robin/aleatório/menor carga, timeout) | DIVERGENTE | CSF 19.2–19.4 ✅ | Campos só no tipo (`src/hooks/system/useUserSettings.ts:27-29`); a aba Automação não exibe esses controles (`AutomationSettings.tsx` só tem transcrição e auto-close) e nenhuma função SQL lê `auto_assignment_method` | remover do doc ou implementar | Doc promete escolha de método de distribuição inexistente (a distribuição real é por fila/carteira via triggers) | P3 | — |
| L-11 | Campanhas Clássicas (envio em massa) | PARCIAL | FORGOTTEN #1, CSF 35; Talk X é outro subsistema | "Iniciar" só muda `campaigns.status` para `sending` (`src/components/campaigns/CampaignsView.tsx:175`); `campaign_contacts` sem consumidor em 82 Edges; `talkx-scheduler` lê `talkx_campaigns`, não `campaigns` (`supabase/functions/talkx-scheduler/index.ts:148,166`) | motor de envio ou remover a tela (já há Talk X) | Campanha aparece "enviando" para sempre e ninguém recebe | P1 | decisão de produto (manter só Talk X?) |

### 3.3 Satisfação (CSAT/NPS)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-12 | Pesquisa CSAT ao cliente | DIVERGENTE | CSF 12.1–12.2 ✅ (`CSATSurveyDialog`), README "CSAT (pesquisa de satisfação)" | Dialog removido; `submitSurvey` sem chamador (`src/hooks/business/useCSAT.ts:87`); config automática salva (`src/components/settings/CSATAutoConfig.tsx:32,71`) mas nenhuma Edge envia pesquisa nem lê resposta | envio da pesquisa no encerramento + captura da nota no webhook | Dashboards CSAT vazios; KPI do POP "CSAT > 90%" impossível de medir | P1 | — |
| L-13 | NPS periódico | NAO_INICIADO | FORGOTTEN 3.12 | NPS só manual pelo agente (`src/hooks/business/useNPSSurveys.ts:64-85`, `survey_type: 'manual'`) | disparo periódico ao cliente | Sem medição de lealdade | P2 | — |
| L-14 | Métricas de satisfação | PARCIAL | IMPROVEMENT P3.5 ✅ | Telas existem (`SatisfactionMetrics.tsx`), alimentadas por tabelas sem coleta automática | depende de L-12/L-13 | Indicadores sem dado real | P2 | L-12 |

### 3.4 Notificações, PWA e idioma

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-15 | PWA completo + Web Push | DIVERGENTE | IMPROVEMENT P1.14 ✅; CSF 20.3/20.4/20.12/20.13 (`public/sw.js`) ✅ | `SERVICE_WORKER_ENABLED = false` e push derivado (`src/config/service_worker.ts:7-8`); `useServiceWorker` desregistra workers; `public/sw.js` não existe; inscrição push com VAPID fixo no cliente (`src/hooks/system/usePushNotifications.ts:25,116`) e nenhuma tabela/Edge guarda ou envia push | decidir: reativar (SW + armazenamento de inscrição + envio) ou retirar dos docs | Agente não recebe alerta com a aba fechada | P2 | decisão registrada no código (desligado de propósito) |
| L-16 | Internacionalização PT/EN/ES | DIVERGENTE | IMPROVEMENT P3.3 ✅; CSF 23.11 | Dicionários (`src/i18n/index.ts:6,126,246`) e seletor (`src/components/settings/LanguageSelector.tsx:13`); **nenhum** componente usa `t()` (único consumidor de i18n é o seletor) | traduzir telas ou retirar o seletor | Trocar idioma não muda nada — promessa falsa | P3 | — |
| L-17 | Atalhos do app instalado / widget home screen | PARCIAL | IMPROVEMENT P3.10, FORGOTTEN 3.14 | `public/manifest.json` com 4 shortcuts (Chat, Teams, Email, Contatos); depende de PWA (L-15) | — | Baixo | P3 | L-15 |

### 3.5 Relatórios e exportação

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-03 | Exportar relatórios (wizard, PDF, Excel, CSV, botão rápido) | DIVERGENTE | CSF 11.2–11.6 ✅, IMPROVEMENT P1.2 ✅ | `AdvancedExportDialog`, `ExportButton`, `utils/exportReport` removidos; `getExportData` desestruturado e nunca usado (`src/components/reports/AdvancedReportsView.tsx:42`); `jspdf` segue no package.json (`:82-83`) | decidir política (há bloqueios LGPD em outras telas) e religar ou retirar do doc | Gestor não consegue tirar relatório para fora do sistema | P2 | decisão LGPD |
| L-18 | Exportação automática | BLOQUEADO | FORGOTTEN 3.18, CSF | Tela fixa "Exportação Automática — Bloqueada… política de proteção de dados (LGPD)" (`src/components/reports/AutoExportManager.tsx:1-27`), ainda no menu (`navigation.service.ts:150`) | decisão do dono | — | P3 | Joaquim (LGPD) |
| L-19 | Relatórios agendados por e-mail | PARCIAL | CSF 11.7–11.8 ✅ | Tela + Edge com modo cron e avanço de `next_send_at` (`supabase/functions/send-scheduled-report/index.ts:229`); envio manual via `useScheduledReports.ts:142`; **nenhum** cron versionado chama a Edge | agendamento | Relatório "semanal" só sai se alguém clicar | P2 | possível n8n — não verificável |

### 3.6 Contatos, CRM e Catálogo

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-20 | Pipeline de Vendas (Kanban de negócios) | DIVERGENTE | FORGOTTEN #3, CSF 37 (`SalesPipelineView`) | Tela removida; `?view=pipeline` redireciona para Tarefas (`src/hooks/system/useNavigationHistory.ts:115-121`, CHANGELOG 07/10); `sales_deals`/`deal_activities` só lidos no Contato 360/Histórico (`src/components/inbox/tabs/OpenDealsList.tsx`); `pipeline_stages` não existe mais no catálogo | atualizar docs (ou reabrir gestão de negócios) | Docs vendem um CRM de negócios que não existe | P2 | decisão de produto |
| L-21 | Carrinho de compras e mensagem de pagamento PIX no chat | DIVERGENTE | CSF 3.14, 13.5–13.7 ✅ | `ShoppingCart`, `useShoppingCart`, `PaymentMessage` removidos; ainda listados na doc in-app (`src/components/docs/featuresSectionsData.ts:155`) | retirar dos docs ou reimplementar | Promessa de e-commerce no chat sem entrega | P3 | — |
| L-22 | Avatar gerado por IA | DIVERGENTE | IMPROVEMENT P3.9 ✅, CSF 5.12 | `AIAvatarGenerator.tsx` removido; nada equivalente no código | corrigir doc | Baixo | P3 | — |
| L-23 | Versionamento de registros (histórico de versões) | DIVERGENTE | CSF 6.16 ✅ | `useVersions` existe (`src/hooks/system/useVersions.ts:17`) mas **nenhuma tela** o consome (`VersionHistory.tsx` removido) | tela de histórico/restauração | Sem trilha visível de alterações de contato | P3 | — |
| L-24 | Campos customizáveis de contato | PARCIAL | README "Gestão de contatos com campos customizáveis" | Serviço/hook de upsert/delete (`src/hooks/crm/useContactCustomFields.ts:40,56`) sem nenhuma tela de edição; único consumidor é a pré-visualização do Talk X (`TalkXCampaignWizard.tsx:584`) | UI no cadastro/detalhe do contato | Equipe não consegue registrar dados próprios do cliente | P2 | — |
| L-25 | Integração Bitrix24 (configuração pela tela) | PARCIAL | CSF 30.5 "bidirecional" ✅ | URL/domínio digitados ficam só em `useState` e são ignorados; o teste chama a Edge com o segredo do servidor (`src/components/integrations/BitrixIntegrationView.tsx:13-14,28-30`) | persistir/validar config ou retirar os campos | Admin acha que configurou e não configurou | P2 | segredo `BITRIX_WEBHOOK_URL` |

### 3.7 Integrações e telas-fachada

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-26 | Links de pagamento | PARCIAL | FORGOTTEN #6, CSF 40 | CRUD (`src/hooks/payments/usePaymentLinks.ts:36,62`); tela avisa que `/pay/<id>` não tem provedor (`src/components/payments/PaymentLinksView.tsx:114`); menu "Em Desenvolvimento" (`navigation.service.ts:136-142`) | provedor (PIX/cartão), rota de checkout, webhook de baixa | Não cobra ninguém | P2 | escolha de provedor/credenciais |
| L-27 | Meta Conversions API | PARCIAL | FORGOTTEN #10, CSF 44 | Grava `meta_capi_events` (`src/hooks/integrations/useMetaCAPIData.ts:23`); "envio para a Meta… ainda não foi implementado" (`src/components/meta-capi/MetaCAPIView.tsx:58-60`) | envio ao Graph API + `sent_to_meta` | Sem atribuição de anúncios | P3 | Pixel/token Meta |
| L-28 | Google Calendar | NAO_INICIADO | FORGOTTEN 3.4, IMPROVEMENT | Tela de demonstração (`src/components/integrations/GoogleCalendarIntegration.tsx:44,87`); serviço desabilitado no cadastro de usuário (`src/components/admin/AdminView.tsx:40`) | OAuth + sync | Agendas não sincronizam | P3 | OAuth Google |
| L-29 | n8n (hub de integrações) | PARCIAL | FORGOTTEN #5 | "Funcionalidade em demonstração" (`src/components/integrations/N8nIntegrationView.tsx:104,136`; `IntegrationsHub.tsx:21-22`) | persistência real de webhooks/workflows | Automação externa só por fora do app | P3 | — |
| L-30 | Sentry (monitoramento de erros) | NAO_INICIADO | FORGOTTEN #5; 100 etapas 046/073 | Tela demo (`src/components/integrations/SentryIntegrationView.tsx:64,115`); nenhum `@sentry/*` no package.json; source maps `hidden` (`vite.config.ts:49`) | SDK + upload de source maps + release | Erros em produção não chegam a ninguém | P2 | DSN |
| L-31 | WhatsApp Flows (formulários) | PARCIAL | FORGOTTEN #8, CSF 42 | Builder só grava JSON (`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx:86,115`); sem publicar/enviar/receber; está no grupo principal, sem aviso de demo | publicação na Meta + envio | Tela promete formulário que o cliente nunca vê | P3 | L-32 |
| L-32 | Provedor WhatsApp Cloud API oficial | NAO_INICIADO | CSF 30.4 "WhatsApp Cloud API — Webhook" ✅ | Registro de provedor: "provider cloud… ainda nao implementado (etapa 048)" (`supabase/functions/_shared/providers/registry.ts:82-86`) | provider cloud de envio | Dependência total da Evolution GO (risco de bloqueio do número) | P2 | conta Meta Business |
| L-33 | Templates WhatsApp com aprovação oficial | PARCIAL | CSF 13.8, 15 | Status é "do cadastro local", sem retorno da Meta (`src/hooks/integrations/useWhatsAppTemplates.ts:36-40`) | sync com Meta | "Aprovado" na tela não é aprovação real | P3 | L-32 |
| L-34 | Canais Instagram/Telegram/Messenger/Webchat | PARCIAL | CSF (omnichannel), FORGOTTEN | Cadastro "sem executor… não ativa recebimento nem envio" (`src/lib/omnichannel/execucaoDeCanais.ts:102-107`; `OmnichannelManager.tsx:210-214`) | executores por canal | Só WhatsApp e Gmail funcionam de fato | P2 | credenciais de cada canal |
| L-35 | API pública | BLOQUEADO | FORGOTTEN #14, CSF 47 | Edge responde 410 (`supabase/functions/public-api/index.ts:7`); tela "temporariamente desativada" (`src/components/admin/PublicApiDashboard.tsx`) ainda mapeada em `ViewRouter.tsx:90` mas fora do menu (inalcançável) | credenciais hashadas por empresa, rotação, auditoria | Parceiros não integram via API | P2 | redesenho de segurança |
| L-36 | Stripe e Google Sheets no hub | NAO_INICIADO | FORGOTTEN #5 ("Stripe coming soon", Google Sheets) | Hub atual só tem n8n/Sentry (demo) e Bitrix24 (`IntegrationsHub.tsx:15-41`) | — (ou retirar do doc) | Baixo | P3 | — |

### 3.8 Segurança, LGPD e IA

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-37 | LGPD — portabilidade e eliminação | PARCIAL | FORGOTTEN #7, CSF 41 | Exportação bloqueada (`src/components/compliance/LGPDComplianceView.tsx:22`); pedido de exclusão vira só `log_audit_event` (`:35-49`) "um administrador irá processar" — não há fila/tela que processe `gdpr_deletion_request` | fila de atendimento + execução da eliminação | Risco de descumprir prazo legal de 15/30 dias | P2 | jurídico |
| L-38 | Whitelist de IP, IP bloqueado, bloqueio por país | PARCIAL | CSF 24.6–24.8 ✅, README "Geo-blocking" | RPC `resolve_network_policy` (migration `20261004182245`) consumida **só** por `auth-login` (`supabase/functions/_shared/request-policy.ts:132`); `requireAuth` das Edges não aplica (cartão 27.3 da própria migration) | aplicar no `requireAuth` | Bloqueio vale só no momento do login | P2 | — |
| L-39 | Códigos de backup do 2FA | PARCIAL | FORGOTTEN 3.13 "2FA (completar)" | `MFABackupCodes.tsx` gera códigos no navegador e **não é importado** por nenhuma tela; nenhuma tabela/validação de backup code no banco | persistir hash + validar no login | Agente que perde o celular fica trancado | P2 | — |
| L-40 | Anonimização de CPF/cartão nos prompts/logs de IA | NAO_INICIADO | audit_report "Auto-Anonymize" P0 ⏳ | `ai-proxy` sem redaction (grep cpf/redact/anonymi: 0); só `talkx-ai` remove telefone/e-mail do prompt | camada de mascaramento no `ai-proxy` | PII de clientes enviada a provedores de IA | P1 | — |
| L-41 | Busca semântica / embeddings da Base de Conhecimento | PARCIAL | audit_report "Vector Search"; FORGOTTEN #4 "status de embedding" | `ai-kb-ingest` grava `embedding_status: "pending"` e "Nenhuma embedding é gerada aqui" (`supabase/functions/ai-kb-ingest/index.ts:230-231`) | gerar embeddings + busca vetorial | IA responde só por palavra-chave | P3 | — |
| L-42 | Rotação de credenciais Evolution GO + runbook | PARCIAL | Issue #380 | Restart da VPS documentado (`docs/runbooks/deploy.md:123-124`); nenhum procedimento de rotação de `EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE_TOKEN` | runbook + agenda | Chave vazada = WhatsApp da empresa exposto | P2 | Joaquim |

### 3.9 Telefonia e webhooks

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| L-43 | Gravação e reconciliação de chamadas | BLOQUEADO | CSF 17.4 ✅; CAPACIDADES.md "Falta configurar BITRIX_WEBHOOK_URL" | `get-call-recording` e `sync-call-records` prontos; `sync-call-records` devolve 0 sem segredo e não tem agendador versionado ("agendamento do N8N", `supabase/functions/sync-call-records/index.ts` cabeçalho) | configurar segredo + agendamento | Supervisor não ouve gravação | P2 | segredo `BITRIX_WEBHOOK_URL` |
| L-44 | Eventos Evolution STATUS_INSTANCE, LOGOUT_INSTANCE, SEND_MESSAGE_UPDATE | NAO_INICIADO | EVOLUTION_WEBHOOKS_DOCUMENTATION §1.2 (26 ativos) | Dispatcher trata 23 (`supabase/functions/evolution-webhook/index.ts:215-323`); esses 3 não aparecem | handlers (ou desativar no webhook) | Logout remoto do número pode passar despercebido | P3 | — |
| L-45 | Etiqueta do WhatsApp → estágio do pipeline | NAO_INICIADO | EVOLUTION_WEBHOOKS_DOCUMENTATION §10.2 ("usado para sincronizar o Pipeline de Vendas") | `handleLabelsAssociation` só grava tag `wa:<id>:<nome>` (`supabase/functions/_shared/evolution-webhook-handlers.ts:273-295`) | — (pipeline foi removido; L-20) | Baixo | P3 | L-20 |

### 3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| E-02 | Web Vitals oficial + coletor (RUM) | PARCIAL | etapa 047; REVISAO 09-10 R09 | Sem pacote `web-vitals` no package.json; telemetria manual | biblioteca oficial + destino | Lentidão real dos usuários não medida | P3 | — |
| E-03 | Gate Lighthouse + matriz responsiva | NAO_INICIADO | etapa 050 | grep `lighthouse`/`@lhci` em .github/scripts/package.json: 0 | gate de CI | Regressão visual/performance passa | P3 | — |
| E-04 | SLO/SLI e alertas acionáveis | PARCIAL | etapa 077 | `docs/runbooks/slo.md` (próprio doc admite ausência de monitor externo) + issues automáticas do db-live-guard | alertas por SLO | Queda descoberta pelo cliente | P2 | — |
| E-05 | Game day / exercício de DR / restore provado | NAO_INICIADO | etapas 070, 079, 095 | `docs/BACKUP-RECOVERY-STRATEGY.md` existe; nenhum registro de exercício | exercício com evidência | Restore pode falhar no dia do incidente | P2 | Joaquim/infra |
| E-06 | Release candidata, sign-off, canary | NAO_INICIADO | etapas 096–100 | — | processo de release | — | P3 | — |
| E-07 | Cobertura além de src/lib e src/services | PARCIAL | etapa 025; issue #376 | Pisos globais 36/35/43/31 + módulo do mapa (`vitest.config.ts:30-44`) | incluir hooks/componentes/Edges | Telas críticas sem rede de segurança | P3 | — |
| E-08 | Remover `any` explícito | PARCIAL | etapa 034; issue #374 (253 ocorrências) | Hoje 49 ocorrências `: any`/`as any` fora de testes | ratchet de `any` explícito | Baixo | P3 | — |
| E-09 | Consolidar EmptyState em 1 componente | PARCIAL | ADR-005; REFACTORING #4 | Ainda 5 (`ui/EmptyState`, `ui/GenericEmptyState`, `ui/empty-states/ContextualEmptyState`, `tasks/TasksEmptyState`, `contacts/ContactEmptyState`) + `ui/empty-states.tsx` órfão | consolidação | Baixo | P3 | — |
| E-10 | Eliminar componentes duplicados | PARCIAL | REFACTORING #5 | Persistem pares `MetricComparison`, `TrendIndicator`, `MiniSparkline` (raiz × `metrics/`), `FloatingParticles` (dashboard × voice), `ConversationHeatmap` e `ScheduledReportsManager` (dashboard × reports; o de reports é órfão), `BulkActionsBar` (raiz órfão × contacts) | remover cópias | Baixo | P3 | — |
| E-11 | Camada de serviços completa | PARCIAL | REFACTORING #6 | 13 serviços em `src/services`; hooks ainda chamam Supabase direto (ratchet de lint em vigor) | migração gradual | Baixo | P3 | — |
| E-12 | Orçamento/alerta de custo multiplataforma | PARCIAL | etapa 087 | Orçamento de IA existe (`ai_budget_*`, `searchbox-budget-alert` com cron) | Vercel/Supabase/ElevenLabs/Mapbox | Conta-surpresa | P3 | — |
| E-13 | E2E dos fluxos de automação/chatbot | NAO_INICIADO | audit_report "Recomendações críticas" #2 | `e2e/` não tem spec de chatbot/automação | specs | Baixo (o motor nem existe — L-04/L-05) | P3 | L-04 |

### 3.11 Issues abertas do GitHub (15)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| I-1899 (PR) | CORS do domínio oficial `zappweb.app.br` | BLOQUEADO | PR #1899 (06/10) | `EXACT_ALLOWED_ORIGINS` na main só tem `https://zapp-web-v2.vercel.app` (`supabase/functions/_shared/validation.ts:97-99`) | merge + deploy das Edges | App servido em zappweb.app.br tem **toda** chamada às Edges bloqueada | P1 | merge pelo Joaquim + `deploy-functions.yml` |
| I-1265 | Reação cross-team no Team Chat | DIVERGENTE | issue ALTO | Corrigido em `supabase/migrations/20260930260000_team_reaction_membership_guard.sql` | fechar issue | — | P3 | — |
| I-1266 | `get_team_messages_page` quebrada / recursão `tcm_select_own` | DIVERGENTE | issue ALTO | Corrigido em `20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql` (a própria migration diz "nenhum chamador em src/") | fechar issue (RPC segue sem uso — C-04) | — | P3 | — |
| I-1267 | Guards Multiplix fail-open | DIVERGENTE | issue MÉDIO | Corrigido em `20260930300000_multiplix_guards_fail_closed.sql` | fechar issue | — | P3 | — |
| I-382 | Status por fase do plano Talk X 100 | DIVERGENTE | issue 13/09 | Plano citado foi SUBSTITUÍDO pelo V4 (CLAUDE.md, seção Talk X) | fechar como obsoleta | — | P3 | — |
| I-378 | Auto-delete de branch pós-merge | DIVERGENTE | issue 13/09 | `delete_branch_on_merge: true` no baseline (`scripts/ci/github-settings-baseline.json:26`) + workflow `branch-hygiene-audit.yml` | fechar issue | — | P3 | — |
| I-375 | Quebrar god-files do Talk X | PARCIAL | issue 13/09 | `talkxShared.tsx` não existe mais; `TalkXCampaignRunning.tsx` cresceu para 956 linhas | dividir | Baixo | P3 | — |

Também abertas, sem funcionalidade pendente: #374 e #376 (= E-08/E-07), #380 (= L-42), #377 (auditoria de banco — não verificável sem SQL), #1454 (falha de types-sync de 01/10 — provavelmente superada pelo commit `99aa53f` "sincronizar artefatos derivados", não verificável), #1889 (KPI semanal), #1854 (settings-guard: campos `merge.*` lidos como `null` — típico do limite 403 descrito no CLAUDE.md), #1810 (relatório de branches).

---

## 4. Divergências doc × código

1. **COMPLETE_SYSTEM_FEATURES.md:9 "✅ 100% IMPLEMENTADO"** × fachadas e ausências L-01, L-02, L-03, L-11, L-12, L-15, L-20…L-23, L-26…L-34; 49 dos 264 caminhos citados não existem nem com o mesmo nome em outra pasta (ex.: `VersionHistory.tsx`, `CSATSurveyDialog.tsx`, `ShoppingCart.tsx`, `AdvancedExportDialog.tsx`, `NotificationCenter.tsx`, `PrivateNotes.tsx`, `AgentRanking.tsx`, `AIAvatarGenerator.tsx`, 21 arquivos de `src/components/ui/*`).
2. **COMPLETE_SYSTEM_FEATURES §33/§34** "28+ tabelas", "24 Edge Functions" × `supabase/schema-catalog.json` (168 tabelas, 12 views, 264 funções) e 82 pastas em `supabase/functions/`.
3. **COMPLETE_SYSTEM_FEATURES 20.13 `public/sw.js` ✅** × arquivo inexistente e `SERVICE_WORKER_ENABLED = false` (`src/config/service_worker.ts:7`).
4. **IMPROVEMENT_PLAN.md "🎉 PROJETO 100% COMPLETO"** × P1.2 (export removido), P1.14 (PWA desligado), P2.6 (interativo bloqueado, `useChatPanelHandlers.ts:421`), P3.3 (i18n sem consumidor), P3.9 (avatar IA removido).
5. **IMPROVEMENT_PLAN DB-1..8 e REFACTORING_REPORT (513 tabelas, `evolution_messages_*`)** apresentados como deste projeto × migrations `20260612*` estão em `supabase/migrations/_foreign/` (aplicadas em outro banco).
6. **FORGOTTEN #3** "Pipeline acessível via menu" × menu sem `pipeline`; `?view=pipeline` redireciona para Tarefas (`useNavigationHistory.ts:115`).
7. **FORGOTTEN #5** "n8n, Google Sheets, Sentry, Stripe" × hub com n8n/Sentry em demo + Bitrix24 (`IntegrationsHub.tsx:15-41`).
8. **FORGOTTEN #13** componentes cognitivos × `ErrorPrevention`/`SmartDefaults` removidos; `ProgressiveDisclosure.tsx` e `FeatureSpotlight.tsx` sem importador.
9. **FORGOTTEN #14** "API REST pública" × Edge 410 (`public-api/index.ts:7`).
10. **UX_AUDIT_REPORT F3.1 "PARCIALMENTE IMPLEMENTADO — wiring pendente"** × ações ligadas (`src/components/inbox/ConversationListSidebar.tsx:274-287`).
11. **UX_AUDIT_REPORT Fase 8 "[ABERTO] migrar de #view para ?view="** × `?view=` já é o formato canônico (`src/hooks/system/useNavigationHistory.ts:138-168`).
12. **WEBHOOK_EVENTS.md "🔴 NÃO IMPLEMENTADO": PRESENCE_UPDATE, CHATS_UPDATE, CONTACTS_UPDATE, LABELS_ASSOCIATION, CALL** × tratados em `evolution-webhook/index.ts:294-312`; **"Validação de assinatura (NÃO IMPLEMENTADO)"** × autenticação por `instanceToken` com padrão `token` (`index.ts:52-57,181`).
13. **EVOLUTION_WEBHOOKS_DOCUMENTATION §10.2** "LABELS_ASSOCIATION sincroniza o Pipeline" × handler grava tag (`evolution-webhook-handlers.ts:273-295`).
14. **CHANGELOG [Unreleased] "RLS migration 20260412230000 — Status: Pending application"** × arquivo movido para `supabase/migrations/_superseded/`.
15. **audit_report.md** "`recover-corrupted-audios` (pendente)" × Edge existe (`supabase/functions/recover-corrupted-audios/`, deploy listado em `deploy-functions.yml`).
16. **README "CSAT (pesquisa de satisfação)"** × sem coleta (L-12); **README "Geo-blocking"** × só no login (L-38); **README "campos customizáveis"** × sem tela (L-24).
17. **POP §7 atalhos**: `Ctrl+/` = "resposta rápida" × é "Ajuda de atalhos" (`src/hooks/shortcuts/defaultShortcuts.ts:24`); `Ctrl+Shift+T` = "tag" × é "Transferir" (`:30`); `Ctrl+Shift+E` = "encerrar" × é "Arquivar selecionados" (`:40`); `Ctrl+Shift+N` = "nova nota" × não existe. **POP §6.1 "Clicar em Inbox"** × menu se chama "Chat" (`navigation.service.ts:56`). **POP §8 KPI "CSAT > 90%"** × CSAT não é coletado.
18. **Doc in-app ("Documentação", `src/components/docs/featuresSectionsData.ts`)**: a tela marca como ativo tudo o que não for push (`:382-399`) e lista "Carrinho de compras", "Hook do carrinho" (`:155`), "Pesquisa CSAT" (`:143-147`) e "Agendar mensagem para envio futuro" (`:220`) — usuários veem como funcionando.
19. **FUNCTIONALITIES_INVENTORY** cita `NotificationCenter.tsx`, `ThemeToggle.tsx`, `ui/carousel.tsx`, `ui/input-otp.tsx`, `utils/notificationSound.ts` — inexistentes.
20. **TECHNICAL_DOCUMENTATION §9** descreve tabela `products` local e `ProductCard.tsx` × catálogo é externo (`ExternalProductManagement`, `src/types/externalDB.ts`); `useTags.ts` e `exportReport.ts` inexistentes.
21. **Issues #1265, #1266, #1267, #378, #382 abertas** × correções/estado já no repositório (ver 3.11).
22. **ADRs**: dois arquivos com ID ADR-003 em `docs/decisions/`; `docs/adr/` tem outra série ADR-001…007 com três ADR-007 — numeração não confiável.

---

## 5. Achados fora dos planos (varredura de código)

Método: grep de marcadores (TODO/FIXME/em breve/não implementado/demo/stub/flag), comparação menu × `VIEW_MAP`, grafo de importação
(105 arquivos de `src/` nunca importados: 70 sem nenhum importador + 35 só por testes), Edge sem chamador (src + migrations/cron +
outras Edges + workflows), objetos do `schema-catalog.json` sem uso em src/functions (118, dos quais a maioria é helper interno de RLS/trigger).
Resultado limpo: TODO/FIXME reais são raros (os 5 de migrations foram resolvidos depois: gamificação `20260930113613`, `set_conversation_status` `20260930090000`); todo item de menu tem view; `multiplix-dispatch` não tem mais ação 501 (`PENDING_ACTIONS = []`, `index.ts:429`).

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dep. |
|---|---|---|---|---|---|---|---|---|
| C-01 | Team Chat: sair/renomear grupo e transferir departamento | PARCIAL | (sem plano nesta área; ver área 03) | Header aceita `onLeaveGroup/onRenameGroup/onTransfer` (`src/components/team-chat/TeamChatHeader.tsx:55-80,223-236`) mas o painel não passa nenhum (`TeamChatPanel.tsx:100-104`); `leaveMutation` criado e não usado (`useTeamChatPanel.ts:92`); `GroupManagementDialog.tsx` e `TransferConversationDialog.tsx` sem importador | ligar os handlers | Usuário não consegue sair de grupo nem transferir conversa | P2 | — |
| C-02 | Team Chat: painel de performance | PARCIAL | — | Botão desabilitado "Performance (em breve)" (`TeamChatHeader.tsx:143-157`); `TeamPerformancePanel.tsx`, `ParticipantStatsGraph.tsx`, `useTeamPerformance` prontos e órfãos | ligar o painel | Supervisor sem métrica da equipe no chat interno | P3 | — |
| C-03 | Convite de departamento (aceite) | PARCIAL | — | Convites criados/excluídos (`src/hooks/team-chat/useDepartmentManagement.ts:105,141,163`); RPC `accept_department_invite` nunca chamada (só citada em comentário `:57-58`); tela bloqueada manda "Solicite um convite" (`TeamChatPanel.tsx:89-90`) | tela/link de aceite | Convite emitido não tem como ser usado | P2 | — |
| C-04 | Team Chat: RPCs E37–E49 sem consumidor | PARCIAL | (plano Team Chat — área 03) | `get_team_inbox`, `get_team_messages_page`, `search_team_messages`, `toggle_team_reaction`, `mark_team_conversation_read`, `leave_team_group`, `remove_team_member`, `set_team_member_pref`, `set_team_member_role`, `transfer_team_conversation_department` — 0 referências em src/functions; busca é feita só sobre mensagens carregadas (`TeamChatPanel.tsx:106-115`) | migrar o front ou dropar | Busca não acha mensagens antigas; superfície SQL exposta sem uso | P3 | — |
| C-05 | Encaminhar arquivo (aba Arquivos) | NAO_INICIADO | — | Botões desabilitados "Disponível em breve" (`src/components/inbox/tabs/FileCard.tsx:112-119`, `FileDetailPanel.tsx:82-84`, `FilesListView.tsx:116`, `FilesTableView.tsx:169`); `ForwardMessageDialog` existe para mensagens | ligar ao diálogo de encaminhar | Retrabalho para reenviar um documento | P3 | — |
| C-06 | Videochamada | NAO_INICIADO | — | Flag `video_call` desligada por padrão; quando ligada só mostra toast "Em breve" (`src/components/inbox/contact-details/ContactActionButtons.tsx:113,143-149`); `ChatHeader.tsx:152` idem (componente morto) | decisão de produto | — | P3 | decisão |
| C-07 | Histórico (Journey): ligações e e-mails | PARCIAL | PLANO_JOURNEY_HISTORICO S019–S029 (área 06) | `useJourneyCalls.ts`, `useJourneyEmails.ts`, `JourneyStatsHero.tsx`, `lib/journey/{model,stats,periodRange}.ts` só usados por testes; aba usa `useConversationHistoryTimeline` (`src/components/inbox/tabs/JourneyTab.tsx:84`) | ligar as fontes | Histórico do cliente sem ligações e e-mails | P2 | — |
| C-08 | Contagem de e-mails não lidos por contato | PARCIAL | PLANO_EMAIL_ALERTAS U02 (área 04) | `src/hooks/gmail/useContactUnreadEmails.ts` só em teste | ligar ao badge do contato | Atendente não vê e-mail pendente do cliente no chat | P3 | — |
| C-09 | "Histórico de envio" de mensagem | PARCIAL | SL-198 (paridade) | `MessageSendHistorySheet.tsx` só em teste | ligar no menu da mensagem | Sem diagnóstico de falha de entrega pelo atendente | P3 | — |
| C-10 | Painéis CRM no detalhe do contato | PARCIAL | CT-002 (área 04) | `ExternalContact360Panel.tsx`, `ContactIntelligencePanel.tsx` sem importador; `services/crm/singu-adapter.ts` só em teste | decidir/ligar | Dados do CRM Singu não aparecem onde planejado | P3 | flag `crm.integration` |
| C-11 | Talk X: peças prontas não ligadas | PARCIAL | Plano Talk X V4 (área 01) | Só em testes: `TalkXCampaignPaused.tsx` (X156), `TalkXInteractiveEditor.tsx` (X096), `TalkXMediaDropzone.tsx` (X095), `tracking/TalkXKeyMetricsCard.tsx`, `tracking/TalkXSentSummaryChart.tsx`, `useTalkXCampaignList.ts` (X078), `talkxCampaignDraft.ts`; Edge `talkx-ai` (X076) sem chamador; RPCs `talkx_upsert_link`, `talkx_delete_link`, `talkx_set_campaign_investment`, `talkx_segment_tags`, `talkx_campaign_pace` sem uso; tabelas `talkx_alerts`, `talkx_conversions`, `talkx_campaign_segments` sem uso no app; filtro A9 desabilitado (`TalkXAudienceFilters.tsx:279`) | ligação de UI | Recursos de campanha (pausa, mídia, botões, links, ROI, IA) não chegam ao usuário | P2 | — |
| C-12 | Multiplix: vozes, retornos e fila de falhas | PARCIAL | Plano Multiplix (área 01) | Edge `multiplix-voices` sem chamador; `useMultiplixReplies.ts` só em teste; `list/count_multiplix_dead_letters` sem tela; tabelas `multiplix_audiences`/`_members` sem uso | telas | Operador não vê respostas nem falhas do disparo | P2 | — |
| C-13 | Multiplix: 7 RPCs `*_recipient` legadas | PARCIAL | — | Substituídas pelas `*_item` usadas em `multiplix-send` (migration `20261001231230`); `claim/complete/record/release/reschedule/mark_dispatch_started/persist_snapshot_multiplix_recipient` sem referência | drop | Dívida/superfície SQL | P3 | — |
| C-14 | Agente de voz conversacional (ElevenLabs ConvAI) | NAO_INICIADO | — | Edge `elevenlabs-agent-token` sem chamador; `@elevenlabs/react` no package.json (`:34`) sem import em src | decidir ou remover | Custo de cota sem uso; dependência morta | P3 | — |
| C-15 | `external-db-bridge` | PARCIAL | — | Edge com allowlist de tabelas, sem nenhum chamador (o front usa `external-db-proxy`, `src/lib/externalProxy.ts:33`) | remover ou usar | Superfície com service role sem uso | P3 | — |
| C-16 | Código morto de UI | PARCIAL | — | 70 arquivos sem importador, entre eles `inbox/{LinkPreview,SentimentIndicator,AIToolsPopover,MessageContextMenu,MessagePreview,SpeedSelector,SwipeableListItem,TemplatesWithVariables}.tsx`, `inbox/chat/{index.ts,ChatHeaderToolbar.tsx}` (logo `ChatHeader` também morto), `dashboard/{DraggableWidgetContainer,SatisfactionAgentRanking,MetricComparison,TrendIndicator,MetricComponents}.tsx`, `gamification/AchievementDetailDialog.tsx`, `a11y/KeyboardNavigation.tsx`, `effects/{ParallaxContainer,ScrollEffects}.tsx`, `reports/ScheduledReportsManager.tsx`, `tasks/useMyTasks.ts`, 10 `ui/*` (form, menubar, pagination, resizable, sidebar…), 17 barris `hooks/*/index.ts` | limpeza | Confunde quem audita ("existe componente" ≠ funcionalidade) | P3 | — |
| C-17 | Documentação dentro do app | DIVERGENTE | — | Ver divergência 18 (`featuresSectionsData.ts:143-155,220,382-399`) | gates por estado real (já existe o padrão para push) | Usuário/gestor acredita em funcionalidade inexistente | P2 | — |
| C-18 | Configuração WhatsApp por departamento | PARCIAL | — | `get/set_department_whatsapp_config`, `get_department_whatsapp_api_key`, `get_department_whatsapp_credentials` sem consumidor; front só lê `get_department_whatsapp_mode` (`useDepartmentManagement.ts`) | tela ou drop | Departamento não configura número próprio | P3 | — |
| C-19 | Prévia de links no chat (proxy de saída) | BLOQUEADO | runbook `preview-egress-proxy.md` | Código do proxy pronto (`infrastructure/preview-egress-proxy/`), Edge exige `PREVIEW_EGRESS_PROXY_URL`/`SHARED_SECRET` (`supabase/functions/_shared/secure-egress.ts:97-99`); runbook lista pré-requisitos de DNS/TLS/Traefik "não promover enquanto…" | deploy na VPS + segredos | Links aparecem sem cartão de prévia | P3 | infra VPS (Joaquim) |
| C-20 | Sincronização com CRM (outbox → Singu) | BLOQUEADO | CLAUDE.md (reativação deliberada) | Flag `crm.integration` lida na Edge (`supabase/functions/crm-integration/index.ts:522-525`); schedule do `crm-sync-worker.yml` comentado (`vars.CRM_SYNC_WORKER_ENABLED`) | decisão de reativar | Contatos não sobem para o CRM | P2 | decisão do dono |

Não verificado (registrado para outra área): flags `contacts.v2.*` caem para **desligado em produção** quando não há linha em `feature_flags` (`src/hooks/contacts/useContactsV2Flags.ts:15-16,42-47`) e o comentário diz que "as telas v2 ainda não existem (chegam a partir de CT-006)" (`:19`) — conferir na área 04.

---

## 6. Top 10 da área

1. **Mensagens agendadas não têm quem as envie** — UI e calendário prontos, nenhum processador no repositório nem no `pg_cron` de produção; latente porque a tabela está vazia (L-01).
2. **Chatbot / Chatbot L1 não disparam em mensagem recebida** — só existe o botão de teste (L-04).
3. **CSAT não é coletado** — pesquisa removida, nada envia nem lê nota; KPI do POP e dashboards sem dado (L-12).
4. **Campanhas Clássicas "Iniciar" não envia nada** — status fica "enviando" para sempre; motor real é o Talk X (L-11).
5. **Automações, follow-up e mensagem de ausência sem executor** — regras salvas que não rodam (L-05, L-06, L-07).
6. **Mensagens interativas (botões/listas) bloqueadas no chat** apesar de builder e rota na Edge (L-02).
7. **Domínio oficial `zappweb.app.br` fora do CORS** — PR #1899 aberto; app nesse domínio quebra todas as Edges (I-1899).
8. **Auto-fechamento e relatórios agendados sem agendador versionado** — dependem de cron externo não comprovado (L-09, L-19).
9. **PII enviada à IA sem mascaramento** (CPF/cartão) — item P0 da auditoria de maio nunca feito (L-40).
10. **Docs (COMPLETE_SYSTEM_FEATURES, IMPROVEMENT_PLAN, README, doc in-app e POP) afirmam 100%** enquanto ~15 telas são fachada (pagamentos, Meta CAPI, Google Calendar, n8n, Sentry, WhatsApp Flows, omnichannel IG/Telegram, templates "aprovado local", PWA/push, i18n) e o Team Chat tem sair/transferir/aceitar convite sem fiação (§4, C-01, C-03, C-17).
