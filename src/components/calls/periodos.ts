/**
 * Periodos da tela de Telefonia (T35).
 *
 * Fica em arquivo proprio de proposito: o componente precisa exportar SO componente
 * (regra `react-refresh/only-export-components`), e a constante e consumida tambem
 * pelo teste e, no T36, pelo filtro da URL.
 */
export const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes_passado', label: 'Mês passado' },
] as const;

export type PeriodoValue = (typeof PERIODOS)[number]['value'];
