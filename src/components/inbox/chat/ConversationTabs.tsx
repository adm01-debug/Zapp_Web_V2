import { useRef, type KeyboardEvent } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import {
  MessageSquare, Sparkles, Compass, ShoppingBag, CheckSquare, FileText, Paperclip, History,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

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
  { id: 'ia', label: 'IA', icon: Sparkles },
  { id: 'crm', label: 'CRM 360°', icon: Compass },
  { id: 'orders', label: 'Pedidos', icon: ShoppingBag },
  { id: 'tasks', label: 'Tarefas', icon: CheckSquare, count: (c) => c.tasksOpen },
  { id: 'notes', label: 'Notas', icon: FileText, count: (c) => c.notesTotal },
  { id: 'files', label: 'Arquivos', icon: Paperclip, count: (c) => c.filesTotal },
  { id: 'history', label: 'Histórico', icon: History },
];

const conversationTabId = (tab: ConversationTab) => `conversation-tab-${tab}`;
const conversationTabPanelId = (tab: ConversationTab) => `conversation-tabpanel-${tab}`;

interface ConversationTabsProps {
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  counts: ConversationTabCounts;
  /** Badges resolvidos fora da RPC get_conversation_tab_counts (client-side). */
  extraCounts?: { orders?: number };
}

export function ConversationTabs({ activeTab, onTabChange, counts, extraCounts }: ConversationTabsProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const tabRefs = useRef(new Map<ConversationTab, HTMLButtonElement>());

  const activateAndFocus = (tab: ConversationTab) => {
    onTabChange(tab);
    tabRefs.current.get(tab)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ConversationTab) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === current);
    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    activateAndFocus(TABS[nextIndex].id);
  };

  return (
    <div
      role="tablist"
      aria-label="Seções da conversa"
      aria-orientation="horizontal"
      data-testid="conversation-tabs"
      className="flex items-center gap-1 px-3 h-12 border-b border-border bg-card overflow-x-auto scrollbar-thin shrink-0"
    >
      <LayoutGroup id="conversation-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const count = tab.id === 'orders' ? (extraCounts?.orders ?? 0) : (tab.count?.(counts) ?? 0);

          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              id={conversationTabId(tab.id)}
              role="tab"
              aria-selected={active}
              aria-controls={conversationTabPanelId(tab.id)}
              tabIndex={active ? 0 : -1}
              data-testid={`conversation-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              className={cn(
                'relative isolate h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0',
                'transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                active
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              {active && (
                reduceMotion ? (
                  <span className="absolute inset-0 rounded-lg bg-primary/15 border border-primary/40 -z-10" aria-hidden="true" />
                ) : (
                  <motion.span
                    layoutId="conversation-tab-pill"
                    className="absolute inset-0 rounded-lg bg-primary/15 border border-primary/40 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    aria-hidden="true"
                  />
                )
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
              {count > 0 && (
                <span
                  data-testid={`conversation-tab-count-${tab.id}`}
                  className={cn(
                    'h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums',
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
  );
}
