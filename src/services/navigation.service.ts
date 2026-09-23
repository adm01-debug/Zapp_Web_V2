import type { AppRole } from './role.service';
import type { LucideIcon } from 'lucide-react';
import { 
  MessageSquare, MessagesSquare, Mail, User, BarChart3, Kanban, Sparkles, Settings,
  Building2, Wallet, Package, CreditCard, Tag, LayoutDashboard, CalendarClock, UsersRound,
  Bot, RefreshCw, Workflow, Brain, TrendingDown, Tags, Megaphone, FileText,
  FileBarChart, AlertTriangle, HeartPulse, Gauge, Target, Trophy,
  Link2, Plug, Inbox, PhoneCall, Activity, Calendar,
  Phone, Shield, ShieldCheck, UserCog, Palette, BookOpen, Lock,
  ScrollText, ClipboardList, Mic, Compass, Cpu, BarChartHorizontal, BrainCircuit,
  Webhook, HardDrive, Landmark, FlaskConical, ListChecks,
} from 'lucide-react';

export interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
  roles?: AppRole[];
  permission?: string;
  /** 'full' = view manages its own layout (no ViewContainer scroll wrapper) */
  layout?: 'full' | 'scroll';
  /** Atalho global Alt+letra (ver useNavShortcuts) */
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

// Grupos visiveis apenas para staff (supervisor/admin). Usado por filterNavItems
// para negar por padrao qualquer id nao mapeado (nunca autorizar por omissao).
const STAFF_ROLES: AppRole[] = ['admin', 'supervisor'];
const ADMIN_ONLY: AppRole[] = ['admin'];

export class NavigationService {
  static getPrimaryNav(): NavItem[] {
    return [
      { id: 'inbox', icon: MessageSquare, label: 'Chat', layout: 'full', shortcut: 'Alt+C' },
      { id: 'team-chat', icon: MessagesSquare, label: 'Teams', layout: 'full', shortcut: 'Alt+M' },
      { id: 'email-chat', icon: Mail, label: 'Email', layout: 'full', shortcut: 'Alt+L' },
      { id: 'contacts', icon: User, label: 'Contatos', shortcut: 'Alt+O' },
      { id: 'catalog', icon: Package, label: 'Catálogo', shortcut: 'Alt+A' },
      { id: 'voip', icon: PhoneCall, label: 'Telefonia', shortcut: 'Alt+T' },
      { id: 'pipeline', icon: Kanban, label: 'Pipeline', layout: 'full', shortcut: 'Alt+P' },
      { id: 'tasks', icon: ListChecks, label: 'Tarefas', shortcut: 'Alt+K' },
      { id: 'achievements', icon: Trophy, label: 'Conquistas', shortcut: 'Alt+Q' },
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', shortcut: 'Alt+R' },
    ];
  }

