import { CommandPalette } from '@/components/ui/command-palette';
import { useCatalogQuickSearch } from '@/hooks/integrations/useCatalogQuickSearch';
import { useModuleCommandItems } from '@/hooks/integrations/useModuleCommandItems';
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
  const moduleCommands = useModuleCommandItems(onNavigate);
  const talkxCommands = useTalkXCommandItems(onNavigate);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      onNavigate={onNavigate}
      onSearch={searchCatalogProducts}
      navigationCommands={moduleCommands}
      customCommands={talkxCommands}
      placeholder="Buscar ou digitar comando... (⌘K)"
    />
  );
}
