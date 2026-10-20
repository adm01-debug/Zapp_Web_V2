import { appDayEnd, appDayStart } from '@/lib/localDay';

export interface DashboardFiltersState {
  dateRange: {
    from: Date;
    to: Date;
  };
  period: 'today' | 'yesterday' | 'week' | 'month' | 'custom';
  queueId: string | null;
  agentId: string | null;
}

/**
 * Recorte padrão do Dashboard: "hoje" no **fuso do app** (America/Sao_Paulo) — o mesmo que o
 * servidor usa em `in_last_days` —, e não no fuso do navegador de quem está olhando. Com o fuso
 * do navegador, o mesmo "hoje" recortava janelas diferentes por pessoa e não batia com os números
 * contados no banco.
 *
 * Vive fora do `.tsx` do componente porque o lint de react-refresh exige que um arquivo de
 * componente exporte só componentes — esta é a parte não-visual, compartilhada pelo hook de URL,
 * pelo hook de dados e pelos testes.
 */
export const getDefaultFilters = (now: Date = new Date()): DashboardFiltersState => ({
  dateRange: {
    from: appDayStart(0, now),
    to: appDayEnd(0, now),
  },
  period: 'today',
  queueId: null,
  agentId: null,
});
