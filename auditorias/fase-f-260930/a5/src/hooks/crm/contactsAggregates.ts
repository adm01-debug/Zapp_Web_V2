import type { QueryClient } from '@tanstack/react-query';

/**
 * Queries agregadas da tela de Contatos que NÃO se atualizam sozinhas quando um
 * contato muda: os KPIs (`useContactsKpi`) e os contadores por tipo que alimentam
 * Total/Fornecedores e as abas (`useContactsSearch`).
 *
 * Toda escrita em `contacts` (criar, editar, excluir, mesclar, ações em massa,
 * mover no Kanban) precisa invalidá-las. Antes isso dependia do botão
 * "Sincronizar", removido no #1262 — sem ele os contadores ficavam velhos até
 * recarregar a página.
 */
export const CONTACTS_AGGREGATE_QUERY_KEYS = [
  ['contacts-kpi'],
  ['contacts-type-counts'],
] as const;

export function invalidateContactsAggregates(queryClient: Pick<QueryClient, 'invalidateQueries'>) {
  for (const queryKey of CONTACTS_AGGREGATE_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

/**
 * Aplicado aos agregados E à lista (`contacts-search`), que precisam concordar.
 * O default global do projeto é `refetchOnMount: false` (src/lib/queryClient.ts).
 *
 * Contatos também mudam FORA da tela (inbox, "nova conversa", edição pelo chat,
 * filas e contatos criados no servidor por mensagem recebida). Invalidar em cada
 * ponto de escrita nunca cobriria tudo; por isso essas queries revalidam sempre
 * que a tela monta — em segundo plano, sobre o cache, sem flash de loading.
 */
export const CONTACTS_AGGREGATE_QUERY_OPTIONS = { refetchOnMount: 'always' } as const;
