# 🔍 Relatório de Funcionalidades Esquecidas / Não Documentadas

> **Data:** 2026-03-17  
> **Auditor:** Lovable AI  
> **Método:** Cruzamento entre código existente, tabelas do banco e documentação oficial (`COMPLETE_SYSTEM_FEATURES.md`)

---

## 🚨 Resumo Executivo

Foram encontrados **14 módulos/funcionalidades completos** que existem no código e no banco de dados, estão acessíveis na navegação do sistema, mas **NÃO estão documentados** nas 34 seções do `COMPLETE_SYSTEM_FEATURES.md`. Além disso, **5 Edge Functions** existem mas não constam na documentação.

---

## 📋 Módulos Implementados mas NÃO Documentados

### 🔴 1. Campanhas de Mensagens em Massa
- **Componente:** `src/components/campaigns/CampaignsView.tsx` (345 linhas)
- **Hook:** `src/hooks/useCampaigns.ts`
- **Tabelas:** `campaigns`, `campaign_contacts`
- **Navegação:** ✅ Acessível via menu lateral (`case 'campaigns'`)
- **Funcionalidades:** CRUD de campanhas, envio em massa, status (draft/scheduled/sending/completed/cancelled/paused), progresso, intervalo entre envios, filtros por status

### 🔴 2. Chatbot / Fluxos Automatizados
- **Componentes:** `src/components/chatbot/ChatbotFlowsView.tsx` (305 linhas), `ChatbotFlowEditor.tsx`
- **Hook:** `src/hooks/useChatbotFlows.ts`
- **Tabelas:** `chatbot_flows`, `chatbot_executions`
- **Edge Function:** `supabase/functions/chatbot-l1/`
- **Navegação:** ✅ Acessível via menu lateral (`case 'chatbot'`)
- **Funcionalidades:** CRUD de fluxos, editor visual de nós, triggers (keyword/first_message/menu/webhook/schedule), ativação/desativação, contagem de execuções

### 🔴 3. Pipeline de Vendas (CRM)
- **Componente:** `src/components/pipeline/SalesPipelineView.tsx` (462 linhas)
- **Tabelas:** `sales_deals`, `deal_activities`, `pipeline_stages`
- **Navegação:** ✅ Acessível via menu lateral (`case 'pipeline'`)
- **Funcionalidades:** Kanban de deals, estágios configuráveis, drag & drop, valores monetários, prioridades, atividades de deal, atribuição a agente

### 🔴 4. Base de Conhecimento (Knowledge Base)
- **Componente:** `src/components/knowledge/KnowledgeBaseView.tsx` (367 linhas)
- **Tabelas:** `knowledge_base_articles`, `knowledge_base_files`
- **Navegação:** ✅ Acessível via menu lateral (`case 'knowledge'`)
- **Funcionalidades:** CRUD de artigos, categorias, tags, upload de arquivos, status de publicação, status de embedding para IA

### 🔴 5. Hub de Integrações
- **Componentes:** `src/components/integrations/IntegrationsHub.tsx`, `N8nIntegrationView.tsx`, `GoogleSheetsIntegrationView.tsx`, `SentryIntegrationView.tsx`
- **Navegação:** ✅ Acessível via menu lateral (`case 'integrations'`)
- **Funcionalidades:** Hub centralizado com 4 integrações (n8n, Google Sheets, Sentry, Stripe como "coming soon")

### 🔴 6. Links de Pagamento
- **Componente:** `src/components/payments/PaymentLinksView.tsx` (251 linhas)
- **Tabela:** `payment_links`
- **Navegação:** ✅ Acessível via menu lateral (`case 'payments'`)
- **Funcionalidades:** CRUD de links de pagamento, PIX/Boleto/Cartão, valores, status (pending/paid/expired/cancelled), copiar link, enviar ao contato

### 🔴 7. Conformidade LGPD
- **Componente:** `src/components/compliance/LGPDComplianceView.tsx` (228 linhas)
- **Navegação:** ✅ Acessível via menu lateral (`case 'privacy'`)
- **Funcionalidades:** Exportação de dados pessoais (portabilidade), exclusão de dados (direito ao esquecimento), download JSON dos dados

### 🔴 8. WhatsApp Flows Builder
- **Componente:** `src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` (416 linhas)
- **Tabela:** `whatsapp_flows` (se existir)
- **Navegação:** ✅ Acessível via menu lateral (`case 'wa-flows'`)
- **Funcionalidades:** Construtor visual de WhatsApp Flows (formulários interativos), componentes (TextInput, TextArea, DatePicker, RadioButtons, Checkbox, Dropdown, Image, OptIn), preview tipo smartphone

### 🔴 9. Diagnósticos do Sistema
- **Componente:** `src/components/diagnostics/DiagnosticsView.tsx` (722 linhas)
- **Navegação:** ✅ Acessível via menu lateral (`case 'diagnostics'`)
- **Funcionalidades:** Status de conexões, diagnóstico de mensagens (taxa de entrega/falha), saúde do sistema (database/edge functions/storage/realtime), mensagens falhadas recentes

