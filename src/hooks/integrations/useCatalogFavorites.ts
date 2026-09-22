import { useState, useCallback } from 'react';
import { toast } from '@/hooks/ui/use-toast';

const STORAGE_KEY = 'catalog.favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveFavorites(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch { /* ignora quota errors */ }
}

/**
 * E43: hook de favoritos do catálogo.
 * Persiste em localStorage; optimistic update instantâneo.
 * Rollback automático: o Set original é restaurado se saveFavorites lançar.
 */
export function useCatalogFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  const isFav = useCallback((id: string): boolean => favorites.has(id), [favorites]);

  const toggleFavorite = useCallback((id: string): void => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const added = !next.has(id);
      if (added) {
        next.add(id);
      } else {
        next.delete(id);
      }
      try {
        saveFavorites(next);
        toast({
          title: added ? 'Adicionado aos favoritos' : 'Removido dos favoritos',
          duration: 5000,
        });
      } catch {
        // rollback: retorna o Set original se salvar falhar
        return prev;
      }
      return next;
    });
  }, []);

  return { favorites, isFav, toggleFavorite };
}
