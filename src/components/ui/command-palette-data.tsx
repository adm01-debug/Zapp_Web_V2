import React from 'react';
import {
  Inbox, LayoutDashboard, Users, Phone, Zap, BarChart3, Shield, Settings,
  Keyboard,
} from 'lucide-react';

export type CommandCategory = 'navigation' | 'action' | 'search' | 'recent' | 'talkx';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  category: CommandCategory;
  keywords?: string[];
  shortcut?: string[];
  action?: () => void;
  href?: string;
  badge?: string;
  disabled?: boolean;
}

export interface CommandGroup {
  title: string;
  items: CommandItem[];
}

export const defaultNavigationCommands: CommandItem[] = [
  { id: 'nav-inbox', title: 'Inbox', description: 'Ver caixa de entrada', icon: <Inbox className="h-4 w-4" />, category: 'navigation', keywords: ['caixa', 'entrada', 'mensagens', 'chat'], shortcut: ['g', 'i'] },
  { id: 'nav-dashboard', title: 'Dashboard', description: 'Ver métricas e estatísticas', icon: <LayoutDashboard className="h-4 w-4" />, category: 'navigation', keywords: ['métricas', 'estatísticas', 'gráficos', 'painel'], shortcut: ['g', 'd'] },
  { id: 'nav-contacts', title: 'Contatos', description: 'Gerenciar contatos', icon: <Users className="h-4 w-4" />, category: 'navigation', keywords: ['clientes', 'pessoas', 'leads'], shortcut: ['g', 'c'] },
  { id: 'nav-agents', title: 'Atendentes', description: 'Ver equipe de atendimento', icon: <Phone className="h-4 w-4" />, category: 'navigation', keywords: ['equipe', 'time', 'operadores'], shortcut: ['g', 'a'] },
  { id: 'nav-queues', title: 'Filas', description: 'Gerenciar filas de atendimento', icon: <Zap className="h-4 w-4" />, category: 'navigation', keywords: ['queue', 'fila', 'distribuição'], shortcut: ['g', 'q'] },
{ id: 'nav-reports', title: 'Relatórios', description: 'Ver relatórios avançados', icon: <BarChart3 className="h-4 w-4" />, category: 'navigation', keywords: ['analytics', 'dados', 'exportar'], shortcut: ['g', 'r'] },
  { id: 'nav-security', title: 'Segurança', description: 'Configurações de segurança', icon: <Shield className="h-4 w-4" />, category: 'navigation', keywords: ['senha', 'mfa', '2fa', 'proteção'] },
  { id: 'nav-settings', title: 'Configurações', description: 'Ajustar preferências', icon: <Settings className="h-4 w-4" />, category: 'navigation', keywords: ['preferências', 'ajustes', 'config'], shortcut: ['g', 's'] },
];

// R2-INF-033 (#378): a paleta anunciava "Nova conversa" e "Respostas rápidas" no grupo
// Ações sem executor nenhum — `executeCommand` (command-palette.tsx) só trata callback,
// href ou id `nav-`, então escolher qualquer uma delas apenas fechava o diálogo, como se
// o comando tivesse rodado. Nenhum dos dois fluxos tem gatilho global no app: o modal de
// nova conversa vive no Inbox (RealtimeInboxView/useInboxUIState) e as respostas rápidas
// vivem no painel de chat — quem abre cada um é a própria tela, não um evento. Por isso as
// duas entradas saíram daqui em vez de continuar prometendo um efeito que não existe; se
// um dia houver gatilho global, elas voltam já apontando para ele.
export const defaultActionCommands: CommandItem[] = [
  {
    id: 'action-keyboard', title: 'Atalhos de teclado', description: 'Ver todos os atalhos',
    icon: <Keyboard className="h-4 w-4" />, category: 'action', keywords: ['shortcuts', 'teclas'],
    shortcut: ['?'],
    // Dispara o mesmo evento que o GlobalKeyboardProvider escuta (`show-shortcuts-help`,
    // GlobalKeyboardProvider.tsx:83-84): abre o painel de ajuda real em vez de só fechar a paleta.
    action: () => document.dispatchEvent(new CustomEvent('show-shortcuts-help')),
  },
];

// Fuzzy search helpers
export function fuzzyMatch(text: string, query: string): boolean {
  const lt = text.toLowerCase();
  const lq = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lt.length && qi < lq.length; i++) {
    if (lt[i] === lq[qi]) qi++;
  }
  return qi === lq.length;
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lt = text.toLowerCase();
  const lq = query.toLowerCase();
  const result: React.ReactNode[] = [];
  let last = 0, qi = 0;
  for (let i = 0; i < text.length && qi < lq.length; i++) {
    if (lt[i] === lq[qi]) {
      if (i > last) result.push(<span key={`t-${last}`}>{text.slice(last, i)}</span>);
      result.push(<span key={`m-${i}`} className="text-primary font-semibold">{text[i]}</span>);
      last = i + 1; qi++;
    }
  }
  if (last < text.length) result.push(<span key={`t-${last}`}>{text.slice(last)}</span>);
  return result;
}
