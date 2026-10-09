import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
 *
 * ── T76/T84 (Fase 8) — por que NÃO é o primitivo `Tabs` ────────────────────
 * O filtro não tem painel próprio: a lista filtrada é o corpo do `CallHistoryCard`,
 * renderizado pelo pai. Com `Tabs`/`TabsTrigger` e nenhum `TabsContent`, o Radix
 * emite `aria-controls` no trigger ATIVO apontando para um painel que não existe —
 * valor ARIA que não referencia nenhum elemento. O axe acusa
 * `aria-valid-attr-value` (**serious**) e o aceite da Fase 8 ("axe serious/critical
 * = 0", T76) não fecha. Medido no `TelefoniaView.a11y.test.tsx`:
 * `Invalid ARIA attribute value: aria-controls="radix-_r_4_-content-all"`.
 *
 * O widget correto para um seletor de filtro sem painel é um grupo de alternância,
 * que é o padrão já usado nesta casa para recortes de período
 * (`SLAHistoryDashboard`) e o mesmo que o T56 desta fase usou no seletor de canal da
 * "Nova ligação": `ToggleGroup type="single"` do Radix rende `role="radiogroup"` com
 * itens `role="radio"` + `aria-checked` — nenhum `aria-controls` prometendo painel —
 * e mantém a navegação por setas e o foque itinerante que o `Tabs` dava.
 * As classes visuais são as mesmas de antes (sublinhado no item ativo); só a marca
 * de estado do primitivo muda (`data-state="on"` / `aria-checked`).
 */
export function CallHistoryTabs({ canal, onCanalChange }: CallHistoryTabsProps) {
  return (
    <ToggleGroup
      type="single"
      value={canal}
      // No `type="single"` o Radix devolve `''` ao clicar no item já ativo; um
      // filtro sem canal nenhum não existe, então o valor vazio é ignorado.
      onValueChange={(valor) => valor && onCanalChange(valor)}
      aria-label="Canal das ligações"
      className="h-10 w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 px-4"
    >
      {ABAS.map((aba) => (
        <ToggleGroupItem
          key={aba.valor}
          value={aba.valor}
          data-testid="tel-channel-tab"
          className="h-10 rounded-none border-b-2 border-b-transparent px-3 text-xs font-medium hover:bg-transparent hover:text-foreground/80 data-[state=on]:border-b-primary data-[state=on]:bg-transparent data-[state=on]:text-foreground data-[state=on]:shadow-none"
        >
          {aba.rotulo}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
