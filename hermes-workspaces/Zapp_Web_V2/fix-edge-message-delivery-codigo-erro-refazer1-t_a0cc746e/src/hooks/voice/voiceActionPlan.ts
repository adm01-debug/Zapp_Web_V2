import type { VoiceAgentAction } from './types';

/**
 * Contrato tipado do comando de voz → estado real da view.
 *
 * O defeito (R2-INB-046 / item 340): o comando de voz anunciado pelo assistente
 * (search/filter/sort/clear) só navegava e mostrava `toast` — a lista conservava
 * os parâmetros anteriores. Aqui cada ação vira um PLANO do que precisa mudar no
 * estado da view. O plano é puro (não toca em DOM nem em React), então a ponte
 * que o aplica (hooks/voice/useVoiceAgent) e o teste falam do mesmo contrato.
 *
 * O estado real que as listas leem é a query string da URL (convenção do app:
 * `?q=`, `?status=`, `?tags=`, `?agent=`, `?from=`, `?to=`, `?type=` — ver
 * `hooks/system/useUrlFilters.ts`, `hooks/tasks/workItemFilters.ts` e
 * `hooks/calls/useTelefoniaFilters.ts`). Por isso o plano devolve params, não
 * setters de componente.
 *
 * Regra de honestidade (aceite do cartão): quando a view não consome o parâmetro
 * pedido (ex.: ordenação, sentimento, atribuição), o plano NÃO anuncia sucesso —
 * devolve `applied: false` com aviso de indisponibilidade.
 */

export type VoiceActionLevel = 'success' | 'info' | 'warning';

/** Params de busca/filtro que as views leem (o que o "Limpar" apaga). */
export const FILTER_PARAM_KEYS = ['q', 'status', 'tags', 'agent', 'from', 'to', 'type'] as const;

/** Status que o filtro do inbox realmente entende (`hooks/inbox/useInboxFilters.ts`). */
const INBOX_STATUS = new Set(['unread', 'read', 'pending', 'resolved']);

export interface VoiceActionPlan {
  /** View a ativar; ausente quando a ação não navega. */
  view?: string;
  /** Params a gravar na URL; `null` remove o param. */
  params: Record<string, string | null>;
  /** `true` só quando algo do estado real mudou (params e/ou navegação). */
  applied: boolean;
  /** Texto exibido ao operador; `''` quando não há nada a anunciar. */
  message: string;
  level: VoiceActionLevel;
}

function unavailable(message: string): VoiceActionPlan {
  return { params: {}, applied: false, message, level: 'warning' };
}

export function planVoiceAction(
  action: VoiceAgentAction,
  current: URLSearchParams,
): VoiceActionPlan {
  switch (action.action) {
    case 'navigate': {
      const route = action.data?.route;
      if (!route) {
        return unavailable('O comando de navegação chegou sem a seção.');
      }
      return { view: route, params: {}, applied: true, message: `Navegando para ${route}`, level: 'success' };
    }

    case 'search': {
      const query = action.data?.query?.trim();
      if (!query) {
        return unavailable('O comando de busca chegou sem o termo.');
      }
      // `q` é o parâmetro de busca que a inbox (conversas) consome — inclusive
      // casando pelo nome do contato. A tela de contatos não lê `q`, então
      // mandar a consulta para lá seria anunciar busca sem aplicar nada.
      return {
        view: 'inbox',
        params: { q: query },
        applied: true,
        level: 'success',
        message: `Buscando: "${query}"`,
      };
    }

    case 'filter': {
      const filters = action.data?.filters;
      if (!filters) {
        return unavailable('O comando de filtro chegou sem os critérios.');
      }

      const params: Record<string, string | null> = {};
      const applied: string[] = [];
      const ignored: string[] = [];

      if (filters.status) {
        if (INBOX_STATUS.has(filters.status)) {
          params.status = filters.status;
          applied.push(`status: ${filters.status}`);
        } else {
          ignored.push(`status: ${filters.status}`);
        }
      }
      if (filters.unread === true) {
        params.status = 'unread';
        applied.push('não lidas');
      } else if (filters.unread === false) {
        ignored.push('unread: false');
      }
      if (filters.contactType?.trim()) {
        params.type = filters.contactType.trim();
        applied.push(`tipo: ${filters.contactType.trim()}`);
      }
      if (filters.sentiment) ignored.push(`sentimento: ${filters.sentiment}`);
      if (filters.category) ignored.push(`categoria: ${filters.category}`);
      if (filters.assigned !== undefined) ignored.push('atribuição');

      if (applied.length === 0) {
        return unavailable('Este filtro por voz não tem efeito nas listas.');
      }
      if (ignored.length > 0) {
        return {
          view: 'inbox',
          params,
          applied: true,
          level: 'warning',
          message: `Filtro aplicado em parte (${applied.join(', ')}); sem efeito: ${ignored.join(', ')}.`,
        };
      }
      return {
        view: 'inbox',
        params,
        applied: true,
        level: 'success',
        message: `Filtros aplicados: ${applied.join(', ')}`,
      };
    }

    case 'sort':
      // Nenhuma lista lê um parâmetro de ordenação pela URL (a inbox usa ordem
      // própria e Contatos ordena por estado local): anunciar "Ordenação
      // alterada" seria mentir sobre o que a tela mostra.
      return unavailable('Ordenação por comando de voz ainda não está disponível.');

    case 'clear': {
      const params: Record<string, string | null> = {};
      let removed = 0;
      for (const key of FILTER_PARAM_KEYS) {
        if (current.get(key) !== null) {
          params[key] = null;
          removed += 1;
        }
      }
      if (removed === 0) {
        return { params: {}, applied: false, message: 'Nenhum filtro ou busca ativa para limpar.', level: 'info' };
      }
      return { view: 'inbox', params, applied: true, message: 'Filtros limpos', level: 'success' };
    }

    case 'answer':
    default:
      return { params: {}, applied: false, message: '', level: 'info' };
  }
}
