import { List, Columns, Calendar } from 'lucide-react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';

export type TaskMode = 'list' | 'board' | 'agenda';

/**
 * Etapa 032: os três modos com o ícone que o plano nomeia (List, Columns,
 * Calendar), ativo preenchido em `primary` e foco visível. As teclas 1/2/3
 * continuam valendo — quem as trata é o registry de atalhos (TasksModule).
 */
const MODES: Array<{ mode: TaskMode; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { mode: 'list',   label: 'Lista',   Icon: List      },
  { mode: 'board',  label: 'Quadro',  Icon: Columns   },
  { mode: 'agenda', label: 'Agenda',  Icon: Calendar  },
];

interface Props { mode: TaskMode; onChange: (m: TaskMode) => void; }

export function ModeSwitcher({ mode, onChange }: Props) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id="tasks-mode">
      <div
        data-testid="tasks-mode"
        data-mode={mode}
        className="flex h-11 items-center rounded-xl border border-border bg-card p-0.5 gap-1"
      >
        {MODES.map(({ mode: m, label, Icon }) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              // Etapa 032: o rótulo some em tela estreita — o nome acessível
              // precisa continuar existindo para o `aria-pressed` ser útil.
              aria-label={label}
              aria-pressed={active}
              className={[
                'relative flex h-10 items-center gap-1.5 px-3 rounded-[10px] text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              ].join(' ')}
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
