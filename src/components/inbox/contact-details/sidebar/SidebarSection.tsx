import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { sidebarSectionVariants, type SidebarSectionValue } from './sidebarSections';

const TONE_CLASSES: Record<SidebarSectionTone, string> = {
  blue: 'bg-kpi-blue text-kpi-blue-fg',
  purple: 'bg-kpi-purple text-kpi-purple-fg',
  green: 'bg-kpi-green text-kpi-green-fg',
};

export type SidebarSectionTone = 'blue' | 'purple' | 'green';

interface SidebarSectionProps {
  index: number;
  value: SidebarSectionValue;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: SidebarSectionTone;
  children: ReactNode;
}

/**
 * Card colapsável das 3 seções do sidebar: tile colorido 28px, título 14px
 * semibold, subtítulo 12px muted e chevron Radix (mesmo raio/borda do
 * SectionCard antigo). `aria-controls`/`aria-expanded` vêm do Radix.
 */
export function SidebarSection({ index, value, icon, title, subtitle, tone, children }: SidebarSectionProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      custom={index}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      variants={sidebarSectionVariants}
    >
      <AccordionItem
        value={value}
        data-testid={`sidebar-section-${value}`}
        className="mx-4 mb-3 rounded-xl border border-border bg-muted/20 overflow-hidden"
      >
        <AccordionTrigger className="px-3 py-3 hover:no-underline hover:bg-transparent [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-muted-foreground">
          <div className="flex items-center gap-2.5 text-left min-w-0">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4', TONE_CLASSES[tone])}>
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground leading-tight">{title}</div>
              <div className="text-3xs text-muted-foreground truncate">{subtitle}</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">
          {children}
        </AccordionContent>
      </AccordionItem>
    </motion.div>
  );
}
