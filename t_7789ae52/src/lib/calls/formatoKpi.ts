/**
 * Formatacao dos KPIs de Telefonia (T38).
 *
 * Arquivo proprio de proposito: o componente precisa exportar SO componente
 * (`react-refresh/only-export-components`) — foi o warning que a guarda pegou no T35
 * com a constante dos periodos, e que eu repeti aqui na primeira versao.
 */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(seg)}` : `${m}:${dois(seg)}`;
}