### 🔴 10. Meta CAPI (Conversions API)
- **Componente:** `src/components/meta-capi/MetaCAPIView.tsx` (245 linhas)
- **Tabela:** `meta_capi_events`
- **Navegação:** ✅ Acessível via menu lateral (`case 'meta-capi'`)
- **Funcionalidades:** Eventos de conversão (Purchase, Lead, InitiateCheckout, AddToCart, ViewContent, Contact), Pixel ID, auto-tracking, envio para Meta

### 🔴 11. Gestão de Agentes
- **Componente:** `src/components/agents/AgentsView.tsx`
- **Navegação:** ✅ Acessível via menu lateral
- **Funcionalidades:** Visualização e gestão de agentes/atendentes

### 🔴 12. Sequências de Follow-up
- **Componente:** `src/components/settings/FollowUpSequences.tsx`
- **Tabelas:** `followup_sequences`, `followup_steps`, `followup_executions`
- **Funcionalidades:** CRUD de sequências automatizadas, passos com delay em horas, template de mensagem por passo, ativação/desativação, tracking de execuções

### 🔴 13. Componentes Cognitivos (UX Avançada)
- **Componentes:** `src/components/cognitive/ErrorPrevention.tsx`, `ProgressiveDisclosure.tsx`, `SmartDefaults.tsx`, `index.ts`
- **Funcionalidades:** Prevenção de erros, revelação progressiva de informação, defaults inteligentes — padrões de UX cognitiva

### 🔴 14. API Pública (Public API)
- **Edge Function:** `supabase/functions/public-api/`
- **Funcionalidades:** API REST pública para integrações externas com o sistema

---

## 📦 Edge Functions Não Documentadas

| Edge Function | Descrição Provável |
|---|---|
| `ai-auto-tag` | Classificação automática de conversas por IA |
| `ai-enhance-message` | Aprimoramento de mensagens por IA |
| `chatbot-l1` | Motor de chatbot nível 1 (atendimento automático) |
| `public-api` | API pública para integrações externas |
| `send-email` | Envio de emails transacionais |

**Edge Functions documentadas:** 19  
**Edge Functions existentes:** 24  
**Faltando na documentação:** 5

---

## ⚠️ Inconsistências na Documentação

### IMPROVEMENT_PLAN.md — Contradições
O cabeçalho do documento declara **"P2: 18/18 ✅ 100% CONCLUÍDO!"**, mas várias tarefas P2 ainda mostram **"⏳ Pendente"** no corpo do documento:

| Item | Nome | Status Declarado |
|---|---|---|
| 3.1 | Editor de Mensagem Rico | ⏳ Pendente |
| 3.4 | Integração com Google Calendar | ⏳ Pendente |
| 3.9 | Temas Personalizados | ⏳ Pendente |
| 3.10 | Integração VoIP nativa | ⏳ Pendente |
| 3.11 | Builder Visual de Automações | ⏳ Pendente |
| 3.12 | NPS periódico | ⏳ Pendente |
| 3.13 | 2FA via Authenticator (completar) | ⏳ Pendente |
| 3.14 | App Shortcuts PWA | ⏳ Pendente |
| 3.15 | Filtros Salvos compartilháveis | ⏳ Pendente |
| 3.16 | Bulk Actions melhorados | ⏳ Pendente |
| 3.17 | Atalhos Contextuais | ⏳ Pendente |
| 3.18 | Export Automático | ⏳ Pendente |

### Contagem de Tabelas
- Documentação diz **"28+ tabelas"** na seção 33
- O `types.ts` real contém **55+ tabelas**
- Tabelas não listadas na doc: `campaigns`, `campaign_contacts`, `chatbot_flows`, `chatbot_executions`, `sales_deals`, `deal_activities`, `pipeline_stages`, `knowledge_base_articles`, `knowledge_base_files`, `payment_links`, `meta_capi_events`, `followup_sequences`, `followup_steps`, `followup_executions`, `csat_auto_config`, `contact_custom_fields`, `entity_versions`, `global_settings`, `agent_skills`

---

## 📊 Resumo Final

| Métrica | Valor |
|---|---|
| **Módulos implementados não documentados** | **14** |
| **Edge Functions não documentadas** | **5** |
| **Tabelas não listadas na documentação** | **~19** |
| **Itens P2 marcados "concluído" mas pendentes** | **12** |
| **Total de lacunas de documentação** | **~50 itens** |

---

## 🎯 Recomendação

A documentação `COMPLETE_SYSTEM_FEATURES.md` precisa ser atualizada para incluir seções para:
- 35: Campanhas de Mensagens em Massa
- 36: Chatbot / Fluxos Automatizados
- 37: Pipeline de Vendas (CRM)
- 38: Base de Conhecimento
- 39: Hub de Integrações (n8n, Google Sheets, Sentry)
- 40: Links de Pagamento
- 41: Conformidade LGPD
- 42: WhatsApp Flows Builder
- 43: Diagnósticos do Sistema
- 44: Meta Conversions API (CAPI)
- 45: Gestão de Agentes
- 46: Sequências de Follow-up
- 47: API Pública
- 48: Componentes Cognitivos (UX)

---

> **Auditor:** Lovable AI  
> **Data:** 2026-03-17  
> **Conclusão:** O sistema tem **significativamente mais funcionalidades** do que o documentado. Existem 14 módulos completos "esquecidos" que precisam ser reconhecidos e documentados.
