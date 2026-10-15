import * as React from 'react';
import { MessageSquare, User } from 'lucide-react';

import { CommandPalette } from '@/components/ui/command-palette';
import type { CommandItem } from '@/components/ui/command-palette-data';
import { useCatalogQuickSearch } from '@/hooks/integrations/useCatalogQuickSearch';
import { useTalkXCommandItems } from '@/hooks/integrations/useTalkXCommandItems';
import { usePaletteGlobalSearch } from '@/hooks/ui/usePaletteGlobalSearch';

interface CommandPaletteHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string) => void;
}

/**
 * Host do ⌘K, carregado em lazy (React.lazy em GlobalKeyboardProvider) para não pesar o
 * chunk de entrada. Aqui moram os dados: catálogo, Talk X e — a partir de R2-INF-035 —
 * contatos e conversas (mesmas tabelas da busca global da inbox, via
 * `usePaletteGlobalSearch`), num único campo de busca.
 *
 * O foco de retorno é responsabilidade do GlobalKeyboardProvider, dono do estado da
 * paleta; este host não guarda elemento nenhum.
 */
export function CommandPaletteHost({ open, onOpenChange, onNavigate }: CommandPaletteHostProps) {
  const searchCatalogProducts = useCatalogQuickSearch();
  const talkxCommands = useTalkXCommandItems(onNavigate);
  const searchGlobal = usePaletteGlobalSearch();

  const contatosEConversas = React.useCallback(
    (hits: Awaited<ReturnType<typeof searchGlobal>>): CommandItem[] =>
      hits.map((hit) => ({
        id: `global-${hit.id}`,
        title: hit.titulo,
        description: hit.descricao,
        keywords: [hit.tipo === 'contato' ? 'contato' : 'conversa'],
        icon:
          hit.tipo === 'contato' ? (
            <User className="h-4 w-4" aria-hidden="true" />
          ) : (
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          ),
        category: 'search',
        // R2-INF-033: item exibido precisa de executor observável.
        action: () => onNavigate(hit.tipo === 'contato' ? 'contacts' : 'inbox'),
      })),
    [onNavigate],
  );

  const handleSearch = React.useCallback(
    async (termo: string): Promise<CommandItem[]> => {
      const [produtos, hits] = await Promise.all([
        searchCatalogProducts(termo).catch(() => []),
        searchGlobal(termo).catch(() => []),
      ]);
      return [...(produtos ?? []), ...contatosEConversas(hits)];
    },
    [contatosEConversas, searchCatalogProducts, searchGlobal],
  );

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      onNavigate={onNavigate}
      onSearch={handleSearch}
      customCommands={talkxCommands}
      placeholder="Buscar ou digitar comando... (⌘K)"
    />
  );
}
