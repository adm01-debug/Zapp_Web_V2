import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ABAS = [
  { valor: 'all', rotulo: 'Todos' },
  { valor: 'voip', rotulo: 'VoIP' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
] as const;

interface CallHistoryTabsProps {
  canal: string;
  onCanalChange: (valor: string) => void;
}

/**
 * Abas de canal do histórico (T44).
 *
 * Controladas pela URL (mesmo parâmetro `channel` do T36): a aba é um filtro, não
 * estado local, então o link compartilhado abre no mesmo recorte.
 */
export function CallHistoryTabs({ canal, onCanalChange }: CallHistoryTabsProps) {
  return (
    <Tabs value={canal} onValueChange={onCanalChange} className="px-4">
      <TabsList className="h-10 w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
        {ABAS.map((aba) => (
          <TabsTrigger
            key={aba.valor}
            value={aba.valor}
            data-testid="tel-channel-tab"
            className="h-10 rounded-none border-b-2 border-b-transparent px-3 text-xs font-medium data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {aba.rotulo}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