  static getGroups(): NavGroup[] {
    return [
      {
        label: 'Vendas & CRM',
        icon: Kanban,
        items: [
          { id: 'crm360', icon: Building2, label: 'CRM 360°', roles: ADMIN_ONLY },
          { id: 'wallet', icon: Wallet, label: 'Carteira', roles: STAFF_ROLES },
          { id: 'tags', icon: Tag, label: 'Etiquetas', roles: STAFF_ROLES },
          { id: 'queues', icon: LayoutDashboard, label: 'Filas', roles: STAFF_ROLES },
          { id: 'schedule', icon: CalendarClock, label: 'Agendamentos', roles: STAFF_ROLES },
          { id: 'groups', icon: UsersRound, label: 'Grupos', roles: STAFF_ROLES },
        ],
      },
      {
        label: 'Automação & IA',
        icon: Bot,
        items: [
          { id: 'talkx', icon: Sparkles, label: 'Campanhas', roles: STAFF_ROLES },
          { id: 'chatbot', icon: Bot, label: 'Chatbot', roles: STAFF_ROLES },
          { id: 'automations', icon: RefreshCw, label: 'Automações', roles: STAFF_ROLES },
          { id: 'wa-flows', icon: Workflow, label: 'WhatsApp Flows', roles: STAFF_ROLES },
          { id: 'knowledge', icon: Brain, label: 'Base de Conhecimento', roles: STAFF_ROLES },
          { id: 'churn', icon: TrendingDown, label: 'Previsão Churn', roles: STAFF_ROLES },
          { id: 'ticket-classifier', icon: Tags, label: 'Classificador IA', roles: STAFF_ROLES },
          { id: 'campaigns', icon: Megaphone, label: 'Campanhas Clássicas', roles: STAFF_ROLES },
          { id: 'wa-templates', icon: FileText, label: 'Templates WA', roles: STAFF_ROLES },
        ],
      },
      {
        label: 'Analytics',
        icon: BarChart3,
        items: [
          { id: 'reports', icon: FileBarChart, label: 'Relatórios', roles: STAFF_ROLES },
          { id: 'warroom', icon: AlertTriangle, label: 'War Room', roles: STAFF_ROLES },
          { id: 'sentiment', icon: HeartPulse, label: 'Sentimento', roles: STAFF_ROLES },
          { id: 'nps', icon: Gauge, label: 'NPS', roles: STAFF_ROLES },
          { id: 'sla', icon: Target, label: 'SLA', roles: STAFF_ROLES },
        ],
      },
      {
        label: 'Conexões',
        icon: Plug,
        items: [
          { id: 'connections', icon: Link2, label: 'Conexões', roles: STAFF_ROLES },
          { id: 'integrations', icon: Plug, label: 'Integrações', roles: STAFF_ROLES },
          { id: 'omni-inbox', icon: Inbox, label: 'Omnichannel', layout: 'full', roles: STAFF_ROLES },
          { id: 'gmail', icon: Mail, label: 'Gmail', roles: STAFF_ROLES },
          { id: 'omnichannel', icon: Plug, label: 'Canais Omnichannel', roles: STAFF_ROLES },
        ],
      },
      {
        label: 'Sistema',
        icon: Lock,
        items: [
          { id: 'agents', icon: Phone, label: 'Equipe', roles: STAFF_ROLES },
          { id: 'security', icon: Shield, label: 'Segurança', roles: STAFF_ROLES },
          { id: 'privacy', icon: ShieldCheck, label: 'LGPD', roles: STAFF_ROLES },
          { id: 'admin', icon: UserCog, label: 'Admin', roles: ADMIN_ONLY },
          { id: 'themes', icon: Palette, label: 'Skins', roles: STAFF_ROLES },
          { id: 'docs', icon: BookOpen, label: 'Documentação', roles: STAFF_ROLES },
          { id: 'settings', icon: Settings, label: 'Configurações' }, // sem roles: SettingsView.tsx já filtra as 12 abas de sistema por isStaff; agente precisa das 4 pessoais
        ],
      },
      {
        // Facades: telas com UI completa mas sem integração real por trás ainda.
        // Mantidas fora dos grupos principais para não confundir o usuário comum;
        // continuam pesquisáveis (Ctrl+K) e acessíveis para quem procurar.
        label: 'Em Desenvolvimento',
        icon: FlaskConical,
        items: [
          { id: 'payments', icon: CreditCard, label: 'Pagamentos', roles: STAFF_ROLES },
          { id: 'meta-capi', icon: Activity, label: 'Meta CAPI', roles: STAFF_ROLES },
          { id: 'google-calendar', icon: Calendar, label: 'Calendário', roles: STAFF_ROLES },
        ],
      },
    ];
  }

  static getAdvancedNav(): NavItem[] {
    return [
      { id: 'audit-logs', icon: ScrollText, label: 'Auditoria', roles: ADMIN_ONLY },
      { id: 'auto-export', icon: ClipboardList, label: 'Export Auto', roles: ADMIN_ONLY },
      { id: 'transcriptions', icon: Mic, label: 'Transcrições', roles: ADMIN_ONLY },
      { id: 'diagnostics', icon: Compass, label: 'Diagnóstico', roles: ADMIN_ONLY },
      { id: 'performance', icon: Cpu, label: 'Performance', roles: ADMIN_ONLY },
      { id: 'telemetry', icon: BarChartHorizontal, label: 'Telemetria BD', roles: ADMIN_ONLY },
      { id: 'ai-usage', icon: BrainCircuit, label: 'Consumo IA', roles: ADMIN_ONLY },
      { id: 'gmail-webhook', icon: Webhook, label: 'Gmail Webhook', roles: ADMIN_ONLY },
      { id: 'media-migration', icon: HardDrive, label: 'Migração Mídia', roles: ADMIN_ONLY },
      { id: 'sicoob-bridge', icon: Landmark, label: 'Sicoob Bridge', roles: ADMIN_ONLY },
      { id: 'evolution-monitor', icon: Activity, label: 'Monitor Evolution', roles: ADMIN_ONLY },
      { id: 'public-api', icon: Webhook, label: 'API Pública', roles: ADMIN_ONLY },
    ];
  }

  static filterNavItems(items: NavItem[], userRoles: AppRole[]): NavItem[] {
    return items.filter(item => {
      if (item.roles && !item.roles.some(role => userRoles.includes(role))) return false;
      return true;
    });
  }

  /**
   * Autorização por id de view — usada pelo ViewRouter para bloquear acesso
   * direto via ?view= mesmo quando o item está escondido do menu.
   * Id desconhecido = negado (nunca autoriza por omissão).
   */
  static canAccess(viewId: string, userRoles: AppRole[]): boolean {
    const all = [
      ...this.getPrimaryNav(),
      ...this.getGroups().flatMap(g => g.items),
      ...this.getAdvancedNav(),
    ];
    const item = all.find(i => i.id === viewId);
    if (!item) return false;
    if (!item.roles) return true;
    return item.roles.some(role => userRoles.includes(role));
  }

  static getViewLabel(viewId: string): string {
    const all = [
      ...this.getPrimaryNav(),
      ...this.getGroups().flatMap(g => g.items),
      ...this.getAdvancedNav(),
    ];
    return all.find(item => item.id === viewId)?.label ?? viewId;
  }
}
