import { LayoutList, Kanban, CalendarDays } from 'lucide-react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';

export type TaskMode = 'list' | 'board' | 'agenda';

const MODES: Array<{ mode: TaskMode; label: string; Icon: React.ComponentType<{className?: string}> }> = [
  { mode: 'list',   label: 'Lista',   Icon: LayoutList  },
  { mode: 'board',  label: 'Quadro',  Icon: Kanban      },
  { mode: 'agenda', label: 'Agenda',  Icon: CalendarDays },
];

interface Props { mode: TaskMode; onChange: (m: TaskMode) => void; }

export function ModeSwitcher({ mode, onChange }: Props) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id="tasks-mode">
      <div
        data-testid="tasks-mode"
        data-mode={mode}
        className="flex h-11 items-center rounded-xl border border-border bg-card p-1 gap-1"
      >
        {MODES.map(({ mode: m, label, Icon }) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={[
                'relative flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-sm font-medium transition-colors',
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              ].join(' ')}
              aria-pressed={active}
            >
              {active && (
                reduce
                  ? <span className="absolute inset-0 rounded-[10px] bg-primary -z-10" />
                  : <motion.span
                      layoutId="tasks-mode-pill"
                      className="absolute inset-0 rounded-[10px] bg-primary -z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
              )}
              <Icon className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
