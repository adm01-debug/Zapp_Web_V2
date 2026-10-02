import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import {
  MessageSquare, Sparkles, Compass, ShoppingBag, CheckSquare, FileText, Paperclip, History, Bell,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';
import type { ReactNode } from 'react';

export type ConversationTab = 'chat' | 'ia' | 'crm' | 'orders' | 'tasks' | 'notes' | 'files' | 'history';

interface TabDef {
  id: ConversationTab;
  label: string;
  icon: LucideIcon;
  /** Badge numérico; undefined = sem badge nesta aba. */
  count?: (c: ConversationTabCounts) => number;
}

const TABS: TabDef[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Arquivos', icon: Paperclip, count: (c) => c.filesTotal },
  { id: 'ia', label: 'IA', icon: Sparkles },
  { id: 'crm', label: 'CRM 360°', icon: Compass },
  { id: 'orders', label: 'SalesView', icon: ShoppingBag },
  { id: 'history', label: 'Journey', icon: History },
  { id: 'tasks', label: 'Tarefas', icon: CheckSquare, count: (c) => c.tasksOpen },
  { id: 'notes', label: 'Notas', icon: FileText, count: (c) => c.notesTotal },];

interface ConversationTabsProps {
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  counts: ConversationTabCounts;
  /** Badges resolvidos fora da RPC get_conversation_tab_counts (client-side). */
  extraCounts?: { orders?: number };
  /** Ação fixa no extremo direito da barra, fora da navegação por abas. */
  trailingAction?: ReactNode;
}

export function ConversationTabs({ activeTab, onTabChange, counts, extraCounts, trailingAction }: ConversationTabsProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div
      data-testid="conversation-tabs"
      className="flex h-[53px] shrink-0 items-center border-b border-border bg-inbox-panel"
    >
      <div
        role="tablist"
        aria-label="Seções da conversa"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3 scrollbar-thin"
      >
        <LayoutGroup id="conversation-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const count = tab.id === 'orders' ? (extraCounts?.orders ?? 0) : (tab.count?.(counts) ?? 0);

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                data-testid={`conversation-tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'relative isolate h-9 px-2 2xl:px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 2xl:gap-2 shrink-0',
                  'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  active
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {active && (
                  reduceMotion ? (
                    <span className="absolute inset-0 rounded-lg bg-accent border border-primary/40 -z-10" />
                  ) : (
                    <motion.span
                      layoutId="conversation-tab-pill"
                      className="absolute inset-0 rounded-lg bg-accent border border-primary/40 -z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap hidden 2xl:inline">{tab.label}</span>
                {count > 0 && (
                  <span
                    data-testid={`conversation-tab-count-${tab.id}`}
                    className={cn(
                      'h-5 min-w-[20px] px-1.5 rounded-full text-2xs font-semibold tabular-nums',
                      'flex items-center justify-center shrink-0',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </LayoutGroup>
      </div>
      {trailingAction && <div className="shrink-0 px-2 sm:px-3">{trailingAction}</div>}
    </div>
  );
}
