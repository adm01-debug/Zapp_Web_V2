import { AppRole } from './role.service';
import { 
  MessageSquare, MessagesSquare, Mail, User, BarChart3, Kanban, Sparkles, Settings,
  Building2, Wallet, Package, CreditCard, Tag, LayoutDashboard, CalendarClock, UsersRound,
  Bot, RefreshCw, Workflow, Brain, TrendingDown, Tags, Megaphone, FileText,
  FileBarChart, AlertTriangle, HeartPulse, Gauge, Target, Trophy,
  Link2, Plug, Inbox, PhoneCall, Activity, Calendar,
  Phone, Shield, ShieldCheck, UserCog, Palette, BookOpen, Lock,
  ScrollText, ClipboardList, Mic, Compass, Cpu, BarChartHorizontal, BrainCircuit, Code2, Webhook, HardDrive, Landmark
} from 'lucide-react';

export interface NavItem {
  id: string;
  icon: any;
  label: string;
  roles?: AppRole[];
  permission?: string;
}

export class NavigationService {
  static getPrimaryNav(): NavItem[] {
    return [
      { id: 'inbox', icon: MessageSquare, label: 'Chat' },
      { id: 'team-chat', icon: MessagesSquare, label: 'Teams' },
      { id: 'email-chat', icon: Mail, label: 'Email' },
      { id: 'contacts', icon: User, label: 'Contatos' },
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
      { id: 'pipeline', icon: Kanban, label: 'Pipeline' },
      { id: 'talkx', icon: Sparkles, label: 'Campanhas' },
      { id: 'settings', icon: Settings, label: 'Configurações' },
    ];
  }

  static getGroups() {
    return [
      {
        label: 'Vendas & CRM',
        icon: Kanban,
        items: [
          { id: 'crm360', icon: Building2, label: 'CRM 360°' },
          { id: 'wallet', icon: Wallet, label: 'Carteira' },
          { id: 'catalog', icon: Package, label: 'Catálogo' },
          { id: 'payments', icon: CreditCard, label: 'Pagamentos' },
          { id: 'tags', icon: Tag, label: 'Etiquetas' },
          { id: 'queues', icon: LayoutDashboard, label: 'Filas' },
          { id: 'schedule', icon: CalendarClock, label: 'Agendamentos' },
          { id: 'groups', icon: UsersRound, label: 'Grupos' },
        ]
      },
      {
        label: 'Automação & IA',
        icon: Bot,
        items: [
          { id: 'chatbot', icon: Bot, label: 'Chatbot' },
          { id: 'automations', icon: RefreshCw, label: 'Automações' },
          { id: 'wa-flows', icon: Workflow, label: 'WhatsApp Flows' },
          { id: 'knowledge', icon: Brain, label: 'Base de Conhecimento' },
          { id: 'churn', icon: TrendingDown, label: 'Previsão Churn' },
          { id: 'ticket-classifier', icon: Tags, label: 'Classificador IA' },
          { id: 'campaigns', icon: Megaphone, label: 'Campanhas Clássicas' },
          { id: 'wa-templates', icon: FileText, label: 'Templates WA' },
        ]
      },
      {
        label: 'Analytics',
        icon: BarChart3,
        items: [
          { id: 'reports', icon: FileBarChart, label: 'Relatórios' },
          { id: 'warroom', icon: AlertTriangle, label: 'War Room' },
          { id: 'sentiment', icon: HeartPulse, label: 'Sentimento' },
          { id: 'nps', icon: Gauge, label: 'NPS' },
          { id: 'sla', icon: Target, label: 'SLA' },
          { id: 'achievements', icon: Trophy, label: 'Conquistas' },
        ]
      },
      {
        label: 'Conexões',
        icon: Plug,
        items: [
          { id: 'connections', icon: Link2, label: 'Conexões' },
          { id: 'integrations', icon: Plug, label: 'Integrações' },
          { id: 'omni-inbox', icon: Inbox, label: 'Omnichannel' },
          { id: 'voip', icon: PhoneCall, label: 'VoIP' },
          { id: 'meta-capi', icon: Activity, label: 'Meta CAPI' },
          { id: 'google-calendar', icon: Calendar, label: 'Calendário' },
        ]
      },
      {
        label: 'Sistema',
        icon: Lock,
        items: [
          { id: 'agents', icon: Phone, label: 'Equipe' },
          { id: 'security', icon: Shield, label: 'Segurança' },
          { id: 'privacy', icon: ShieldCheck, label: 'LGPD' },
          { id: 'admin', icon: UserCog, label: 'Admin', roles: ['admin'] },
          { id: 'themes', icon: Palette, label: 'Skins' },
          { id: 'docs', icon: BookOpen, label: 'Documentação' },
        ]
      }
    ];
  }

  static getAdvancedNav(): NavItem[] {
    return [
      { id: 'audit-logs', icon: ScrollText, label: 'Auditoria' },
      { id: 'auto-export', icon: ClipboardList, label: 'Export Auto' },
      { id: 'transcriptions', icon: Mic, label: 'Transcrições' },
      { id: 'diagnostics', icon: Compass, label: 'Diagnóstico' },
      { id: 'performance', icon: Cpu, label: 'Performance' },
      { id: 'telemetry', icon: BarChartHorizontal, label: 'Telemetria BD' },
      { id: 'ai-usage', icon: BrainCircuit, label: 'Consumo IA' },
      { id: 'public-api', icon: Code2, label: 'API Pública' },
      { id: 'gmail-webhook', icon: Webhook, label: 'Gmail Webhook' },
      { id: 'media-migration', icon: HardDrive, label: 'Migração Mídia' },
      { id: 'sicoob-bridge', icon: Landmark, label: 'Sicoob Bridge' },
      { id: 'evolution-monitor', icon: Activity, label: 'Monitor Evolution' },
    ];
  }

  static filterNavItems(items: NavItem[], userRoles: AppRole[]): NavItem[] {
    return items.filter(item => {
      if (item.roles && !item.roles.some(role => userRoles.includes(role))) return false;
      return true;
    });
  }
}
