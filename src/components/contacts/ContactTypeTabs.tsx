import React from 'react';
import { Users, MoreHorizontal } from 'lucide-react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_ICONS } from './ContactsTable';

interface ContactTypeTabsProps {
  activeTab: string;
  setActiveTab: (value: string) => void;
  contactCountByType: Record<string, number>;
}

/**
 * Mostra Todos + 6 tipos inline (cliente→parceiro).
 * Os 3 restantes (sicoob_gifts, transportadora, outros) ficam num dropdown "…"
 * para caberem sem scroll na área de conteúdo de 1366px (1672 - sidebar 234 - gutters 72).
 */
const VISIBLE_COUNT = 6;

const resizeIcon = (icon: React.ReactNode) =>
  icon ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-[18px] h-[18px]' }) : null;

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      data-testid="tab-count"
      className={cn(
        'h-6 min-w-[24px] px-2 rounded-full text-[12.5px] font-semibold tabular-nums flex items-center justify-center shrink-0',
        active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
      )}
    >
      {count.toLocaleString('pt-BR')}
    </span>
  );
}

function Pill({ reduceMotion }: { reduceMotion: boolean }) {
  const className = 'absolute inset-0 rounded-[10px] bg-accent border border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/.2)] -z-10';
  if (reduceMotion) return <span className={className} />;
  return (
    <motion.span
      layoutId="contacts-type-pill"
      className={className}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    />
  );
}

export function ContactTypeTabs({ activeTab, setActiveTab, contactCountByType }: ContactTypeTabsProps) {
  const reduceMotion = useReducedMotion() ?? false;

  const visibleTypes = CONTACT_TYPES.slice(0, VISIBLE_COUNT);
  const overflowTypes = CONTACT_TYPES.slice(VISIBLE_COUNT);
  const overflowActiveType = overflowTypes.find(t => activeTab === t.value);
  const overflowActive = !!overflowActiveType;
  const overflowCount = overflowActiveType ? (contactCountByType[overflowActiveType.value] || 0) : 0;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <LayoutGroup id="contacts-tabs">
        <div className="h-[52px] w-full rounded-[14px] border border-border/70 bg-card p-1.5 flex items-center gap-1">
          <TabsList className="flex h-10 items-center gap-1 bg-transparent border-none p-0 flex-1 justify-start overflow-x-auto flex-nowrap scrollbar-thin snap-x min-w-0">
            <TabsTrigger
              value="all"
              className="relative isolate h-10 px-4 rounded-[10px] text-[15px] font-medium text-muted-foreground gap-2 data-[state=active]:text-foreground data-[state=active]:font-semibold shrink-0 snap-start"
            >
              {activeTab === 'all' && <Pill reduceMotion={reduceMotion} />}
              <Users className="w-[18px] h-[18px]" />
              Todos
              <CountBadge count={contactCountByType['all'] || 0} active={activeTab === 'all'} />
            </TabsTrigger>

            {visibleTypes.map((type) => {
              const count = contactCountByType[type.value] || 0;
              const active = activeTab === type.value;
              return (
                <TabsTrigger
                  key={type.value}
                  value={type.value}
                  className="relative isolate h-10 px-4 rounded-[10px] text-[15px] font-medium text-muted-foreground gap-2 data-[state=active]:text-foreground data-[state=active]:font-semibold shrink-0 snap-start"
                >
                  {active && <Pill reduceMotion={reduceMotion} />}
                  {resizeIcon(CONTACT_TYPE_ICONS[type.value])}
                  {type.label}
                  {count > 0 && <CountBadge count={count} active={active} />}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {overflowTypes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    /* focus-visible restored: ring equivalente ao dos TabsTrigger */
                    'relative isolate h-10 px-3 rounded-[10px] text-[15px] font-medium flex items-center gap-1.5 shrink-0 transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    overflowActive
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  {overflowActive && <Pill reduceMotion={reduceMotion} />}
                  {overflowActiveType ? (
                    <>
                      {resizeIcon(CONTACT_TYPE_ICONS[overflowActiveType.value])}
                      <span>{overflowActiveType.label}</span>
                      {overflowCount > 0 && <CountBadge count={overflowCount} active={true} />}
                    </>
                  ) : (
                    <>
                      <MoreHorizontal className="w-[18px] h-[18px]" />
                      <span className="text-[13px]">mais</span>
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {overflowTypes.map((type) => {
                  const count = contactCountByType[type.value] || 0;
                  const active = activeTab === type.value;
                  return (
                    <DropdownMenuItem
                      key={type.value}
                      onSelect={() => setActiveTab(type.value)}
                      className={cn(
                        'flex items-center gap-2',
                        active && 'bg-accent text-accent-foreground font-semibold'
                      )}
                    >
                      {resizeIcon(CONTACT_TYPE_ICONS[type.value])}
                      <span className="flex-1">{type.label}</span>
                      {count > 0 && (
                        <span className="text-[12px] tabular-nums text-muted-foreground">
                          {count.toLocaleString('pt-BR')}
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </LayoutGroup>
    </Tabs>
  );
}
