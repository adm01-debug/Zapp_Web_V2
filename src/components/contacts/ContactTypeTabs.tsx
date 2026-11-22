import { Users } from 'lucide-react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';

interface ContactTypeTabsProps {
  activeTab: string;
  setActiveTab: (value: string) => void;
  contactCountByType: Record<string, number>;
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      data-testid="tab-count"
      className={cn(
        'min-w-[19px] min-h-[19px] px-[5px] rounded-[5px] text-[11px] font-medium tabular-nums grid place-items-center shrink-0',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}
    >
      {count.toLocaleString('pt-BR')}
    </span>
  );
}

function Pill({ reduceMotion }: { reduceMotion: boolean }) {
  const className = 'absolute inset-0 rounded-[7px] bg-[linear-gradient(135deg,hsl(var(--primary)/0.22),hsl(var(--primary)/0.16))] border border-[hsl(var(--primary)/0.65)] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15),0_0_13px_hsl(var(--primary)/0.10)] -z-10';
  if (reduceMotion) return <span className={className} />;
  return (
    <motion.span
      layoutId="contacts-type-pill"
      className={className}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    />
  );
}

/**
 * Abas de tipo no formato do design (`.zc-filter-row` + `.zc-filter`):
 * trilho com 5px de padding e raio 10px; cada pill tem ícone 15px, rótulo 11px e
 * contador em `small` (19px, raio 5px). A pill ativa usa o gradiente azul do
 * design e fica branca; o trilho rola na horizontal sem quebrar linha.
 * Teclado/leitor de tela: `role="tab"` + `aria-selected` (Radix) movem o foco com
 * as setas e `focus-visible` desenha o anel de foco.
 */
const TRIGGER_CLASS = 'relative isolate h-8 px-2.5 rounded-[7px] text-[11px] font-medium text-muted-foreground gap-[7px] data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none shrink-0 snap-start whitespace-nowrap transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

export function ContactTypeTabs({ activeTab, setActiveTab, contactCountByType }: ContactTypeTabsProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <LayoutGroup id="contacts-tabs">
        <div className="w-full rounded-[10px] border border-border/70 bg-card p-[5px] flex items-center gap-2 mb-3 max-[559px]:gap-[3px] max-[559px]:p-1 max-[559px]:mb-3">
          <TabsList className="flex h-8 items-center gap-1 bg-transparent border-none p-0 flex-1 justify-start overflow-x-auto flex-nowrap scrollbar-thin snap-x min-w-0 max-[559px]:gap-[3px]">
            <TabsTrigger value="all" className={TRIGGER_CLASS}>
              {activeTab === 'all' && <Pill reduceMotion={reduceMotion} />}
              <Users className="w-[15px] h-[15px] max-[659px]:w-3.5 max-[659px]:h-3.5" />
              Todos
              <CountBadge count={contactCountByType['all'] || 0} active={activeTab === 'all'} />
            </TabsTrigger>

            {CONTACT_TYPES.map((type) => {
              const count = contactCountByType[type.value] || 0;
              const active = activeTab === type.value;
              const TypeIcon = CONTACT_TYPE_CONFIG[type.value].Icon;
              return (
                <TabsTrigger key={type.value} value={type.value} className={TRIGGER_CLASS}>
                  {active && <Pill reduceMotion={reduceMotion} />}
                  <TypeIcon className="w-[15px] h-[15px] max-[659px]:w-3.5 max-[659px]:h-3.5" />
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
