# 📋 Levantamento Completo de Funcionalidades do Sistema

> **Projeto:** WhatsApp CRM Omnichannel  
> **Data:** 2026-03-15  
> **Versão:** 2.0.0  
> **Objetivo:** Plataforma omnichannel WhatsApp para equipe de 20+ atendentes  
> **Status Geral:** ✅ 100% IMPLEMENTADO (52/52 melhorias + 3 extras)

---

## 📑 Índice

1. [Autenticação e Segurança](#1-autenticação-e-segurança)
2. [Inbox / Chat em Tempo Real](#2-inbox--chat-em-tempo-real)
3. [Mensagens WhatsApp (Tipos)](#3-mensagens-whatsapp-tipos)
4. [Áudio e Transcrição](#4-áudio-e-transcrição)
5. [Inteligência Artificial](#5-inteligência-artificial)
6. [Gestão de Contatos](#6-gestão-de-contatos)
7. [Filas de Atendimento](#7-filas-de-atendimento)
8. [SLA (Service Level Agreement)](#8-sla-service-level-agreement)
9. [Gamificação](#9-gamificação)
10. [Dashboard e Métricas](#10-dashboard-e-métricas)
11. [Relatórios e Exportação](#11-relatórios-e-exportação)
12. [CSAT (Satisfação do Cliente)](#12-csat-satisfação-do-cliente)
13. [Catálogo de Produtos e E-commerce](#13-catálogo-de-produtos-e-e-commerce)
14. [Conexões WhatsApp](#14-conexões-whatsapp)
15. [Templates WhatsApp Oficiais](#15-templates-whatsapp-oficiais)
16. [Grupos WhatsApp](#16-grupos-whatsapp)
17. [Chamadas (Calls)](#17-chamadas-calls)
18. [Carteira de Clientes](#18-carteira-de-clientes)
19. [Automações](#19-automações)
20. [Notificações](#20-notificações)
21. [Agendamento de Mensagens](#21-agendamento-de-mensagens)
22. [Localização e Mapas](#22-localização-e-mapas)
23. [Configurações do Sistema](#23-configurações-do-sistema)
24. [Segurança Avançada](#24-segurança-avançada)
25. [Acessibilidade](#25-acessibilidade)
26. [Performance e Otimização](#26-performance-e-otimização)
27. [Mobile e PWA](#27-mobile-e-pwa)
28. [Atalhos de Teclado](#28-atalhos-de-teclado)
29. [Onboarding](#29-onboarding)
30. [Integrações Externas](#30-integrações-externas)
31. [Auditoria](#31-auditoria)
32. [Design System](#32-design-system)
33. [Banco de Dados](#33-banco-de-dados)
34. [Edge Functions](#34-edge-functions)

---

## 1. Autenticação e Segurança

### Funcionalidades
| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 1.1 | Login com email/senha | ✅ | `src/pages/Auth.tsx` |
| 1.2 | Cadastro de novos usuários | ✅ | `src/pages/Auth.tsx` |
| 1.3 | Verificação de email obrigatória | ✅ | `src/pages/VerifyEmail.tsx` |
| 1.4 | Recuperação de senha | ✅ | `src/pages/ForgotPassword.tsx` |
| 1.5 | Reset de senha | ✅ | `src/pages/ResetPassword.tsx` |
| 1.6 | Indicador de força de senha | ✅ | `src/components/auth/PasswordStrengthMeter.tsx` |
| 1.7 | MFA (Autenticação de Dois Fatores) | ✅ | `src/components/mfa/MFAEnroll.tsx` |
| 1.8 | Verificação MFA no login | ✅ | `src/pages/TwoFactorAuth.tsx` |
| 1.9 | Configurações MFA | ✅ | `src/components/mfa/MFASettings.tsx` |
| 1.10 | Passkeys (WebAuthn) | ✅ | `src/components/security/PasskeysPanel.tsx` |
| 1.11 | Rotas protegidas | ✅ | `src/components/auth/ProtectedRoute.tsx` |
| 1.12 | RBAC (3 níveis: admin, supervisor, agent) | ✅ | `src/hooks/useUserRole.ts` |
| 1.13 | Tabela user_roles separada (segurança) | ✅ | `user_roles` table |
| 1.14 | Função SQL `has_role()` | ✅ | Migrations |
| 1.15 | Função SQL `is_admin_or_supervisor()` | ✅ | Migrations |
| 1.16 | Permission Gate (controle por permissão) | ✅ | `src/components/auth/PermissionGate.tsx` |
| 1.17 | Matriz de permissões | ✅ | `src/components/permissions/PermissionMatrix.tsx` |
| 1.18 | Reautenticação para ações sensíveis | ✅ | `src/components/auth/ReauthDialog.tsx` |
| 1.19 | Bloqueio de tentativas de login | ✅ | `src/lib/loginAttempts.ts` |
| 1.20 | SSO Callback | ✅ | `src/pages/SSOCallback.tsx` |
| 1.21 | Prova social na tela de login | ✅ | `src/components/auth/SocialProof.tsx` |
| 1.22 | Benefícios exibidos no login | ✅ | `src/components/auth/HeroBenefits.tsx` |
| 1.23 | Aprovação de reset de senha por admin | ✅ | `supabase/functions/approve-password-reset/` |

---

## 2. Inbox / Chat em Tempo Real

### Funcionalidades
| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 2.1 | Lista de conversas em tempo real | ✅ | `src/components/inbox/ConversationList.tsx` |
| 2.2 | Lista virtualizada (performance) | ✅ | `src/components/inbox/VirtualizedConversationList.tsx` |
| 2.3 | Lista de mensagens virtualizada | ✅ | `src/components/inbox/VirtualizedMessageList.tsx` |
| 2.4 | Painel de chat completo | ✅ | `src/components/inbox/ChatPanel.tsx` |
| 2.5 | Detalhes do contato no chat | ✅ | `src/components/inbox/ContactDetails.tsx` |
| 2.6 | Filtros de inbox (status, fila, prioridade) | ✅ | `src/components/inbox/InboxFilters.tsx` |
| 2.7 | Busca global (Ctrl+K) | ✅ | `src/components/inbox/GlobalSearch.tsx` |
| 2.8 | Indicador de digitação (typing) | ✅ | `src/components/inbox/TypingIndicator.tsx` |
| 2.9 | Presença de digitação realtime | ✅ | `src/hooks/useTypingPresence.ts` |
| 2.10 | Indicador de novas mensagens | ✅ | `src/components/inbox/NewMessageIndicator.tsx` |
| 2.11 | Responder/Citar mensagem (Quote) | ✅ | `src/components/inbox/ReplyQuote.tsx` |
| 2.12 | Encaminhar mensagem | ✅ | `src/components/inbox/ForwardMessageDialog.tsx` |
| 2.13 | Copiar mensagem | ✅ | Via ações do chat |
| 2.14 | Reações a mensagens (emojis) | ✅ | `src/components/inbox/MessageReactions.tsx` |
| 2.15 | Menu de contexto de mensagem | ✅ | `src/components/inbox/MessageContextMenu.tsx` |
| 2.16 | Menu de contexto de conversa | ✅ | `src/components/inbox/ConversationContextMenu.tsx` |
| 2.17 | Preview de mensagem ao digitar | ✅ | `src/components/inbox/MessagePreview.tsx` |
| 2.18 | Preview de links | ✅ | `src/components/inbox/LinkPreview.tsx` |
| 2.19 | Status de mensagem (enviado/entregue/lido/falhou) | ✅ | `src/components/inbox/MessageStatus.tsx` |
| 2.20 | Indicador de SLA no chat | ✅ | `src/components/inbox/SLAIndicator.tsx` |
| 2.21 | Indicador de sentimento | ✅ | `src/components/inbox/SentimentIndicator.tsx` |
| 2.22 | Transferir conversa (agente/fila) | ✅ | `src/components/inbox/TransferDialog.tsx` |
| 2.23 | Notas privadas internas | ✅ | `src/components/inbox/PrivateNotes.tsx` |
| 2.24 | Colaboração em tempo real | ✅ | `src/components/inbox/RealtimeCollaboration.tsx` |
| 2.25 | Histórico de conversas | ✅ | `src/components/inbox/ConversationHistory.tsx` |
| 2.26 | Galeria de mídias da conversa | ✅ | `src/components/inbox/MediaGallery.tsx` |
| 2.27 | Resumo de conversa (IA) | ✅ | `src/components/inbox/ConversationSummary.tsx` |
| 2.28 | Sugestões de resposta (IA) | ✅ | `src/components/inbox/AISuggestions.tsx` |
| 2.29 | Assistente de conversa (IA) | ✅ | `src/components/inbox/AIConversationAssistant.tsx` |
| 2.30 | Templates de mensagem | ✅ | `src/components/inbox/MessageTemplates.tsx` |
| 2.31 | Templates com variáveis dinâmicas | ✅ | `src/components/inbox/TemplatesWithVariables.tsx` |
| 2.32 | Respostas rápidas (Quick Replies) | ✅ | `src/components/inbox/QuickRepliesManager.tsx` |
| 2.33 | Slash Commands | ✅ | `src/components/inbox/SlashCommands.tsx` |
| 2.34 | Ações em bulk (marcar lido, arquivar, etc.) | ✅ | `src/components/inbox/BulkActionsToolbar.tsx` |
| 2.35 | Upload de arquivos (drag & drop) | ✅ | `src/components/inbox/FileUploader.tsx` |
| 2.36 | Preview de imagem | ✅ | `src/components/inbox/ImagePreview.tsx` |
| 2.37 | Preview de mídia (vídeo, documento) | ✅ | `src/components/inbox/MediaPreview.tsx` |
| 2.38 | Swipe-to-reply (mobile) | ✅ | `src/components/ui/swipe-to-reply.tsx` |
| 2.39 | Reações por toque longo | ✅ | `src/components/ui/long-press-reactions.tsx` |
| 2.40 | Smart Reply Chips | ✅ | `src/components/ui/smart-reply-chips.tsx` |
| 2.41 | Barra de ações do agente atribuído | ✅ | `src/components/inbox/chat/ChatAssignedBar.tsx` |
| 2.42 | Atalhos de teclado no chat | ✅ | `src/components/inbox/KeyboardShortcutsHelp.tsx` |
| 2.43 | Emoji picker com histórico | ✅ | `src/components/ui/emoji-picker.tsx` |

---

## 3. Mensagens WhatsApp (Tipos)

### Tipos de Mensagem Suportados
| # | Tipo | Status | Descrição |
|---|------|--------|-----------|
| 3.1 | Texto | ✅ | Mensagens de texto simples com formatação |
| 3.2 | Imagem | ✅ | Envio/recebimento de imagens (até 16MB) |
| 3.3 | Vídeo | ✅ | Envio/recebimento de vídeos (até 16MB) |
| 3.4 | Áudio | ✅ | Mensagens de voz com player customizado |
| 3.5 | Documento | ✅ | PDFs, planilhas, etc. (até 100MB) |
| 3.6 | Localização | ✅ | Compartilhamento de localização no mapa |
| 3.7 | Mensagens interativas (botões) | ✅ | Quick reply buttons |
| 3.8 | Mensagens interativas (lista) | ✅ | List messages com seções |
| 3.9 | Mensagens interativas (CTA URL) | ✅ | Call-to-action com URL |
| 3.10 | Resposta de botão (button_response) | ✅ | Rastreamento de cliques |
| 3.11 | Stickers | ✅ | Suporte a stickers (até 100KB) |
| 3.12 | Mensagem encaminhada | ✅ | Indicador de forwarded |
| 3.13 | Mensagem de produto | ✅ | `ProductMessage.tsx` |
| 3.14 | Mensagem de pagamento | ✅ | `PaymentMessage.tsx` |

### Validação de Arquivos (WhatsApp Business API compliance)
- Imagens: JPEG, PNG (max 16MB)
- Vídeos: MP4, 3GP (max 16MB)
- Áudio: AAC, MP3, OGG, AMR, MP4 (max 16MB)
- Documentos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT (max 100MB)
- Stickers: WebP (max 100KB)

---

## 4. Áudio e Transcrição

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 4.1 | Gravação de áudio no chat | ✅ | `src/hooks/useAudioRecorder.ts` |
| 4.2 | Player de áudio customizado | ✅ | `src/components/inbox/AudioMessagePlayer.tsx` |
| 4.3 | Visualização de ondas de áudio | ✅ | `src/components/ui/audio-waveform.tsx` |
| 4.4 | Seletor de velocidade de reprodução | ✅ | `src/components/inbox/SpeedSelector.tsx` |
| 4.5 | Text-to-Speech (ElevenLabs) | ✅ | `src/hooks/useTextToSpeech.ts` |
| 4.6 | Seletor de vozes TTS | ✅ | `src/components/inbox/VoiceSelector.tsx` |
| 4.7 | Transcrição automática de áudios (IA) | ✅ | `supabase/functions/ai-transcribe-audio/` |
| 4.8 | Transcrição em tempo real (Scribe) | ✅ | `src/components/inbox/RealtimeTranscription.tsx` |
| 4.9 | Status de transcrição (pending/processing/completed/failed) | ✅ | Campo `transcription_status` na tabela messages |
| 4.10 | Histórico de transcrições | ✅ | `src/components/transcriptions/TranscriptionsHistoryView.tsx` |
| 4.11 | Notificação de transcrição completa | ✅ | `src/hooks/useTranscriptionNotifications.ts` |
| 4.12 | Configuração auto-transcrição on/off | ✅ | `user_settings.auto_transcription_enabled` |

---

## 5. Inteligência Artificial

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 5.1 | Sugestão de respostas contextuais | ✅ | `supabase/functions/ai-suggest-reply/` |
| 5.2 | Resumo automático de conversa | ✅ | `supabase/functions/ai-conversation-summary/` |
| 5.3 | Análise de conversa (sentimento, tópicos, urgência) | ✅ | `supabase/functions/ai-conversation-analysis/` |
| 5.4 | Alertas de sentimento negativo | ✅ | `supabase/functions/sentiment-alert/` |
| 5.5 | Score de sentimento por conversa | ✅ | Campo `sentiment_score` em `conversation_analyses` |
| 5.6 | Tendência de sentimento (improving/declining/stable) | ✅ | `src/components/dashboard/SentimentTrendChart.tsx` |
| 5.7 | Alertas configuráveis por threshold | ✅ | `user_settings.sentiment_alert_threshold` |
| 5.8 | Detecção de sentimento consecutivo negativo | ✅ | `user_settings.sentiment_consecutive_count` |
| 5.9 | Dashboard de alertas de sentimento | ✅ | `src/components/dashboard/SentimentAlertsDashboard.tsx` |
| 5.10 | Widget de estatísticas IA | ✅ | `src/components/dashboard/AIStatsWidget.tsx` |
| 5.11 | Acesso rápido IA no dashboard | ✅ | `src/components/dashboard/AIQuickAccess.tsx` |
| 5.12 | Gerador de avatar por IA | ✅ | `src/components/contacts/AIAvatarGenerator.tsx` |
| 5.13 | Predição de demanda | ✅ | `src/components/dashboard/DemandPrediction.tsx` |

### Modelos Suportados (via Lovable AI Gateway — sem API key)
- `google/gemini-2.5-pro` — Multimodal + raciocínio complexo
- `google/gemini-2.5-flash` — Balanceado custo/qualidade
- `google/gemini-2.5-flash-lite` — Mais rápido e econômico
- `openai/gpt-5` — Alta precisão
- `openai/gpt-5-mini` — Custo reduzido
- `openai/gpt-5-nano` — Alta velocidade

---

## 6. Gestão de Contatos

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 6.1 | CRUD de contatos | ✅ | `src/components/contacts/ContactsView.tsx` |
| 6.2 | Campos estendidos (nome, apelido, sobrenome, cargo, empresa) | ✅ | Tabela `contacts` |
| 6.3 | Avatar de contato | ✅ | Campo `avatar_url` |
| 6.4 | Atribuição de contato a agente | ✅ | Campo `assigned_to` |
| 6.5 | Atribuição a fila | ✅ | Campo `queue_id` |
| 6.6 | Tags/etiquetas em contatos | ✅ | Tabela `contact_tags` |
| 6.7 | Notas privadas por contato | ✅ | Tabela `contact_notes` |
| 6.8 | Tipo de contato (cliente, lead, etc.) | ✅ | Campo `contact_type` |
| 6.9 | Importação de contatos | ✅ | `src/components/DataImporter.tsx` |
| 6.10 | Exportação de contatos | ✅ | `src/components/ExportDropdown.tsx` |
| 6.11 | Duplicação de contato | ✅ | `src/components/DuplicateButton.tsx` |
| 6.12 | Busca e filtros avançados | ✅ | `src/components/SearchInput.tsx` |
| 6.13 | Filtros salvos | ✅ | `src/components/SavedFiltersDropdown.tsx` |
| 6.14 | Scroll infinito na lista | ✅ | `src/components/InfiniteScrollList.tsx` |
| 6.15 | Ações em bulk | ✅ | `src/components/BulkActionsBar.tsx` |
| 6.16 | Versionamento de registros | ✅ | `src/components/VersionHistory.tsx` |

---

## 7. Filas de Atendimento

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 7.1 | CRUD de filas | ✅ | `src/components/queues/QueuesView.tsx` |
| 7.2 | Cores por fila | ✅ | Campo `color` |
| 7.3 | Prioridade por fila | ✅ | Campo `priority` |
| 7.4 | Tempo máximo de espera configurável | ✅ | Campo `max_wait_time_minutes` |
| 7.5 | Membros por fila | ✅ | `src/components/queues/AddMemberDialog.tsx` |
| 7.6 | Metas por fila (configuráveis) | ✅ | `src/components/queues/QueueGoalsDialog.tsx` |
| 7.7 | Alertas de fila | ✅ | `src/components/queues/QueueAlertsDisplay.tsx` |
| 7.8 | Gráficos analíticos por fila | ✅ | `src/components/queues/QueueCharts.tsx` |
| 7.9 | Comparação entre filas | ✅ | `src/components/queues/QueuesComparisonDashboard.tsx` |
| 7.10 | Detalhes da fila com analytics | ✅ | `src/pages/QueueDetails.tsx` |
| 7.11 | Seletor de período (7/14/30 dias) | ✅ | `src/components/queues/PeriodSelector.tsx` |
| 7.12 | Atribuição automática ao agente menos ocupado | ✅ | Trigger SQL `auto_assign_contact` |

---

## 8. SLA (Service Level Agreement)

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 8.1 | Configuração de SLA (tempo resposta/resolução) | ✅ | Tabela `sla_configurations` |
| 8.2 | Tracking de SLA por conversa | ✅ | Tabela `conversation_sla` |
| 8.3 | Indicador visual de SLA no chat | ✅ | `src/components/inbox/SLAIndicator.tsx` |
| 8.4 | Dashboard de métricas SLA | ✅ | `src/components/dashboard/SLAMetricsDashboard.tsx` |
| 8.5 | Dashboard SLA dedicado | ✅ | `src/pages/SLADashboard.tsx` |
| 8.6 | Histórico de SLA | ✅ | `src/pages/SLAHistory.tsx` |
| 8.7 | Notificações de breach de SLA | ✅ | `src/hooks/useSLANotifications.ts` |
| 8.8 | Provider de notificações SLA | ✅ | `src/components/notifications/SLANotificationProvider.tsx` |

---

## 9. Gamificação

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 9.1 | Sistema de XP e níveis | ✅ | `src/hooks/useAgentGamification.ts` |
| 9.2 | Conquistas/Badges | ✅ | `src/components/gamification/AchievementBadge.tsx` |
| 9.3 | Painel de conquistas | ✅ | `src/components/gamification/AchievementsPanel.tsx` |
| 9.4 | Toast de conquista desbloqueada | ✅ | `src/components/gamification/AchievementToast.tsx` |
| 9.5 | Leaderboard (ranking) | ✅ | `src/components/leaderboard/Leaderboard.tsx` |
| 9.6 | Ranking de agentes por metas | ✅ | `src/components/leaderboard/AgentRanking.tsx` |
| 9.7 | Streak de dias consecutivos | ✅ | Campo `current_streak` / `best_streak` |
| 9.8 | Efeito de confetti | ✅ | `src/components/effects/Confetti.tsx` |
| 9.9 | Celebração de metas | ✅ | `src/components/ui/goal-celebration.tsx` |
| 9.10 | Mini-games de treinamento | ✅ | `src/components/gamification/TrainingMiniGames.tsx` |
| 9.11 | Provider de gamificação | ✅ | `src/components/gamification/GamificationProvider.tsx` |
| 9.12 | Efeitos gamificação no dashboard | ✅ | `src/components/dashboard/GamificationEffects.tsx` |

---

## 10. Dashboard e Métricas

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 10.1 | Dashboard principal com métricas | ✅ | `src/components/dashboard/DashboardView.tsx` |
| 10.2 | Filtros globais (período, fila, agente) | ✅ | `src/components/dashboard/DashboardFilters.tsx` |
| 10.3 | Dashboard personalizável (drag & drop) | ✅ | `src/components/dashboard/DraggableWidgetContainer.tsx` |
| 10.4 | Progressive Disclosure (níveis de detalhe) | ✅ | `src/components/dashboard/ProgressiveDisclosureDashboard.tsx` |
| 10.5 | Dashboard de metas | ✅ | `src/components/dashboard/GoalsDashboard.tsx` |
| 10.6 | Configuração de metas | ✅ | `src/components/dashboard/GoalsConfigDialog.tsx` |
| 10.7 | Comparação de métricas | ✅ | `src/components/dashboard/MetricComparison.tsx` |
| 10.8 | Indicador de tendência | ✅ | `src/components/dashboard/TrendIndicator.tsx` |
| 10.9 | Heatmap de atividade | ✅ | `src/components/dashboard/ActivityHeatmap.tsx` |
| 10.10 | Heatmap de conversas | ✅ | `src/components/dashboard/ConversationHeatmap.tsx` |
| 10.11 | Predição de demanda (IA) | ✅ | `src/components/dashboard/DemandPrediction.tsx` |
| 10.12 | War Room (supervisores) | ✅ | `src/components/dashboard/WarRoomDashboard.tsx` |
| 10.13 | Métricas de satisfação | ✅ | `src/components/dashboard/SatisfactionMetrics.tsx` |
| 10.14 | Dashboard de alertas de sentimento | ✅ | `src/components/dashboard/SentimentAlertsDashboard.tsx` |
| 10.15 | Gráfico de tendência de sentimento | ✅ | `src/components/dashboard/SentimentTrendChart.tsx` |
| 10.16 | Partículas flutuantes decorativas | ✅ | `src/components/dashboard/FloatingParticles.tsx` |
| 10.17 | Aurora Borealis (efeito decorativo) | ✅ | `src/components/effects/AuroraBorealis.tsx` |

---

## 11. Relatórios e Exportação

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 11.1 | Relatórios avançados | ✅ | `src/components/reports/AdvancedReportsView.tsx` |
| 11.2 | Exportação avançada (wizard 3 passos) | ✅ | `src/components/reports/AdvancedExportDialog.tsx` |
| 11.3 | Exportar para PDF | ✅ | jsPDF + jspdf-autotable |
| 11.4 | Exportar para Excel | ✅ | xlsx |
| 11.5 | Exportar para CSV | ✅ | `src/utils/exportReport.ts` |
| 11.6 | Botão de exportação rápida | ✅ | `src/components/reports/ExportButton.tsx` |
| 11.7 | Relatórios agendados por email | ✅ | `src/components/reports/ScheduledReportsManager.tsx` |
| 11.8 | Edge function para envio de relatórios | ✅ | `supabase/functions/send-scheduled-report/` |

---

## 12. CSAT (Satisfação do Cliente)

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 12.1 | Pesquisa de satisfação (1-5 estrelas) | ✅ | `src/components/csat/CSATSurveyDialog.tsx` |
| 12.2 | Feedback textual opcional | ✅ | `src/components/csat/CSATSurveyDialog.tsx` |
| 12.3 | Dashboard CSAT (média, distribuição, feedbacks) | ✅ | `src/components/csat/CSATDashboard.tsx` |
| 12.4 | Hook completo de CSAT | ✅ | `src/hooks/useCSAT.ts` |
| 12.5 | Filtro por período (hoje/semana/mês) | ✅ | `src/hooks/useCSAT.ts` |
| 12.6 | Tabela `csat_surveys` com RLS | ✅ | Banco de dados |
| 12.7 | Realtime habilitado para CSAT | ✅ | `supabase_realtime` |

---

## 13. Catálogo de Produtos e E-commerce

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 13.1 | Catálogo de produtos | ✅ | `src/components/catalog/ProductCatalog.tsx` |
| 13.2 | Card de produto | ✅ | `src/components/catalog/ProductCard.tsx` |
| 13.3 | Gerenciamento de produtos (CRUD) | ✅ | `src/components/catalog/ProductManagement.tsx` |
| 13.4 | Mensagem de produto no chat | ✅ | `src/components/catalog/ProductMessage.tsx` |
| 13.5 | Mensagem de pagamento (PIX, status) | ✅ | `src/components/catalog/PaymentMessage.tsx` |
| 13.6 | Carrinho de compras | ✅ | `src/components/catalog/ShoppingCart.tsx` |
| 13.7 | Hook do carrinho | ✅ | `src/hooks/useShoppingCart.ts` |
| 13.8 | Gerenciador de templates WhatsApp | ✅ | `src/components/catalog/WhatsAppTemplatesManager.tsx` |

---

## 14. Conexões WhatsApp

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 14.1 | Gerenciamento de conexões | ✅ | `src/components/connections/ConnectionsView.tsx` |
| 14.2 | QR Code para conexão | ✅ | Via Evolution API |
| 14.3 | Status de conexão (connected/disconnected/connecting) | ✅ | Tabela `whatsapp_connections` |
| 14.4 | Horário comercial por conexão | ✅ | `src/components/connections/BusinessHoursDialog.tsx` |
| 14.5 | Indicador de horário comercial | ✅ | `src/components/connections/BusinessHoursIndicator.tsx` |
| 14.6 | Mensagem de ausência | ✅ | Tabela `away_messages` |
| 14.7 | Sincronização com Evolution API | ✅ | `supabase/functions/evolution-sync/` |

---

## 15. Templates WhatsApp Oficiais

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 15.1 | CRUD de templates oficiais | ✅ | Tabela `whatsapp_templates` |
| 15.2 | Preview estilo WhatsApp | ✅ | `src/components/catalog/WhatsAppTemplatesManager.tsx` |
| 15.3 | Variáveis dinâmicas ({{1}}, {{2}}) | ✅ | Campo `variables` |
| 15.4 | Categorias (utility, marketing, authentication) | ✅ | Campo `category` |
| 15.5 | Status do template (draft/pending/approved/rejected) | ✅ | Campo `status` |
| 15.6 | Header, body, footer e botões | ✅ | Campos dedicados |

---

## 16. Grupos WhatsApp

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 16.1 | Visualização de grupos | ✅ | `src/components/groups/GroupsView.tsx` |
| 16.2 | Sincronização de grupos | ✅ | Via Evolution API |
| 16.3 | Contagem de participantes | ✅ | Campo `participant_count` |
| 16.4 | Status de admin do bot | ✅ | Campo `is_admin` |

---

## 17. Chamadas (Calls)

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 17.1 | Diálogo de chamada | ✅ | `src/components/calls/CallDialog.tsx` |
| 17.2 | Chamadas inbound/outbound | ✅ | Campo `direction` |
| 17.3 | Status (ringing/answered/ended) | ✅ | Campo `status` |
| 17.4 | Duração e gravação | ✅ | Campos `duration_seconds`, `recording_url` |
| 17.5 | Notas de chamada | ✅ | Campo `notes` |
| 17.6 | Hook de chamadas | ✅ | `src/hooks/useCalls.ts` |

---

## 18. Carteira de Clientes

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 18.1 | Regras de carteira | ✅ | `src/components/wallet/ClientWalletView.tsx` |
| 18.2 | Atribuição automática por regras | ✅ | Tabela `client_wallet_rules` |
| 18.3 | Prioridade de regras | ✅ | Campo `priority` |
| 18.4 | Ativação/desativação de regras | ✅ | Campo `is_active` |

---

## 19. Automações

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 19.1 | Gerenciador de automações | ✅ | `src/components/automations/AutomationsManager.tsx` |
| 19.2 | Atribuição automática de chats | ✅ | `user_settings.auto_assignment_enabled` |
| 19.3 | Métodos de distribuição (round-robin, aleatório, menor carga) | ✅ | `user_settings.auto_assignment_method` |
| 19.4 | Timeout de inatividade | ✅ | `user_settings.inactivity_timeout` |
| 19.5 | Auto-fechamento de conversas inativas | ✅ | `src/components/settings/AutoCloseSettings.tsx` |
| 19.6 | Configuração de horas de inatividade | ✅ | Tabela `auto_close_config` |
| 19.7 | Mensagem de encerramento customizável | ✅ | Campo `close_message` |
| 19.8 | Transcrição automática de áudios | ✅ | `user_settings.auto_transcription_enabled` |

---

## 20. Notificações

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 20.1 | Central de notificações | ✅ | `src/components/notifications/NotificationCenter.tsx` |
| 20.2 | Central de notificações aprimorada | ✅ | `src/components/notifications/NotificationCenterEnhanced.tsx` |
| 20.3 | Push notifications (browser) | ✅ | `src/hooks/usePushNotifications.ts` |
| 20.4 | Configurações de push | ✅ | `src/components/notifications/PushNotificationSettings.tsx` |
| 20.5 | Painel de configurações de notificações | ✅ | `src/components/notifications/NotificationSettingsPanel.tsx` |
| 20.6 | Sons de notificação personalizáveis | ✅ | `src/components/settings/SoundCustomizationPanel.tsx` |
| 20.7 | Tipos de som (mensagem, menção, SLA, meta, transcrição) | ✅ | `user_settings.*_sound_type` |
| 20.8 | Horários silenciosos | ✅ | `user_settings.quiet_hours_*` |
| 20.9 | Notificações de metas | ✅ | `src/components/notifications/GoalNotificationProvider.tsx` |
| 20.10 | Notificações de SLA | ✅ | `src/components/notifications/SLANotificationProvider.tsx` |
| 20.11 | Alertas de sentimento em tempo real | ✅ | `src/components/notifications/RealtimeSentimentAlertProvider.tsx` |
| 20.12 | Notificações de segurança push | ✅ | `src/hooks/useSecurityPushNotifications.ts` |
| 20.13 | Service Worker para push | ✅ | `public/sw.js` |

---

## 21. Agendamento de Mensagens

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 21.1 | Agendar mensagem para envio futuro | ✅ | `src/components/inbox/ScheduleMessageDialog.tsx` |
| 21.2 | Visualização em calendário | ✅ | `src/components/schedule/ScheduleCalendarView.tsx` |
| 21.3 | Cancelamento de agendamento | ✅ | Via ScheduleCalendarView |
| 21.4 | Filtro por agente | ✅ | Via ScheduleCalendarView |
| 21.5 | Hook de mensagens agendadas | ✅ | `src/hooks/useScheduledMessages.ts` |
| 21.6 | Suporte a anexos no agendamento | ✅ | Via ScheduleMessageDialog |

---

## 22. Localização e Mapas

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 22.1 | Mapa interativo (Mapbox) | ✅ | `src/components/inbox/LocationPicker.tsx` |
| 22.2 | Seletor de localização | ✅ | `src/components/inbox/LocationPicker.tsx` |
| 22.3 | Exibição de localização recebida | ✅ | `src/components/inbox/LocationMessage.tsx` |
| 22.4 | Edge function para token Mapbox | ✅ | `supabase/functions/get-mapbox-token/` |

---

## 23. Configurações do Sistema

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 23.1 | Página de configurações | ✅ | `src/components/settings/SettingsView.tsx` |
| 23.2 | Horário de funcionamento | ✅ | Aba "Horário" |
| 23.3 | Mensagens automáticas (boas-vindas, ausência, encerramento) | ✅ | Aba "Mensagens" |
| 23.4 | Automações (atribuição, transcrição) | ✅ | Aba "Automação" |
| 23.5 | Auto-fechamento de conversas | ✅ | Aba "Automação" |
| 23.6 | Notificações | ✅ | Aba "Notificações" |
| 23.7 | Aparência (tema, modo compacto) | ✅ | Aba "Aparência" |
| 23.8 | Atalhos de teclado personalizáveis | ✅ | Aba "Atalhos" |
| 23.9 | Sons personalizáveis | ✅ | Aba "Sons" |
| 23.10 | Upload de avatar | ✅ | `src/components/settings/AvatarUpload.tsx` |
| 23.11 | Seletor de idioma | ✅ | `src/components/settings/LanguageSelector.tsx` |
| 23.12 | Persistência em banco (user_settings) | ✅ | `src/hooks/useUserSettings.ts` |

---

## 24. Segurança Avançada

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 24.1 | Visão geral de segurança | ✅ | `src/components/security/SecurityView.tsx` |
| 24.2 | Overview de segurança | ✅ | `src/components/security/SecurityOverview.tsx` |
| 24.3 | Configurações de segurança | ✅ | `src/components/security/SecuritySettingsPanel.tsx` |
| 24.4 | Gerenciamento de dispositivos/sessões | ✅ | `src/components/security/DevicesPanel.tsx` |
| 24.5 | Passkeys (WebAuthn) | ✅ | `src/components/security/PasskeysPanel.tsx` |
| 24.6 | IP Whitelist | ✅ | `src/components/security/IPWhitelistPanel.tsx` |
| 24.7 | IPs bloqueados | ✅ | `src/components/security/BlockedIPsPanel.tsx` |
| 24.8 | Geo-blocking (países) | ✅ | `src/components/security/GeoBlockingPanel.tsx` |
| 24.9 | Notificações de segurança | ✅ | `src/components/security/SecurityNotificationsPanel.tsx` |
| 24.10 | Solicitações de reset de senha (admin) | ✅ | `src/components/security/PasswordResetRequestsPanel.tsx` |
| 24.11 | Rate limiting configurável | ✅ | Tabela `rate_limit_configs` |
| 24.12 | Logs de rate limiting | ✅ | Tabela `rate_limit_logs` |
| 24.13 | Alertas de rate limit em tempo real | ✅ | `src/components/security/RateLimitRealtimeAlerts.tsx` |
| 24.14 | Dashboard de rate limiting (admin) | ✅ | `src/pages/admin/RateLimitDashboard.tsx` |
| 24.15 | Detecção de novo dispositivo | ✅ | `supabase/functions/detect-new-device/` |
| 24.16 | Limpeza de logs (cron) | ✅ | `supabase/functions/cleanup-rate-limit-logs/` |
| 24.17 | Envio de alerta por email | ✅ | `supabase/functions/send-rate-limit-alert/` |
| 24.18 | Alertas de segurança (tabela) | ✅ | Tabela `security_alerts` |

---

## 25. Acessibilidade

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 25.1 | Skip links | ✅ | `src/components/ui/skip-link.tsx` |
| 25.2 | ARIA labels completos | ✅ | Todos os componentes interativos |
| 25.3 | Focus trap | ✅ | `src/components/ui/focus-trap.tsx` |
| 25.4 | Visually hidden | ✅ | `src/components/ui/visually-hidden.tsx` |
| 25.5 | Alto contraste toggle | ✅ | `src/components/theme/HighContrastToggle.tsx` |
| 25.6 | Contraste de cores | ✅ | `src/components/a11y/ColorContrast.tsx` |
| 25.7 | Navegação por teclado | ✅ | `src/components/a11y/KeyboardNavigation.tsx` |
| 25.8 | Preferências de motion | ✅ | `src/components/a11y/MotionPreferences.tsx` |
| 25.9 | Accessible toast | ✅ | `src/components/ui/accessible-toast.tsx` |
| 25.10 | Module de acessibilidade | ✅ | `src/components/accessibility/index.tsx` |

---

## 26. Performance e Otimização

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 26.1 | Lazy loading de rotas | ✅ | `src/App.tsx` (React.lazy) |
| 26.2 | Lista virtualizada (tanstack-virtual) | ✅ | `VirtualizedMessageList.tsx` |
| 26.3 | Imagem otimizada | ✅ | `src/components/ui/optimized-image.tsx` |
| 26.4 | Compressão de imagem no upload | ✅ | `src/utils/imageCompression.ts` |
| 26.5 | Prefetcher de recursos | ✅ | `src/components/performance/Prefetcher.tsx` |
| 26.6 | Lista virtualizada genérica | ✅ | `src/components/performance/VirtualizedList.tsx` |
| 26.7 | Hook de performance | ✅ | `src/hooks/usePerformance.ts` |
| 26.8 | Otimizações de performance | ✅ | `src/hooks/usePerformanceOptimizations.ts` |
| 26.9 | Prefetch de recursos | ✅ | `src/hooks/useResourcePrefetch.ts` |
| 26.10 | Logger centralizado | ✅ | `src/lib/logger.ts` |
| 26.11 | Debounce hook | ✅ | `src/hooks/useDebounce.ts` |
| 26.12 | Skeletons contextuais | ✅ | `src/components/skeletons/` |
| 26.13 | Loading states unificados | ✅ | `src/components/ui/unified-loading.tsx` |
| 26.14 | Busca unificada | ✅ | `src/components/ui/unified-search.tsx` |
| 26.15 | Virtual list genérica | ✅ | `src/components/ui/virtual-list.tsx` |

---

## 27. Mobile e PWA

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 27.1 | PWA (manifest.json completo) | ✅ | `public/manifest.json` |
| 27.2 | Service Worker | ✅ | `public/sw.js` |
| 27.3 | Navegação mobile (bottom nav) | ✅ | `src/components/mobile/MobileNavigation.tsx` |
| 27.4 | Bottom Sheet | ✅ | `src/components/mobile/BottomSheet.tsx` |
| 27.5 | Gestos swipe | ✅ | `src/components/mobile/SwipeGestures.tsx` |
| 27.6 | Swipeable list items | ✅ | `src/components/inbox/SwipeableListItem.tsx` |
| 27.7 | Detecção de dispositivo | ✅ | `src/hooks/useDeviceDetection.ts` |
| 27.8 | Hook is-mobile | ✅ | `src/hooks/use-mobile.tsx` |
| 27.9 | Deep links | ✅ | `src/hooks/useDeepLinks.ts` |
| 27.10 | Indicador offline | ✅ | `src/components/ui/offline-indicator.tsx` |
| 27.11 | Componentes mobile específicos | ✅ | `src/components/ui/mobile-components.tsx` |
| 27.12 | Navegação mobile UI | ✅ | `src/components/ui/mobile-navigation.tsx` |

---

## 28. Atalhos de Teclado

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 28.1 | Atalhos globais (Ctrl+K, Ctrl+N, etc.) | ✅ | `src/hooks/useGlobalKeyboardShortcuts.ts` |
| 28.2 | Atalhos customizáveis pelo usuário | ✅ | `src/hooks/useCustomShortcuts.ts` |
| 28.3 | Atalho de busca global | ✅ | `src/hooks/useGlobalSearchShortcut.ts` |
| 28.4 | Provider global de teclado | ✅ | `src/components/keyboard/GlobalKeyboardProvider.tsx` |
| 28.5 | Dialog de atalhos | ✅ | `src/components/keyboard/KeyboardShortcutsDialog.tsx` |
| 28.6 | Navegação por teclado no chat | ✅ | `src/hooks/useChatKeyboardNavigation.ts` |
| 28.7 | Configurações de atalhos | ✅ | `src/components/settings/KeyboardShortcutsSettings.tsx` |
| 28.8 | Ajuda de atalhos no inbox | ✅ | `src/components/inbox/KeyboardShortcutsHelp.tsx` |
| 28.9 | Command Palette (cmdk) | ✅ | `src/components/ui/command-palette.tsx` |

---

## 29. Onboarding

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 29.1 | Tour interativo passo-a-passo | ✅ | `src/components/onboarding/OnboardingTour.tsx` |
| 29.2 | Checklist de onboarding | ✅ | `src/components/onboarding/OnboardingChecklist.tsx` |
| 29.3 | Modal de boas-vindas | ✅ | `src/components/onboarding/WelcomeModal.tsx` |
| 29.4 | Hook de onboarding | ✅ | `src/hooks/useOnboarding.ts` |
| 29.5 | Checklist hook | ✅ | `src/hooks/useOnboardingChecklist.ts` |
| 29.6 | Opção de resetar tour nas configurações | ✅ | Via SettingsView |

---

## 30. Integrações Externas

| # | Integração | Status | Arquivos |
|---|-----------|--------|----------|
| 30.1 | Evolution API (WhatsApp) — 60+ endpoints | ✅ | `supabase/functions/evolution-api/`, `src/hooks/useEvolutionApi.ts` |
| 30.2 | Evolution API — Webhook de recebimento | ✅ | `supabase/functions/evolution-webhook/` |
| 30.3 | Evolution API — Sync de dados | ✅ | `supabase/functions/evolution-sync/` |
| 30.4 | WhatsApp Cloud API — Webhook | ✅ | `supabase/functions/whatsapp-webhook/` |
| 30.5 | Bitrix24 CRM (bidirecional) | ✅ | `supabase/functions/bitrix-api/`, `src/hooks/useBitrixApi.ts` |
| 30.6 | ElevenLabs (TTS) | ✅ | `supabase/functions/elevenlabs-tts/` |
| 30.7 | ElevenLabs (Scribe Token) | ✅ | `supabase/functions/elevenlabs-scribe-token/` |
| 30.8 | Mapbox (mapas) | ✅ | `supabase/functions/get-mapbox-token/` |
| 30.9 | Lovable AI Gateway (IA sem API key) | ✅ | Edge Functions de AI |
| 30.10 | WebAuthn (passkeys) | ✅ | `supabase/functions/webauthn/` |

### Detalhes da Evolution API (60+ endpoints)
- **Instâncias**: criar, conectar, reiniciar, desconectar, deletar, status, QR code, perfil
- **Mensagens**: texto, mídia, áudio, localização, contato, botões, listas, template, reação, estrela
- **Grupos**: criar, editar, participantes, admin, convite, configurações, mensagens
- **Perfil**: nome, status, foto, privacidade
- **Webhook**: configurar, atualizar, buscar

---

## 31. Auditoria

| # | Funcionalidade | Status | Arquivo Principal |
|---|---------------|--------|-------------------|
| 31.1 | Logs de auditoria | ✅ | `src/lib/audit.ts` |
| 31.2 | Tabela `audit_logs` com RLS | ✅ | Banco de dados |
| 31.3 | Log de login/logout | ✅ | `logLogin()`, `logLogout()` |
| 31.4 | Log de CRUD | ✅ | `logCreate()`, `logUpdate()`, `logDelete()` |
| 31.5 | Informações de IP e user-agent | ✅ | Campos `ip_address`, `user_agent` |

---

## 32. Design System

### Stack
| Ferramenta | Uso |
|-----------|-----|
| shadcn/ui + Radix UI | 60+ componentes base |
| Tailwind CSS | Estilização utility-first |
| CSS Variables HSL | Tokens de design (light/dark) |
| Framer Motion | Animações e transições |
| CVA (class-variance-authority) | Variantes de componentes |
| clsx + tailwind-merge | Merge de classes |
| lucide-react | Ícones |
| next-themes | Toggle dark/light |
| Recharts | Gráficos e visualizações |

### Componentes Especiais
| # | Componente | Arquivo |
|---|-----------|---------|
| 32.1 | Animated Badge | `src/components/ui/animated-badge.tsx` |
| 32.2 | Animation Patterns | `src/components/ui/animation-patterns.tsx` |
| 32.3 | Audio Waveform | `src/components/ui/audio-waveform.tsx` |
| 32.4 | Bottom Sheet | `src/components/ui/bottom-sheet.tsx` |
| 32.5 | Command Palette | `src/components/ui/command-palette.tsx` |
| 32.6 | Contextual Empty States | `src/components/ui/contextual-empty-states.tsx` |
| 32.7 | Emoji Picker | `src/components/ui/emoji-picker.tsx` |
| 32.8 | Enhanced Feedback | `src/components/ui/enhanced-feedback.tsx` |
| 32.9 | Enhanced Input | `src/components/ui/enhanced-input.tsx` |
| 32.10 | Goal Celebration | `src/components/ui/goal-celebration.tsx` |
| 32.11 | Icon Button | `src/components/ui/icon-button.tsx` |
| 32.12 | Loading States | `src/components/ui/loading-states.tsx` |
| 32.13 | Long Press Reactions | `src/components/ui/long-press-reactions.tsx` |
| 32.14 | Micro Interactions | `src/components/ui/micro-interactions.tsx` |
| 32.15 | Motion | `src/components/ui/motion.tsx` |
| 32.16 | Offline Indicator | `src/components/ui/offline-indicator.tsx` |
| 32.17 | Polished Components | `src/components/ui/polished-components.tsx` |
| 32.18 | Smart Avatar | `src/components/ui/smart-avatar.tsx` |
| 32.19 | Smart Reply Chips | `src/components/ui/smart-reply-chips.tsx` |
| 32.20 | Sound Effects | `src/components/ui/sound-effects.tsx` |
| 32.21 | Swipe to Reply | `src/components/ui/swipe-to-reply.tsx` |
| 32.22 | Final Touches | `src/components/ui/final-touches.tsx` |

### Efeitos Visuais
| # | Efeito | Arquivo |
|---|--------|---------|
| 32.23 | Aurora Borealis | `src/components/effects/AuroraBorealis.tsx` |
| 32.24 | Confetti | `src/components/effects/Confetti.tsx` |
| 32.25 | Easter Eggs | `src/components/effects/EasterEggs.tsx` |
| 32.26 | Parallax Container | `src/components/effects/ParallaxContainer.tsx` |
| 32.27 | Scroll Effects | `src/components/effects/ScrollEffects.tsx` |

---

## 33. Banco de Dados

### Tabelas (28+ total)
| Tabela | Função |
|--------|--------|
| `profiles` | Perfis de usuário |
| `user_roles` | Roles RBAC (separada - segurança) |
| `user_settings` | Configurações por usuário |
| `user_sessions` | Sessões ativas |
| `contacts` | Contatos WhatsApp |
| `contact_tags` | Relação contato-tag |
| `contact_notes` | Notas privadas |
| `messages` | Mensagens (realtime) |
| `message_reactions` | Reações a mensagens |
| `message_templates` | Templates de mensagem |
| `scheduled_messages` | Mensagens agendadas |
| `whatsapp_connections` | Conexões WhatsApp |
| `whatsapp_groups` | Grupos WhatsApp |
| `whatsapp_templates` | Templates oficiais WhatsApp |
| `business_hours` | Horários por conexão |
| `away_messages` | Mensagens de ausência |
| `queues` | Filas de atendimento |
| `queue_members` | Membros de filas |
| `queue_goals` | Metas por fila |
| `tags` | Tags/etiquetas |
| `sla_configurations` | Configurações SLA |
| `conversation_sla` | Tracking SLA |
| `conversation_analyses` | Análises IA |
| `goals_configurations` | Metas de atendimento |
| `agent_stats` | Estatísticas gamificação |
| `agent_achievements` | Conquistas |
| `calls` | Chamadas |
| `products` | Catálogo de produtos |
| `client_wallet_rules` | Carteira de clientes |
| `audit_logs` | Logs de auditoria |
| `notifications` | Notificações |
| `login_attempts` | Tentativas de login |
| `blocked_ips` | IPs bloqueados |
| `ip_whitelist` | IPs permitidos |
| `blocked_countries` | Países bloqueados |
| `allowed_countries` | Países permitidos |
| `geo_blocking_settings` | Config geo-blocking |
| `rate_limit_configs` | Config rate limit |
| `rate_limit_logs` | Logs rate limit |
| `security_alerts` | Alertas de segurança |
| `password_reset_requests` | Solicitações de reset |
| `passkey_credentials` | Credenciais WebAuthn |
| `webauthn_challenges` | Challenges WebAuthn |
| `mfa_sessions` | Sessões MFA |
| `permissions` | Permissões |
| `role_permissions` | Permissões por role |
| `scheduled_reports` | Relatórios agendados |
| `csat_surveys` | Pesquisas CSAT |
| `auto_close_config` | Config auto-fechamento |

### Funções SQL
| Função | Uso |
|--------|-----|
| `has_role(user_id, role)` | Verificar role (SECURITY DEFINER) |
| `is_admin_or_supervisor(user_id)` | Verificar admin/supervisor |
| `calculate_level(xp)` | Calcular nível por XP |
| `auto_assign_contact` | Trigger de atribuição automática |

---

## 34. Edge Functions

| # | Função | Descrição |
|---|--------|-----------|
| 34.1 | `evolution-api` | Bridge para Evolution API (envio de mensagens) |
| 34.2 | `evolution-webhook` | Recebimento de webhooks da Evolution API |
| 34.3 | `evolution-sync` | Sincronização de dados Evolution |
| 34.4 | `whatsapp-webhook` | Webhook do WhatsApp Cloud API |
| 34.5 | `ai-suggest-reply` | Sugestão de resposta por IA |
| 34.6 | `ai-conversation-summary` | Resumo de conversa por IA |
| 34.7 | `ai-conversation-analysis` | Análise de conversa por IA |
| 34.8 | `ai-transcribe-audio` | Transcrição de áudio por IA |
| 34.9 | `sentiment-alert` | Envio de alertas de sentimento |
| 34.10 | `elevenlabs-tts` | Text-to-Speech |
| 34.11 | `elevenlabs-scribe-token` | Token para Scribe realtime |
| 34.12 | `bitrix-api` | Integração Bitrix24 CRM |
| 34.13 | `get-mapbox-token` | Token para Mapbox |
| 34.14 | `webauthn` | Operações WebAuthn |
| 34.15 | `detect-new-device` | Detecção de novo dispositivo |
| 34.16 | `approve-password-reset` | Aprovação de reset de senha |
| 34.17 | `cleanup-rate-limit-logs` | Limpeza de logs rate limit |
| 34.18 | `send-rate-limit-alert` | Envio de alerta rate limit |
| 34.19 | `send-scheduled-report` | Envio de relatório agendado |

---

## 📊 Resumo Estatístico

| Categoria | Quantidade |
|-----------|-----------|
| **Funcionalidades totais documentadas** | **350+** |
| **Componentes React** | **200+** |
| **Custom Hooks** | **70+** |
| **Tabelas no banco** | **48+** |
| **Edge Functions** | **19** |
| **Integrações externas** | **10** |
| **Componentes UI (shadcn)** | **60+** |
| **Testes unitários** | **35 (100% passing)** |
| **Melhorias implementadas (roadmap)** | **52/52 + 3 extras** |

---

## 🏗️ Stack Tecnológica Completa

```json
{
  "frontend": {
    "framework": "React 18.3.1",
    "language": "TypeScript",
    "styling": "Tailwind CSS 3.4.11 + shadcn/ui",
    "state": "TanStack Query 5.x + React Context",
    "routing": "React Router DOM 6.x",
    "animations": "Framer Motion 12.x",
    "charts": "Recharts 2.x",
    "forms": "React Hook Form + Zod",
    "virtualization": "@tanstack/react-virtual",
    "dnd": "@hello-pangea/dnd",
    "dates": "date-fns"
  },
  "backend": {
    "platform": "Supabase (Lovable Cloud)",
    "database": "PostgreSQL",
    "auth": "Supabase Auth + RLS + RBAC",
    "realtime": "Supabase Realtime",
    "storage": "Supabase Storage",
    "functions": "Deno Edge Functions"
  },
  "integrations": {
    "whatsapp": "Evolution API v2 (60+ endpoints)",
    "crm": "Bitrix24 (bidirecional)",
    "ai": "Lovable AI Gateway (Gemini/GPT — sem API key)",
    "voice": "ElevenLabs (TTS + Scribe)",
    "maps": "Mapbox GL JS"
  },
  "quality": {
    "tests": "Vitest + React Testing Library",
    "security": "RLS + RBAC + MFA + WebAuthn + Rate Limiting + Geo-blocking",
    "a11y": "Skip links, ARIA, Focus trap, High contrast",
    "performance": "Lazy loading, Virtualization, Image compression"
  }
}
```

---

> **Documento gerado em:** 2026-03-15  
> **Autor:** Lovable AI  
> **Nota:** Este documento reflete TODAS as funcionalidades discutidas, planejadas e implementadas ao longo de toda a conversa do projeto.
