import React from 'react';
import { Users } from 'lucide-react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_ICONS } from './ContactsTable';

interface ContactTypeTabsProps {
  activeTab: string;
  setActiveTab: (value: string) => void;
  contactCountByType: Record<string, number>;
}

const resizeIcon = (icon: React.ReactNode) =>
  icon ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-[18px] h-[18px]' }) : null;

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      data-testid="tab-count"
      className={cn(
        'h-6 min-w-[24px] px-2 rounded-full text-xs font-semibold tabular-nums flex items-center justify-center shrink-0',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
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

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <LayoutGroup id="contacts-tabs">
        <div className="h-[52px] w-full rounded-[14px] border border-border/70 bg-card p-1.5 flex items-center gap-1">
          <TabsList className="flex h-10 items-center gap-1 bg-transparent border-none p-0 flex-1 justify-start overflow-x-auto flex-nowrap scrollbar-thin snap-x min-w-0">
            <TabsTrigger
              value="all"
              className="relative isolate h-10 px-4 rounded-[10px] text-sm font-medium text-muted-foreground gap-2 data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none shrink-0 snap-start"
            >
              {activeTab === 'all' && <Pill reduceMotion={reduceMotion} />}
              <Users className="w-[18px] h-[18px]" />
              Todos
              <CountBadge count={contactCountByType['all'] || 0} active={activeTab === 'all'} />
            </TabsTrigger>

            {CONTACT_TYPES.map((type) => {
              const count = contactCountByType[type.value] || 0;
              const active = activeTab === type.value;
              return (
                <TabsTrigger
                  key={type.value}
                  value={type.value}
                  className="relative isolate h-10 px-4 rounded-[10px] text-sm font-medium text-muted-foreground gap-2 data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none shrink-0 snap-start"
                >
                  {active && <Pill reduceMotion={reduceMotion} />}
                  {resizeIcon(CONTACT_TYPE_ICONS[type.value])}
                  {type.label}
                  {count > 0 && <CountBadge count={count} active={active} />}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </LayoutGroup>
    </Tabs>
  );
}
