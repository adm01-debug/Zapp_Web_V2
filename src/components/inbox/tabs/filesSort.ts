import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort, FilesTypeFilter } from '@/hooks/chat/useFilesViewState';
import { filterByPeriod, type PeriodRange } from '@/lib/filesPeriod';

/**
 * Filtro e ordenacao da aba Arquivos (etapas 23 e 43). Vive fora do componente para poder ser
 * testado por unidade e para a Tabela reusar exatamente a mesma ordem dos outros modos.
 *
 * Regras da etapa 43:
 * - "Maiores" poe tamanho desconhecido no FIM (nunca tratado como 0) e desempata por data e id.
 * - Todos os modos sao deterministas: data desc + id (mesma ordem do keyset do banco).
 */

function timeOf(item: ContactMediaItem): number {
  const parsed = new Date(item.created_at ?? '').getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Mais recente primeiro; empate pelo id (desc) para a ordem ser estavel entre paginas. */
export function compareByDateDesc(a: ContactMediaItem, b: ContactMediaItem): number {
  const diff = timeOf(b) - timeOf(a);
  if (diff !== 0) return diff;
  return b.id.localeCompare(a.id);
}

/** Maior primeiro; tamanho desconhecido vai para o fim; empate por data e id. */
export function compareBySizeDesc(a: ContactMediaItem, b: ContactMediaItem): number {
  const aKnown = a.size != null;
  const bKnown = b.size != null;
  if (!aKnown || !bKnown) {
    if (!aKnown && !bKnown) return compareByDateDesc(a, b);
    return aKnown ? -1 : 1;
  }
  if (b.size !== a.size) return (b.size as number) - (a.size as number);
  return compareByDateDesc(a, b);
}

export function sortMediaItems(items: ContactMediaItem[], sort: FilesSort): ContactMediaItem[] {
  const sorted = [...items];
  if (sort === 'recent') sorted.sort(compareByDateDesc);
  else if (sort === 'old') sorted.sort((a, b) => -compareByDateDesc(a, b));
  else if (sort === 'biggest') sorted.sort(compareBySizeDesc);
  else sorted.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR') || compareByDateDesc(a, b));
  return sorted;
}

/**
 * Filtro do recorte (tipo + busca) e, quando o cartão do filtro por data passa o intervalo,
 * também o recorte por DATA. O 4º parâmetro é OPCIONAL: sem ele o resultado é byte a byte o de
 * antes (as chamadas existentes, e os testes delas, seguem valendo).
 */
export function filterMediaItems(
  items: ContactMediaItem[],
  typeFilter: FilesTypeFilter,
  search: string,
  period?: PeriodRange | null,
): ContactMediaItem[] {
  let list = typeFilter === 'all' ? items : items.filter((item) => item.type === typeFilter);
  if (period) list = filterByPeriod(list, period);
  const query = search.trim().toLowerCase();
  if (query) {
    list = list.filter(
      (item) => item.filename.toLowerCase().includes(query) || (item.caption ?? '').toLowerCase().includes(query),
    );
  }
  return list;
}
