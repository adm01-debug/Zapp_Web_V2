import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContactService } from '@/services/contact.service';

/**
 * Resolve, PELO ID, os contatos selecionados para a mesclagem — nunca pela
 * lista renderizada agora. `faltantes` são os ids selecionados que o banco já
 * devolveu completos (via `ContactService.getByIds`) porque saíram de
 * `currentContacts`; têm prioridade sobre `currentContacts` só para id que não
 * está nela.
 */
export function resolveMergeContacts<T extends { id: string }>(
  selectedIds: string[],
  currentContacts: T[],
  faltantes: T[],
): T[] {
  const porId = new Map(currentContacts.map((c) => [c.id, c] as const));
  for (const c of faltantes) if (!porId.has(c.id)) porId.set(c.id, c);
  return selectedIds.map((id) => porId.get(id)).filter((c): c is T => c !== undefined);
}

/**
 * Contatos selecionados para a mesclagem, resolvidos pelo ID.
 *
 * Bug que isto corrige: a seleção sobrevive à troca de página/filtro (mesma
 * garantia de `canDeleteSelectedContacts`, ver `contactPermissions.ts`), mas o
 * botão "Mesclar" montava a lista do diálogo filtrando direto
 * `filteredContacts` pelos `selectedIds` — com os 2 contatos vindos de
 * páginas/filtros diferentes, sobrava menos de 2 e o `ContactMergeDialog`
 * (que exige `contacts.length >= 2`) não renderizava nada, sem erro nem
 * feedback para o operador.
 *
 * A correção busca no banco, por id (`ContactService.getByIds`, uma única
 * consulta), só quem a página/filtro atual não tem — nunca refaz a regra de
 * negócio no cliente, só completa o dado que falta.
 */
export function useResolvedMergeContacts<T extends { id: string }>(
  isOpen: boolean,
  selectedIds: string[],
  currentContacts: T[],
): T[] {
  const idsFaltantes = useMemo(
    () => selectedIds.filter((id) => !currentContacts.some((c) => c.id === id)),
    [selectedIds, currentContacts],
  );

  const { data: faltantes } = useQuery({
    queryKey: ['contacts-merge-faltantes', idsFaltantes],
    queryFn: async () => {
      const { data, error } = await ContactService.getByIds(idsFaltantes);
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
    enabled: isOpen && idsFaltantes.length > 0,
    staleTime: 30_000,
  });

  return useMemo(
    () => resolveMergeContacts(selectedIds, currentContacts, faltantes ?? []),
    [selectedIds, currentContacts, faltantes],
  );
}
