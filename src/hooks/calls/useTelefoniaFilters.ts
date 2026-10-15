import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * T36 — filtros da tela de Telefonia vivem na URL.
 *
 * Por que na URL e nao em estado local: o usuario recarrega, volta pelo historico ou
 * compartilha o link da tela, e os filtros precisam sobreviver — e literalmente o que
 * o aceite pede ("reload mantem filtros").
 *
 * EXCEÇÃO (SEC-FRONTEND-05): o texto livre da busca (`q`, telefone/nome digitado)
 * NÃO vai para a URL — fica em memória. Na barra de endereço ele vazaria para o
 * histórico, a restauração de sessão e qualquer link copiado. `q` segue em
 * FILTROS_PADRAO só como chave legada, para `limpar` remover `?q=` de links antigos.
 *
 * Defaults do plano: `7d | all | all | all | (vazio) | 1 | mine | (vazio)`.
 * `setFilter` reseta `page` para 1 SEMPRE que a chave muda o RECORTE da lista (period,
 * channel, dir, result, q, scope): continuar na pagina 3 de um resultado que mudou de
 * tamanho nao faz sentido. `page` e `call` ficam de fora: `call` e o detalhe da linha
 * selecionada, nao um filtro — resetar a pagina ali jogaria a lista de volta para a 1 e o
 * detalhe (que sai de `historicos.rows` da pagina atual) sumiria (R2-MOD-014).
 * Voltar um filtro ao valor padrao APAGA o parametro, para a URL nao ficar suja.
 */
export const FILTROS_PADRAO = {
  period: '7d',
  channel: 'all',
  dir: 'all',
  result: 'all',
  q: '',
  page: '1',
  scope: 'mine',
  call: '',
} as const;

export type FiltroChave = keyof typeof FILTROS_PADRAO;

export interface TelefoniaFiltros {
  period: string;
  channel: 'all' | 'voip' | 'whatsapp';
  dir: 'all' | 'inbound' | 'outbound';
  result: string;
  q: string;
  page: number;
  scope: 'mine' | 'all';
  call: string;
}

export function useTelefoniaFilters(): {
  filtros: TelefoniaFiltros;
  setFilter: (chave: FiltroChave, valor: string | number) => void;
  limpar: () => void;
} {
  const [params, setParams] = useSearchParams();

  // SEC-FRONTEND-05: a busca nasce vazia e nunca é lida da URL — recarregar a
  // página não restaura o texto digitado.
  const [busca, setBusca] = useState('');

  const filtros = useMemo<TelefoniaFiltros>(
    () => ({
      period: params.get('period') ?? FILTROS_PADRAO.period,
      channel: (params.get('channel') ?? FILTROS_PADRAO.channel) as TelefoniaFiltros['channel'],
      dir: (params.get('dir') ?? FILTROS_PADRAO.dir) as TelefoniaFiltros['dir'],
      result: params.get('result') ?? FILTROS_PADRAO.result,
      q: busca,
      page: Math.max(1, Number(params.get('page') ?? FILTROS_PADRAO.page) || 1),
      scope: (params.get('scope') ?? FILTROS_PADRAO.scope) as TelefoniaFiltros['scope'],
      call: params.get('call') ?? FILTROS_PADRAO.call,
    }),
    [params, busca],
  );

  const setFilter = useCallback(
    (chave: FiltroChave, valor: string | number) => {
      const texto = String(valor);
      if (chave === 'q') {
        // Texto livre só em memória, sem tocar na URL (PII). Trocar a busca
        // refaz o recorte, então a página volta para 1 — mas a URL só é tocada
        // quando a página atual não é a 1, para digitar não alterar a URL.
        setBusca(texto);
        if ((params.get('page') ?? '1') !== '1') {
          setParams(
            (antes) => {
              const proximos = new URLSearchParams(antes);
              proximos.set('page', '1');
              return proximos;
            },
            { replace: true },
          );
        }
        return;
      }
      setParams(
        (antes) => {
          const proximos = new URLSearchParams(antes);
          if (!texto || texto === FILTROS_PADRAO[chave]) proximos.delete(chave);
          else proximos.set(chave, texto);
          if (chave !== 'page' && chave !== 'call') proximos.set('page', '1');
          return proximos;
        },
        { replace: true },
      );
    },
    [params, setParams],
  );

  const limpar = useCallback(() => {
    setBusca('');
    setParams(
      (antes) => {
        const proximos = new URLSearchParams(antes);
        (Object.keys(FILTROS_PADRAO) as FiltroChave[]).forEach((k) => proximos.delete(k));
        return proximos;
      },
      { replace: true },
    );
  }, [setParams]);

  return { filtros, setFilter, limpar };
}
