import { CommandPalette } from '@/components/ui/command-palette';
import { useCatalogQuickSearch } from '@/hooks/integrations/useCatalogQuickSearch';
import { useTalkXCommandItems } from '@/hooks/integrations/useTalkXCommandItems';

interface CommandPaletteHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string) => void;
}

/**
 * Host do ⌘K, carregado em lazy (React.lazy em GlobalKeyboardProvider) para não
 * pesar o chunk de entrada: o palette + os hooks de dados (catálogo e Talk X)
 * só são baixados na primeira vez que o usuário abre o ⌘K.
 */
export function CommandPaletteHost({ open, onOpenChange, onNavigate }: CommandPaletteHostProps) {
  const searchCatalogProducts = useCatalogQuickSearch();
  const talkxCommands = useTalkXCommandItems(onNavigate);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      onNavigate={onNavigate}
      onSearch={searchCatalogProducts}
      customCommands={talkxCommands}
      placeholder="Buscar ou digitar comando... (⌘K)"
    />
  );
}
