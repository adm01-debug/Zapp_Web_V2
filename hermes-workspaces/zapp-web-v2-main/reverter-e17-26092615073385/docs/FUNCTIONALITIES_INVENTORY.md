# Inventário Completo de Funcionalidades e Ferramentas

> **Projeto:** WhatsApp CRM  
> **Última Atualização:** 2025-01-24  
> **Versão:** 1.0.0

---

## 📋 Índice

1. [Stack Base](#1-stack-base)
2. [Design System](#2-design-system)
3. [Autenticação e Autorização](#3-autenticação-e-autorização)
4. [Sistema de Mensagens WhatsApp](#4-sistema-de-mensagens-whatsapp)
5. [Áudio e Transcrição](#5-áudio-e-transcrição)
6. [Inteligência Artificial](#6-inteligência-artificial)
7. [Dashboards e Relatórios](#7-dashboards-e-relatórios)
8. [Localização e Mapas](#8-localização-e-mapas)
9. [Gamificação](#9-gamificação)
10. [SLA e Filas](#10-sla-e-filas)
11. [Notificações](#11-notificações)
12. [Padrões de UX/UI](#12-padrões-de-uxui)
13. [Atalhos de Teclado](#13-atalhos-de-teclado)
14. [Integrações Externas](#14-integrações-externas)
15. [Segurança e Auditoria](#15-segurança-e-auditoria)
16. [Estado e Fetching de Dados](#16-estado-e-fetching-de-dados)
17. [Banco de Dados](#17-banco-de-dados)
18. [Edge Functions](#18-edge-functions)
19. [Estrutura de Pastas](#19-estrutura-de-pastas)
20. [Secrets Configurados](#20-secrets-configurados)

---

## 1. Stack Base

| Funcionalidade | Ferramenta | Versão | Arquivo/Uso |
|----------------|------------|--------|-------------|
| Framework Frontend | React | ^18.3.1 | `src/main.tsx` |
| Bundler | Vite | ^5.4.1 | `vite.config.ts` |
| Tipagem | TypeScript | - | `tsconfig.json` |
| Estilização | Tailwind CSS | ^3.4.11 | `tailwind.config.ts` |
| Roteamento | react-router-dom | ^6.30.1 | `src/App.tsx` |
| Backend/DB | Supabase (Lovable Cloud) | ^2.87.1 | `src/integrations/supabase/` |

---

## 2. Design System

| Funcionalidade | Ferramenta | Versão | Arquivo/Uso |
|----------------|------------|--------|-------------|
| Componentes Base | shadcn/ui + Radix UI | Múltiplas | `src/components/ui/` (60 componentes) |
| Temas Dark/Light | next-themes | ^0.3.0 | `src/components/theme/ThemeToggle.tsx` |
| Variáveis CSS | CSS Variables HSL | - | `src/index.css` |
| Tipografia | Google Fonts (customizada) | - | `index.html` |
| Ícones | lucide-react | ^0.462.0 | Usado em todo o projeto |
| Animações | framer-motion | ^12.23.26 | `src/components/ui/motion.tsx` |
| Animações CSS | tailwindcss-animate | ^1.0.7 | `tailwind.config.ts` |
| Variantes de Componentes | class-variance-authority (CVA) | ^0.7.1 | `src/components/ui/button.tsx` |
| Merge de Classes | clsx + tailwind-merge | ^2.1.1 / ^2.6.0 | `src/lib/utils.ts` |

### Componentes UI Disponíveis (60 total)

```
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb,
button, calendar, card, carousel, chart, checkbox, collapsible, command,
context-menu, dialog, drawer, dropdown-menu, empty-state, empty-states,
enhanced-input, focus-trap, form, hover-card, icon-button, input, input-otp,
label, menubar, micro-interactions, mobile-components, motion, navigation-menu,
pagination, popover, progress, radio-group, resizable, scroll-area, select,
separator, sheet, sidebar, skeleton, skip-link, slider, sonner, switch,
table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip,
use-toast, visually-hidden, accessible-toast
```

---

## 3. Autenticação e Autorização

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Autenticação de Usuários | Supabase Auth | `src/hooks/useAuth.tsx` |
| Políticas RLS | Supabase RLS + Roles DB | `user_roles` table |
| Verificação de Roles | Função SQL `has_role()` | `supabase/migrations/` |
| Níveis de Acesso | Custom (admin, supervisor, agent) | `src/hooks/useUserRole.ts` |
| Força de Senha | Componente Custom | `src/components/auth/PasswordStrengthMeter.tsx` |
| Validação de Formulários | zod + react-hook-form | `src/pages/Auth.tsx` |
| Auto-confirm Email | Supabase Config | `supabase/config.toml` |

### Componentes de Auth
- `src/components/auth/HeroBenefits.tsx` - Benefícios exibidos na tela de login
- `src/components/auth/PasswordInput.tsx` - Input de senha com toggle de visibilidade
- `src/components/auth/PasswordStrengthMeter.tsx` - Indicador de força da senha
- `src/components/auth/SocialProof.tsx` - Prova social na tela de login

---

## 4. Sistema de Mensagens WhatsApp

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Conexão WhatsApp | Evolution API | `supabase/functions/evolution-api/` |
| Webhook Recebimento | Edge Function | `supabase/functions/evolution-webhook/` |
| Webhook Cloud API | Edge Function | `supabase/functions/whatsapp-webhook/` |
| Mensagens Realtime | Supabase Realtime | `src/hooks/useRealtimeMessages.ts` |
| Status de Mensagem | Custom Hook | `src/hooks/useMessageStatus.ts` |
| Reações a Mensagens | Custom + DB | `src/hooks/useMessageReactions.ts` |
| Resposta/Quote | Componente Custom | `src/components/inbox/ReplyQuote.tsx` |
| Encaminhar Mensagem | Dialog Custom | `src/components/inbox/ForwardMessageDialog.tsx` |
| Agendamento | Custom + DB | `src/hooks/useScheduledMessages.ts` |
| Templates | Custom + DB | `src/components/inbox/MessageTemplates.tsx` |
| Respostas Rápidas | Custom + DB | `src/hooks/useQuickReplies.ts` |
| Mensagens Interativas | Componente Custom | `src/components/inbox/InteractiveMessage.tsx` |
| Preview de Links | Componente Custom | `src/components/inbox/LinkPreview.tsx` |
| Upload de Arquivos | Componente Custom | `src/components/inbox/FileUploader.tsx` |
| Indicador de Digitação | Realtime + Custom | `src/hooks/useTypingPresence.ts` |

### Componentes de Inbox (46 total)

```
AIConversationAssistant, AISuggestions, AudioMessagePlayer, AudioRecorder,
BulkActionsToolbar, ChatPanel, ContactDetails, ConversationContextMenu,
ConversationHistory, ConversationList, ConversationSummary, FileUploader,
ForwardMessageDialog, GlobalSearch, ImagePreview, InboxFilters,
InteractiveMessage, InteractiveMessageBuilder, KeyboardShortcutsHelp,
LinkPreview, LocationMessage, LocationPicker, MediaPreview, MessageContextMenu,
MessageReactions, MessageStatus, MessageTemplates, NewMessageIndicator,
PrivateNotes, QuickRepliesManager, RealtimeInboxView, RealtimeTranscription,
ReplyQuote, SLAIndicator, ScheduleMessageDialog, SentimentIndicator,
SlashCommands, SpeedSelector, SwipeableListItem, TextToSpeechButton,
TransferDialog, TypingIndicator, VirtualizedConversationList,
VirtualizedMessageList, VirtualizedRealtimeList, VoiceSelector
```

---

## 5. Áudio e Transcrição

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Text-to-Speech | ElevenLabs API | `supabase/functions/elevenlabs-tts/` |
| Transcrição de Áudio | ElevenLabs Scribe | `supabase/functions/ai-transcribe-audio/` |
| Token Realtime | Edge Function | `supabase/functions/elevenlabs-scribe-token/` |
| Gravação de Áudio | Web Audio API | `src/hooks/useAudioRecorder.ts` |
| Player de Áudio | Componente Custom | `src/components/inbox/AudioMessagePlayer.tsx` |
| Seletor de Velocidade | Componente Custom | `src/components/inbox/SpeedSelector.tsx` |
| Seletor de Voz | Componente Custom | `src/components/inbox/VoiceSelector.tsx` |
| Hook TTS | Custom Hook | `src/hooks/useTextToSpeech.ts` |
| SDK ElevenLabs | @elevenlabs/react | `^0.12.3` |

---

## 6. Inteligência Artificial

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Sugestão de Respostas | Lovable AI (Gemini/GPT) | `supabase/functions/ai-suggest-reply/` |
| Resumo de Conversa | Lovable AI | `supabase/functions/ai-conversation-summary/` |
| Análise de Conversa | Lovable AI | `supabase/functions/ai-conversation-analysis/` |
| Análise de Sentimento | Custom + AI | `supabase/functions/sentiment-alert/` |
| UI Sentimento | Componente Custom | `src/components/inbox/SentimentIndicator.tsx` |
| Assistente AI | Componente Custom | `src/components/inbox/AIConversationAssistant.tsx` |
| Acesso Rápido AI | Componente Custom | `src/components/dashboard/AIQuickAccess.tsx` |

### Modelos Suportados (via Lovable AI Gateway)
- `google/gemini-2.5-pro` - Multimodal + raciocínio complexo
- `google/gemini-2.5-flash` - Balanceado custo/qualidade
- `google/gemini-2.5-flash-lite` - Mais rápido e econômico
- `openai/gpt-5` - Alta precisão
- `openai/gpt-5-mini` - Custo reduzido
- `openai/gpt-5-nano` - Alta velocidade

---

## 7. Dashboards e Relatórios

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Gráficos | Recharts | ^2.15.4 | `src/components/dashboard/` |
| Dashboard Principal | Custom | `src/components/dashboard/DashboardView.tsx` |
| Dashboard SLA | Custom | `src/components/dashboard/SLAMetricsDashboard.tsx` |
| Dashboard Metas | Custom | `src/components/dashboard/GoalsDashboard.tsx` |
| Comparação de Filas | Custom | `src/components/queues/QueuesComparisonDashboard.tsx` |
| Relatórios Avançados | Custom | `src/components/reports/AdvancedReportsView.tsx` |
| Exportar PDF | jsPDF + jspdf-autotable | ^3.0.4 / ^5.0.2 |
| Exportar Excel | xlsx | ^0.18.5 |
| Exportar CSV | Custom Utility | `src/utils/exportReport.ts` |
| Indicador de Tendência | Custom | `src/components/dashboard/TrendIndicator.tsx` |

---

## 8. Localização e Mapas

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Mapa Interativo | Mapbox GL JS | ^3.17.0 |
| Token Mapbox | Edge Function | `supabase/functions/get-mapbox-token/` |
| Seletor de Localização | Custom | `src/components/inbox/LocationPicker.tsx` |
| Mensagem de Localização | Custom | `src/components/inbox/LocationMessage.tsx` |

---

## 9. Gamificação

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Sistema XP/Níveis | Custom + DB | `src/hooks/useAgentGamification.ts` |
| Conquistas/Badges | Custom + DB | `src/components/gamification/AchievementBadge.tsx` |
| Leaderboard | Custom + DB | `src/components/leaderboard/Leaderboard.tsx` |
| Efeitos de Confetti | Custom | `src/components/effects/Confetti.tsx` |
| Toast de Conquista | Custom | `src/components/gamification/AchievementToast.tsx` |
| Provider Gamificação | React Context | `src/components/gamification/GamificationProvider.tsx` |
| Cálculo de Nível | Função SQL | `calculate_level()` |

### Componentes de Gamificação
- `AchievementBadge.tsx` - Badge visual de conquista
- `AchievementToast.tsx` - Notificação de conquista
- `AchievementsPanel.tsx` - Painel de todas as conquistas
- `DemoAchievements.tsx` - Demo de conquistas
- `GamificationProvider.tsx` - Context provider

---

## 10. SLA e Filas

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Configuração SLA | Custom + DB | `sla_configurations` table |
| Tracking SLA | Custom + DB | `conversation_sla` table |
| Histórico SLA | Custom + DB | `src/hooks/useSLAHistory.ts` |
| Notificações SLA | Custom | `src/hooks/useSLANotifications.ts` |
| Indicador SLA | Custom | `src/components/inbox/SLAIndicator.tsx` |
| Gestão de Filas | Custom + DB | `src/hooks/useQueues.ts` |
| Metas de Fila | Custom + DB | `src/hooks/useQueueGoals.ts` |
| Analytics de Fila | Custom | `src/hooks/useQueueAnalytics.ts` |

### Componentes de Filas
- `AddMemberDialog.tsx` - Adicionar membro à fila
- `CreateQueueDialog.tsx` - Criar nova fila
- `PeriodSelector.tsx` - Seletor de período
- `QueueAlertsDisplay.tsx` - Alertas da fila
- `QueueCharts.tsx` - Gráficos da fila
- `QueueGoalsDialog.tsx` - Configurar metas
- `QueuesComparisonDashboard.tsx` - Comparar filas
- `QueuesView.tsx` - Visualização principal
- `SLADashboard.tsx` - Dashboard SLA

---

## 11. Notificações

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Push Notifications | Service Worker + Web Push | `public/sw.js` |
| Notificação Browser | Web Notification API | `src/hooks/usePushNotifications.ts` |
| Central de Notificações | Custom | `src/components/notifications/NotificationCenter.tsx` |
| Sons de Notificação | Custom Utility | `src/utils/notificationSound.ts` |
| Configurações | Custom Hook | `src/hooks/useNotificationSettings.ts` |
| Toasts | Sonner | ^1.7.4 |
| Alertas de Sentimento | Realtime + Custom | `src/components/notifications/RealtimeSentimentAlertProvider.tsx` |

### Tipos de Sons Disponíveis
- `message` - Nova mensagem
- `mention` - Menção
- `sla` - Alerta SLA
- `goal` - Meta atingida
- `transcription` - Transcrição completa

---

## 12. Padrões de UX/UI

| Funcionalidade | Ferramenta | Versão | Arquivo/Uso |
|----------------|------------|--------|-------------|
| Drag and Drop | @hello-pangea/dnd | ^17.0.0 | Widgets do dashboard |
| Lista Virtualizada | @tanstack/react-virtual | ^3.13.13 | `VirtualizedMessageList.tsx` |
| Painéis Redimensionáveis | react-resizable-panels | ^2.1.9 | Layout do inbox |
| Calendário/Datepicker | react-day-picker | ^8.10.1 | `src/components/ui/calendar.tsx` |
| Command Palette | cmdk | ^1.1.1 | `src/components/ui/command.tsx` |
| Carousel | embla-carousel-react | ^8.6.0 | `src/components/ui/carousel.tsx` |
| Drawer Mobile | vaul | ^0.9.9 | `src/components/ui/drawer.tsx` |
| Swipe Actions | Custom | - | `src/components/inbox/SwipeableListItem.tsx` |
| Skeleton Loading | Custom + Radix | - | `src/components/skeletons/` |
| Scroll Suave | Radix Scroll Area | - | `src/components/ui/scroll-area.tsx` |
| Parallax | Custom Hook | - | `src/hooks/useParallax.ts` |
| OTP Input | input-otp | ^1.4.2 | `src/components/ui/input-otp.tsx` |

---

## 13. Atalhos de Teclado

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Atalhos Globais | Custom Hook | `src/hooks/useGlobalKeyboardShortcuts.ts` |
| Atalhos Customizáveis | Custom Hook | `src/hooks/useCustomShortcuts.ts` |
| Busca Global | Custom Hook | `src/hooks/useGlobalSearchShortcut.ts` |
| Provider de Teclado | React Context | `src/components/keyboard/GlobalKeyboardProvider.tsx` |
| Dialog de Atalhos | Custom | `src/components/keyboard/KeyboardShortcutsDialog.tsx` |
| Ajuda de Atalhos | Custom | `src/components/inbox/KeyboardShortcutsHelp.tsx` |

---

## 14. Integrações Externas

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| CRM Bitrix24 | Bitrix24 API | `supabase/functions/bitrix-api/` |
| WhatsApp | Evolution API | `supabase/functions/evolution-api/` |
| Voz/TTS | ElevenLabs API | `supabase/functions/elevenlabs-tts/` |
| Mapas | Mapbox API | `supabase/functions/get-mapbox-token/` |
| IA | Lovable AI Gateway | Edge Functions de AI |

### Hooks de Integração
- `useBitrixApi.ts` - Integração Bitrix24
- `useEvolutionApi.ts` - Integração Evolution API

---

## 15. Segurança e Auditoria

| Funcionalidade | Ferramenta | Arquivo/Uso |
|----------------|------------|-------------|
| Logs de Auditoria | Custom + DB | `src/lib/audit.ts` |
| RLS Policies | Supabase RLS | Migrations |
| RBAC | Funções SQL | `has_role()`, `is_admin_or_supervisor()` |
| Força de Senha | Custom | `PasswordStrengthMeter.tsx` |

### Funções de Auditoria
```typescript
// src/lib/audit.ts
logAudit(action, entityType, entityId, details)
logLogin(userId)
logLogout(userId)
logCreate(entityType, entityId, details)
logUpdate(entityType, entityId, details)
logDelete(entityType, entityId, details)
```

---

## 16. Estado e Fetching de Dados

| Funcionalidade | Ferramenta | Versão | Arquivo/Uso |
|----------------|------------|--------|-------------|
| Estado do Servidor | TanStack Query | ^5.83.0 | Todos os hooks de dados |
| Formulários | react-hook-form | ^7.61.1 | Forms do projeto |
| Validação | zod | ^3.25.76 | Schemas de validação |
| Resolvers | @hookform/resolvers | ^3.10.0 | Integração zod + form |
| Manipulação de Datas | date-fns | ^3.6.0 | Formatação de datas |
| Debounce | Custom Hook | - | `src/hooks/useDebounce.ts` |

---

## 17. Banco de Dados

### Tabelas (24 total)

| Tabela | Função | Campos Principais |
|--------|--------|-------------------|
| `profiles` | Perfis de usuário | id, user_id, name, email, role, access_level |
| `user_roles` | Roles RBAC | id, user_id, role (enum) |
| `user_settings` | Configurações | theme, notifications, business_hours, etc. |
| `contacts` | Contatos WhatsApp | name, phone, email, assigned_to, queue_id |
| `messages` | Mensagens | content, sender, contact_id, status, media_url |
| `message_reactions` | Reações | message_id, emoji, user_id |
| `message_templates` | Templates | title, content, category, shortcut |
| `scheduled_messages` | Agendadas | content, scheduled_at, status |
| `whatsapp_connections` | Conexões WA | name, phone, instance_id, status |
| `whatsapp_groups` | Grupos WA | name, group_id, participant_count |
| `business_hours` | Horários | day_of_week, open_time, close_time |
| `away_messages` | Ausência | content, is_enabled |
| `queues` | Filas | name, color, priority, max_wait_time |
| `queue_members` | Membros | queue_id, profile_id, is_active |
| `queue_goals` | Metas | max_wait, max_pending, min_assignment_rate |
| `tags` | Tags | name, color, description |
| `contact_tags` | Relação Tag-Contato | contact_id, tag_id |
| `contact_notes` | Notas Privadas | content, contact_id, author_id |
| `sla_configurations` | Config SLA | name, first_response_minutes, resolution_minutes |
| `conversation_sla` | Tracking SLA | first_response_at, resolved_at, breached |
| `conversation_analyses` | Análises AI | sentiment, summary, topics, urgency |
| `goals_configurations` | Config Metas | goal_type, daily/weekly/monthly_target |
| `agent_stats` | Stats Gamificação | xp, level, streak, messages_sent |
| `agent_achievements` | Conquistas | achievement_type, xp_earned, earned_at |
| `calls` | Chamadas | direction, duration, status, recording_url |
| `products` | Catálogo | name, price, sku, stock_quantity |
| `client_wallet_rules` | Carteira | agent_id, priority, is_active |
| `audit_logs` | Auditoria | action, entity_type, entity_id, details |
| `notifications` | Notificações | title, message, type, is_read |

---

## 18. Edge Functions

### Funções Disponíveis (12 total)

| Função | Serviço | Propósito |
|--------|---------|-----------|
| `ai-conversation-analysis` | Lovable AI | Análise completa de conversa |
| `ai-conversation-summary` | Lovable AI | Resumo de conversa |
| `ai-suggest-reply` | Lovable AI | Sugestão de respostas |
| `ai-transcribe-audio` | ElevenLabs | Transcrição de áudio |
| `bitrix-api` | Bitrix24 | Integração CRM |
| `elevenlabs-scribe-token` | ElevenLabs | Token para realtime |
| `elevenlabs-tts` | ElevenLabs | Text-to-Speech |
| `evolution-api` | Evolution | Operações WhatsApp |
| `evolution-webhook` | Evolution | Receber eventos WA |
| `get-mapbox-token` | Mapbox | Token para mapas |
| `sentiment-alert` | Lovable AI | Alertas de sentimento |
| `whatsapp-webhook` | WhatsApp Cloud | Receber eventos Cloud API |

---

## 19. Estrutura de Pastas

```
projeto/
├── docs/                          # Documentação
│   ├── PROJECT_TEMPLATE.md        # Template do projeto
│   ├── TECHNICAL_DOCUMENTATION.md # Documentação técnica
│   └── FUNCTIONALITIES_INVENTORY.md # Este arquivo
│
├── public/                        # Arquivos estáticos
│   ├── favicon.ico
│   ├── placeholder.svg
│   ├── robots.txt
│   └── sw.js                      # Service Worker
│
├── src/
│   ├── components/                # Componentes React (155+)
│   │   ├── ui/                    # 60 componentes shadcn/ui
│   │   ├── inbox/                 # 46 componentes de mensagens
│   │   ├── dashboard/             # 11 componentes de dashboard
│   │   ├── gamification/          # 5 componentes
│   │   ├── effects/               # 4 componentes de efeitos
│   │   ├── notifications/         # 6 componentes
│   │   ├── queues/                # 9 componentes
│   │   ├── auth/                  # 4 componentes
│   │   ├── catalog/               # 4 componentes
│   │   ├── connections/           # 3 componentes
│   │   └── [outros]/              # Demais componentes
│   │
│   ├── hooks/                     # 50 Custom Hooks
│   ├── pages/                     # 7 Páginas
│   ├── types/                     # Tipos TypeScript
│   ├── utils/                     # Utilitários
│   ├── lib/                       # Bibliotecas (utils, audit)
│   └── integrations/supabase/     # Cliente Supabase
│
└── supabase/
    ├── config.toml                # Configuração
    ├── migrations/                # 35 arquivos SQL
    └── functions/                 # 12 Edge Functions
```

---

## 20. Secrets Configurados

| Secret | Serviço | Uso |
|--------|---------|-----|
| `SUPABASE_URL` | Lovable Cloud | URL do backend |
| `SUPABASE_ANON_KEY` | Lovable Cloud | Chave anônima |
| `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud | Chave de serviço |
| `SUPABASE_PUBLISHABLE_KEY` | Lovable Cloud | Chave pública |
| `LOVABLE_API_KEY` | Lovable AI | Gateway de IA |
| `ELEVENLABS_API_KEY` | ElevenLabs | TTS e Transcrição |
| `MAPBOX_PUBLIC_TOKEN` | Mapbox | Mapas |

---

## 📊 Estatísticas do Projeto

| Métrica | Quantidade |
|---------|------------|
| Arquivos Totais | 250+ |
| Componentes React | 155+ |
| Custom Hooks | 50 |
| Páginas | 7 |
| Edge Functions | 12 |
| Migrações SQL | 35 |
| Tabelas no Banco | 24 |
| Componentes UI | 60 |
| Linhas de Documentação | 4500+ |

---

## 🔧 Como Usar Este Template

1. **Copiar Stack Base** - Configurar React + Vite + TypeScript + Tailwind
2. **Instalar shadcn/ui** - `npx shadcn@latest init`
3. **Configurar Lovable Cloud** - Backend automático
4. **Copiar Design System** - `index.css` e `tailwind.config.ts`
5. **Implementar Auth** - `useAuth.tsx` como base
6. **Adicionar Componentes** - Conforme necessidade

---

> **Nota:** Este documento é atualizado automaticamente conforme o projeto evolui.
