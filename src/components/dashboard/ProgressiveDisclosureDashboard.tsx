import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Gamepad2, TrendingUp, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import { SectionHeader, type WidgetSection } from './DashboardSectionHeader';
import { DashboardToolbar } from './DashboardToolbar';

// Widget Grid
function WidgetGrid({ widgets, renderWidget }: { widgets: DashboardWidget[]; renderWidget: (w: DashboardWidget) => React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }} className="pt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((widget, index) => (
          <motion.div key={widget.id} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: index * 0.05, duration: 0.3 }}
            className={cn(widget.size === 'full' && 'md:col-span-2 lg:col-span-3', widget.size === 'large' && 'md:col-span-2')}>
            {renderWidget(widget)}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// Enhanced Progressive Disclosure
interface EnhancedProps {
  sections: WidgetSection[];
  renderWidget: (widget: DashboardWidget) => React.ReactNode;
  onRefresh?: () => void;
  onExport?: () => void;
  isLoading?: boolean;
}

export function EnhancedProgressiveDisclosure({ sections, renderWidget, onRefresh, onExport, isLoading }: EnhancedProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach(s => { if (s.defaultOpen !== false) initial.add(s.id); });
    return initial;
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalWidgets = useMemo(() => sections.reduce((a, s) => a + s.widgets.length, 0), [sections]);
  const visibleWidgets = useMemo(() => sections.filter(s => openSections.has(s.id)).reduce((a, s) => a + s.widgets.length, 0), [sections, openSections]);

  return (
    <div className="space-y-6">
      <DashboardToolbar onRefresh={onRefresh} onExport={onExport} isLoading={isLoading} lastUpdated={new Date()} />

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{visibleWidgets}</span> de {totalWidgets} widgets
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpenSections(new Set(sections.map(s => s.id)))} className="gap-1.5 text-xs"><Maximize2 className="w-3.5 h-3.5" />Expandir</Button>
          <Button variant="ghost" size="sm" onClick={() => setOpenSections(new Set())} className="gap-1.5 text-xs"><Minimize2 className="w-3.5 h-3.5" />Recolher</Button>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const isOpen = openSections.has(section.id);
          return (
            <Collapsible key={section.id} open={isOpen} onOpenChange={() => toggleSection(section.id)}>
              <CollapsibleTrigger asChild>
                <div><SectionHeader section={section} isOpen={isOpen} onToggle={() => toggleSection(section.id)} /></div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <AnimatePresence>{isOpen && <WidgetGrid widgets={section.widgets} renderWidget={renderWidget} />}</AnimatePresence>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

// Legacy wrapper
interface LegacyProps {
  level1Widgets: DashboardWidget[];
  level2Widgets: DashboardWidget[];
  level3Widgets: DashboardWidget[];
  renderWidget: (widget: DashboardWidget) => React.ReactNode;
}

export function ProgressiveDisclosureDashboard({ level1Widgets, level2Widgets, level3Widgets, renderWidget }: LegacyProps) {
  const sections: WidgetSection[] = [
    { id: 'kpis', title: 'KPIs Principais', description: 'Métricas críticas de desempenho', icon: TrendingUp, widgets: level1Widgets, defaultOpen: true, variant: 'primary' },
    { id: 'operations', title: 'Detalhes Operacionais', description: 'Filas, atividades recentes e desafios', icon: Eye, widgets: level2Widgets, defaultOpen: true, variant: 'default' },
    { id: 'gamification', title: 'Gamificação & IA', description: 'Conquistas, ranking, mini-games e estatísticas de IA', icon: Gamepad2, widgets: level3Widgets, defaultOpen: false, variant: 'secondary' },
  ];
  return <EnhancedProgressiveDisclosure sections={sections} renderWidget={renderWidget} />;
}
