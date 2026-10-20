import { motion } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';

export interface WidgetSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  widgets: DashboardWidget[];
  defaultOpen?: boolean;
  variant?: 'default' | 'primary' | 'secondary' | 'accent';
}

interface SectionHeaderProps {
  section: WidgetSection;
  isOpen: boolean;
  onToggle: () => void;
}

const variantStyles = {
  default: {
    container: 'from-muted/50 to-muted/30 hover:from-muted/70 hover:to-muted/50 border-border/50 hover:border-muted-foreground/30',
    icon: 'bg-muted text-muted-foreground',
    chevron: 'bg-muted group-hover:bg-muted-foreground/20',
  },
  primary: {
    container: 'from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border-primary/20 hover:border-primary/40',
    icon: 'bg-primary/20 text-primary',
    chevron: 'bg-primary/10 group-hover:bg-primary/20',
  },
  secondary: {
    container: 'from-secondary/10 to-secondary/5 hover:from-secondary/20 hover:to-secondary/10 border-secondary/20 hover:border-secondary/40',
    icon: 'bg-secondary/20 text-secondary',
    chevron: 'bg-secondary/10 group-hover:bg-secondary/20',
  },
  accent: {
    container: 'from-accent/10 to-accent/5 hover:from-accent/20 hover:to-accent/10 border-accent/20 hover:border-accent/40',
    icon: 'bg-accent/20 text-accent',
    chevron: 'bg-accent/10 group-hover:bg-accent/20',
  },
};

export function SectionHeader({ section, isOpen, onToggle }: SectionHeaderProps) {
  const Icon = section.icon;
  const styles = variantStyles[section.variant || 'default'];

  return (
    <motion.div
      className={cn(
        'flex items-center justify-between p-4 rounded-xl',
        'bg-gradient-to-r border transition-all duration-300 group cursor-pointer',
        styles.container
      )}
      whileHover={{ scale: 1.002 }}
      whileTap={{ scale: 0.998 }}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        <motion.div
          className={cn('p-2.5 rounded-xl', styles.icon)}
          animate={{ rotate: isOpen ? 0 : -5 }}
          transition={{ duration: 0.2 }}
        >
          <Icon className="w-5 h-5" />
        </motion.div>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{section.title}</span>
            {section.variant === 'secondary' && (
              <Sparkles className="w-3.5 h-3.5 text-secondary animate-pulse" />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{section.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="secondary" className={cn('text-xs transition-colors', isOpen && 'bg-primary/10 text-primary')}>
          {section.widgets.length} {section.widgets.length === 1 ? 'item' : 'itens'}
        </Badge>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className={cn('p-1.5 rounded-full transition-colors', styles.chevron)}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        </motion.div>
      </div>
    </motion.div>
  );
}
