import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface DashboardTabDef {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardTabsProps {
  tabs: DashboardTabDef[];
  activeTab: string;
}

export function DashboardTabs({ tabs, activeTab }: DashboardTabsProps) {
  const reducedMotion = useReducedMotion();

  return (
    <LayoutGroup id="dashboard-tabs">
      <TabsList
        data-testid="dash-tabs"
        className="h-8 w-full justify-start bg-transparent p-0 gap-1.5 flex-nowrap overflow-x-visible max-[1440px]:overflow-x-auto max-[1440px]:snap-x"
      >
        {tabs.map(({ value, label, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <TabsTrigger
              key={value}
              value={value}
              className="relative isolate h-8 px-3 shrink-0 snap-start rounded-lg text-[13px] font-medium gap-1.5 text-foreground-secondary bg-card/40 border border-border/50 hover:bg-muted/60 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:border-transparent data-[state=active]:shadow-none"
            >
              {isActive && (
                <motion.span
                  layoutId={reducedMotion ? undefined : 'dashboard-tab-pill'}
                  className="absolute inset-0 rounded-lg bg-primary -z-10"
                  transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="w-3.5 h-3.5" />
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </LayoutGroup>
  );
}
