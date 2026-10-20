import {
  Shield, MessageSquare, FileText, Headphones, Brain, Users, Layers,
  Clock, Trophy, BarChart3, Download, Star, ShoppingCart, Wifi, Layout,
  UsersRound, Phone, Wallet, Zap, Bell, CalendarClock, MapPin, Settings,
  Lock, Accessibility, Gauge, Smartphone, Keyboard, GraduationCap,
  Plug, ClipboardList, Palette, Database, Cloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FeatureSection {
  id: number;
  title: string;
  icon: LucideIcon;
  color: string;
  items: string[];
}

export const sections: FeatureSection[] = [
  {
    id: 1, title: "Autenticação e Segurança", icon: Shield, color: "text-destructive",
    items: [
      "Login com email/senha", "Cadastro de novos usuários", "Verificação de email obrigatória",
      "Recuperação de senha", "Reset de senha", "Indicador de força de senha",
      "MFA (Autenticação de Dois Fatores)", "Verificação MFA no login", "Configurações MFA",
      "Passkeys (WebAuthn)", "Rotas protegidas", "RBAC (3 níveis: admin, supervisor, agent)",
      "Tabela user_roles separada (segurança)", "Função SQL has_role()", "Função SQL is_admin_or_supervisor()",
      "Permission Gate (controle por permissão)", "Matriz de permissões", "Reautenticação para ações sensíveis",
      "Bloqueio de tentativas de login", "SSO Callback", "Prova social na tela de login",
      "Benefícios exibidos no login", "Aprovação de reset de senha por admin"
    ]
  },
  {
    id: 2, title: "Inbox / Chat em Tempo Real", icon: MessageSquare, color: "text-info",
    items: [
      "Lista de conversas em tempo real", "Lista virtualizada (performance)", "Lista de mensagens virtualizada",
      "Painel de chat completo", "Detalhes do contato no chat", "Filtros de inbox",
      "Busca global (Ctrl+K)", "Indicador de digitação", "Presença de digitação realtime",
      "Indicador de novas mensagens", "Responder/Citar mensagem", "Encaminhar mensagem",
      "Copiar mensagem", "Reações a mensagens (emojis)", "Menu de contexto de mensagem",
      "Menu de contexto de conversa", "Preview de mensagem", "Preview de links",
      "Status de mensagem (enviado/entregue/lido/falhou)", "Indicador de SLA no chat",
      "Indicador de sentimento", "Transferir conversa", "Notas privadas internas",
      "Colaboração em tempo real", "Histórico de conversas", "Galeria de mídias",
      "Resumo de conversa (IA)", "Sugestões de resposta (IA)", "Assistente de conversa (IA)",
      "Templates de mensagem", "Templates com variáveis dinâmicas", "Respostas rápidas",
      "Slash Commands", "Ações em bulk", "Upload de arquivos (drag & drop)",
      "Preview de imagem", "Preview de mídia", "Swipe-to-reply (mobile)",
      "Reações por toque longo", "Smart Reply Chips", "Barra de ações do agente",
      "Atalhos de teclado no chat", "Emoji picker com histórico"
    ]
  },
  {
    id: 3, title: "Mensagens WhatsApp (Tipos)", icon: FileText, color: "text-success",
    items: [
      "Texto", "Imagem (até 16MB)", "Vídeo (até 16MB)", "Áudio",
      "Documento (até 100MB)", "Localização", "Mensagens interativas (botões)",
      "Mensagens interativas (lista)", "Mensagens interativas (CTA URL)",
      "Resposta de botão", "Stickers (até 100KB)", "Mensagem encaminhada",
      "Mensagem de produto", "Mensagem de pagamento"
    ]
  },
  {
    id: 4, title: "Áudio e Transcrição", icon: Headphones, color: "text-primary",
    items: [
      "Gravação de áudio no chat", "Player de áudio customizado", "Visualização de ondas de áudio",
      "Seletor de velocidade de reprodução", "Text-to-Speech (ElevenLabs)", "Seletor de vozes TTS",
      "Transcrição automática de áudios (IA)", "Transcrição em tempo real (Scribe)",
      "Status de transcrição", "Histórico de transcrições", "Notificação de transcrição completa",
      "Configuração auto-transcrição on/off"
    ]
  },
  {
    id: 5, title: "Inteligência Artificial", icon: Brain, color: "text-destructive",
    items: [
      "Sugestão de respostas contextuais", "Resumo automático de conversa",
      "Análise de conversa (sentimento, tópicos, urgência)", "Alertas de sentimento negativo",
      "Score de sentimento por conversa", "Tendência de sentimento",
      "Alertas configuráveis por threshold", "Detecção de sentimento consecutivo negativo",
      "Dashboard de alertas de sentimento", "Widget de estatísticas IA",
      "Acesso rápido IA no dashboard", "Gerador de avatar por IA", "Predição de demanda"
    ]
  },
  {
    id: 6, title: "Gestão de Contatos", icon: Users, color: "text-info",
    items: [
      "CRUD de contatos", "Campos estendidos (nome, apelido, sobrenome, cargo, empresa)",
      "Avatar de contato", "Atribuição de contato a agente", "Atribuição a fila",
      "Tags/etiquetas em contatos", "Notas privadas por contato", "Tipo de contato",
      "Importação de contatos", "Exportação de contatos", "Duplicação de contato",
      "Busca e filtros avançados", "Filtros salvos", "Scroll infinito na lista",
      "Ações em bulk", "Versionamento de registros"
    ]
  },
  {
    id: 7, title: "Filas de Atendimento", icon: Layers, color: "text-warning",
    items: [
      "CRUD de filas", "Cores por fila", "Prioridade por fila",
      "Tempo máximo de espera configurável", "Membros por fila", "Metas por fila (configuráveis)",
      "Alertas de fila", "Gráficos analíticos por fila", "Comparação entre filas",
      "Detalhes da fila com analytics", "Seletor de período", "Atribuição automática"
    ]
  },
  {
    id: 8, title: "SLA (Service Level Agreement)", icon: Clock, color: "text-warning",
    items: [
      "Configuração de SLA (tempo resposta/resolução)", "Tracking de SLA por conversa",
      "Indicador visual de SLA no chat", "Dashboard de métricas SLA",
      "Dashboard SLA dedicado", "Histórico de SLA", "Notificações de breach de SLA",
      "Provider de notificações SLA"
    ]
  },
  {
    id: 9, title: "Gamificação", icon: Trophy, color: "text-warning",
    items: [
      "Sistema de XP e níveis", "Conquistas/Badges", "Painel de conquistas",
      "Toast de conquista desbloqueada", "Leaderboard (ranking)", "Ranking de agentes por metas",
      "Streak de dias consecutivos", "Efeito de confetti", "Celebração de metas",
      "Mini-games de treinamento", "Provider de gamificação", "Efeitos gamificação no dashboard"
    ]
  },
  {
    id: 10, title: "Dashboard e Métricas", icon: BarChart3, color: "text-primary",
    items: [
      "Dashboard principal com métricas", "Filtros globais (período, fila, agente)",
      "Dashboard personalizável (drag & drop)", "Progressive Disclosure",
      "Dashboard de metas", "Configuração de metas", "Comparação de métricas",
      "Indicador de tendência", "Heatmap de atividade", "Heatmap de conversas",
      "Predição de demanda (IA)", "War Room (supervisores)", "Métricas de satisfação",
      "Dashboard de alertas de sentimento", "Gráfico de tendência de sentimento",
      "Partículas flutuantes decorativas", "Aurora Borealis (efeito decorativo)"
    ]
  },
  {
    id: 11, title: "Relatórios e Exportação", icon: Download, color: "text-info",
    items: [
      "Relatórios avançados", "Exportação avançada (wizard 3 passos)",
      "Exportar para PDF", "Exportar para Excel", "Exportar para CSV",
      "Botão de exportação rápida", "Relatórios agendados por email",
      "Edge function para envio de relatórios"
    ]
  },
  {
    id: 12, title: "CSAT (Satisfação do Cliente)", icon: Star, color: "text-warning",
    items: [
      "Pesquisa de satisfação (1-5 estrelas)", "Feedback textual opcional",
      "Dashboard CSAT (média, distribuição, feedbacks)", "Hook completo de CSAT",
      "Filtro por período", "Tabela csat_surveys com RLS", "Realtime habilitado para CSAT"
    ]
  },
  {
    id: 13, title: "Catálogo de Produtos e E-commerce", icon: ShoppingCart, color: "text-success",
    items: [
      "Catálogo de produtos", "Card de produto", "Gerenciamento de produtos (CRUD)",
      "Mensagem de produto no chat", "Mensagem de pagamento (PIX, status)",
      "Carrinho de compras", "Hook do carrinho", "Gerenciador de templates WhatsApp"
    ]
  },
  {
    id: 14, title: "Conexões WhatsApp", icon: Wifi, color: "text-success",
    items: [
      "Gerenciamento de conexões", "QR Code para conexão",
      "Status de conexão", "Horário comercial por conexão",
      "Indicador de horário comercial", "Mensagem de ausência",
      "Sincronização com Evolution API"
    ]
  },
  {
    id: 15, title: "Templates WhatsApp Oficiais", icon: Layout, color: "text-info",
    items: [
      "CRUD de templates oficiais", "Preview estilo WhatsApp",
      "Variáveis dinâmicas ({{1}}, {{2}})", "Categorias (utility, marketing, authentication)",
      "Status do template", "Header, body, footer e botões"
    ]
  },
  {
    id: 16, title: "Grupos WhatsApp", icon: UsersRound, color: "text-success",
    items: [
      "Visualização de grupos", "Sincronização de grupos",
      "Contagem de participantes", "Status de admin do bot"
    ]
  },
  {
    id: 17, title: "Chamadas (Calls)", icon: Phone, color: "text-accent",
    items: [
      "Diálogo de chamada", "Chamadas inbound/outbound",
      "Status (ringing/answered/ended)", "Duração e gravação",
      "Notas de chamada", "Hook de chamadas"
    ]
  },
  {
    id: 18, title: "Carteira de Clientes", icon: Wallet, color: "text-destructive",
    items: [
      "Regras de carteira", "Atribuição automática por regras",
      "Prioridade de regras", "Ativação/desativação de regras"
    ]
  },
  {
    id: 19, title: "Automações", icon: Zap, color: "text-warning",
    items: [
      "Gerenciador de automações", "Atribuição automática de chats",
      "Métodos de distribuição (round-robin, aleatório, menor carga)",
      "Timeout de inatividade", "Auto-fechamento de conversas inativas",
      "Configuração de horas de inatividade", "Mensagem de encerramento customizável",
      "Transcrição automática de áudios"
    ]
  },
  {
    id: 20, title: "Notificações", icon: Bell, color: "text-warning",
    items: [
      "Central de notificações", "Central aprimorada", "Push notifications (browser)",
      "Configurações de push", "Painel de configurações", "Sons personalizáveis",
      "Tipos de som (mensagem, menção, SLA, meta, transcrição)", "Horários silenciosos",
      "Notificações de metas", "Notificações de SLA", "Alertas de sentimento em tempo real",
      "Notificações de segurança push", "Service Worker para push"
    ]
  },
  {
    id: 21, title: "Agendamento de Mensagens", icon: CalendarClock, color: "text-info",
    items: [
      "Agendar mensagem para envio futuro", "Visualização em calendário",
      "Cancelamento de agendamento", "Filtro por agente",
      "Hook de mensagens agendadas", "Suporte a anexos no agendamento"
    ]
  },
  {
    id: 22, title: "Localização e Mapas", icon: MapPin, color: "text-destructive",
    items: [
      "Mapa interativo (Mapbox)", "Seletor de localização",
      "Exibição de localização recebida", "Edge function para token Mapbox"
    ]
  },
  {
    id: 23, title: "Configurações do Sistema", icon: Settings, color: "text-muted-foreground",
    items: [
      "Página de configurações", "Horário de funcionamento",
      "Mensagens automáticas (boas-vindas, ausência, encerramento)",
      "Automações (atribuição, transcrição)", "Auto-fechamento de conversas",
      "Notificações", "Aparência (tema, modo compacto)", "Atalhos de teclado personalizáveis",
      "Sons personalizáveis", "Upload de avatar", "Seletor de idioma",
      "Persistência em banco (user_settings)"
    ]
  },
  {
    id: 24, title: "Segurança Avançada", icon: Lock, color: "text-destructive",
    items: [
      "Visão geral de segurança", "Overview de segurança", "Configurações de segurança",
      "Gerenciamento de dispositivos/sessões", "Passkeys (WebAuthn)", "IP Whitelist",
      "IPs bloqueados", "Geo-blocking (países)", "Notificações de segurança",
      "Solicitações de reset de senha (admin)", "Rate limiting configurável",
      "Logs de rate limiting", "Alertas de rate limit em tempo real",
      "Dashboard de rate limiting (admin)", "Detecção de novo dispositivo",
      "Limpeza de logs (cron)", "Envio de alerta por email", "Alertas de segurança (tabela)"
    ]
  },
  {
    id: 25, title: "Acessibilidade", icon: Accessibility, color: "text-info",
    items: [
      "Skip links", "ARIA labels completos", "Focus trap", "Visually hidden",
      "Alto contraste toggle", "Contraste de cores", "Navegação por teclado",
      "Preferências de motion", "Accessible toast", "Module de acessibilidade"
    ]
  },
  {
    id: 26, title: "Performance e Otimização", icon: Gauge, color: "text-success",
    items: [
      "Lazy loading de rotas", "Lista virtualizada (tanstack-virtual)",
      "Imagem otimizada", "Compressão de imagem no upload", "Prefetcher de recursos",
      "Lista virtualizada genérica", "Hook de performance", "Otimizações de performance",
      "Prefetch de recursos", "Logger centralizado", "Debounce hook",
      "Skeletons contextuais", "Loading states unificados", "Busca unificada",
      "Virtual list genérica"
    ]
  },
  {
    id: 27, title: "Mobile e PWA", icon: Smartphone, color: "text-info",
    items: [
      "PWA (manifest.json completo)", "Service Worker", "Navegação mobile (bottom nav)",
      "Bottom Sheet", "Gestos swipe", "Swipeable list items", "Detecção de dispositivo",
      "Hook is-mobile", "Deep links", "Indicador offline",
      "Componentes mobile específicos", "Navegação mobile UI"
    ]
  },
  {
    id: 28, title: "Atalhos de Teclado", icon: Keyboard, color: "text-muted-foreground",
    items: [
      "Atalhos globais (Ctrl+K, Ctrl+N, etc.)", "Atalhos customizáveis pelo usuário",
      "Atalho de busca global", "Provider global de teclado", "Dialog de atalhos",
      "Navegação por teclado no chat", "Configurações de atalhos",
      "Ajuda de atalhos no inbox", "Command Palette (cmdk)"
    ]
  },
  {
    id: 29, title: "Onboarding", icon: GraduationCap, color: "text-primary",
    items: [
      "Tour interativo passo-a-passo", "Checklist de onboarding",
      "Modal de boas-vindas", "Hook de onboarding",
      "Checklist hook", "Opção de resetar tour nas configurações"
    ]
  },
  {
    id: 30, title: "Integrações Externas", icon: Plug, color: "text-success",
    items: [
      "Evolution API (WhatsApp) — 60+ endpoints", "Evolution API — Webhook de recebimento",
      "Evolution API — Sync de dados", "WhatsApp Cloud API — Webhook",
      "Bitrix24 CRM (bidirecional)", "ElevenLabs (TTS)", "ElevenLabs (Scribe Token)",
      "Mapbox (mapas)", "Lovable AI Gateway (IA sem API key)", "WebAuthn (passkeys)"
    ]
  },
  {
    id: 31, title: "Auditoria", icon: ClipboardList, color: "text-muted-foreground",
    items: [
      "Logs de auditoria", "Tabela audit_logs com RLS",
      "Log de login/logout", "Log de CRUD", "Informações de IP e user-agent"
    ]
  },
  {
    id: 32, title: "Design System", icon: Palette, color: "text-destructive",
    items: [
      "shadcn/ui + Radix UI (60+ componentes)", "Tailwind CSS utility-first",
      "CSS Variables HSL (light/dark)", "Framer Motion (animações)",
      "CVA (class-variance-authority)", "clsx + tailwind-merge",
      "lucide-react (ícones)", "Recharts (gráficos)",
      "Animated Badge", "Animation Patterns", "Audio Waveform", "Bottom Sheet",
      "Command Palette", "Contextual Empty States", "Emoji Picker",
      "Enhanced Feedback", "Enhanced Input", "Goal Celebration", "Icon Button",
      "Loading States", "Long Press Reactions", "Micro Interactions", "Motion",
      "Offline Indicator", "Polished Components", "Smart Avatar", "Smart Reply Chips",
      "Sound Effects", "Swipe to Reply", "Final Touches",
      "Aurora Borealis", "Confetti", "Easter Eggs", "Parallax Container", "Scroll Effects"
    ]
  },
  {
    id: 33, title: "Banco de Dados", icon: Database, color: "text-info",
    items: [
      "profiles", "user_roles", "user_settings", "user_sessions", "user_devices",
      "contacts", "contact_tags", "contact_notes", "messages", "message_reactions",
      "message_templates", "scheduled_messages", "whatsapp_connections", "whatsapp_groups",
      "whatsapp_templates", "business_hours", "away_messages", "queues", "queue_members",
      "queue_goals", "tags", "sla_configurations", "conversation_sla", "conversation_analyses",
      "goals_configurations", "agent_stats", "agent_achievements", "calls", "products",
      "client_wallet_rules", "audit_logs", "notifications", "login_attempts", "blocked_ips",
      "ip_whitelist", "blocked_countries", "allowed_countries", "geo_blocking_settings",
      "rate_limit_configs", "rate_limit_logs", "security_alerts", "password_reset_requests",
      "passkey_credentials", "webauthn_challenges", "mfa_sessions", "permissions",
      "role_permissions", "scheduled_reports", "csat_surveys", "auto_close_config"
    ]
  },
  {
    id: 34, title: "Edge Functions", icon: Cloud, color: "text-info",
    items: [
      "evolution-api — Bridge para Evolution API",
      "evolution-webhook — Recebimento de webhooks",
      "evolution-sync — Sincronização de dados",
      "whatsapp-webhook — Webhook WhatsApp Cloud API",
      "ai-suggest-reply — Sugestão de resposta por IA",
      "ai-conversation-summary — Resumo por IA",
      "ai-conversation-analysis — Análise por IA",
      "ai-transcribe-audio — Transcrição por IA",
      "sentiment-alert — Alertas de sentimento",
      "elevenlabs-tts — Text-to-Speech",
      "elevenlabs-scribe-token — Token Scribe",
      "bitrix-api — Integração Bitrix24",
      "get-mapbox-token — Token Mapbox",
      "webauthn — Operações WebAuthn",
      "detect-new-device — Detecção de dispositivo",
      "approve-password-reset — Aprovação de reset",
      "cleanup-rate-limit-logs — Limpeza de logs",
      "send-rate-limit-alert — Alerta rate limit",
      "send-scheduled-report — Relatório agendado"
    ]
  }
];

export const totalFeatures = sections.reduce((sum, s) => sum + s.items.length, 0);
