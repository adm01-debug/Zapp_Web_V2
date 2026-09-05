import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient — criado uma vez no modulo para todas as instancias
 * dividirem o mesmo cache (estavel entre re-renders e ciclos de HMR). Exportado
 * daqui, e nao do AppProviders, para hooks sem provider (ex.: useMFA) poderem
 * invalidar queries sem depender do contexto React.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      // Evita refetch automático ao remontar componentes — o staleTime de 5min
      // já garante dados frescos e elimina rajadas de requisição em navegação
      // entre rotas SPA.
      refetchOnMount: false,
      // 'online' faz queries pausarem sem rede em vez de falharem com retry,
      // economizando bateria/CPU em conexões instáveis.
      networkMode: 'online',
    },
    mutations: {
      // Mutations nao sao idempotentes (insert de campanha/nota/agendamento):
      // retry apos resposta perdida duplicaria a escrita. Quem precisar, opta por chamada.
      retry: false,
      networkMode: 'online',
    },
  },
});
