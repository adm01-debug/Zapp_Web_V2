/**
 * Topico exclusivo por instancia para canais de `postgres_changes`.
 *
 * `supabase.channel(nome)` devolve o canal ja existente quando o nome se repete
 * e, desde a realtime-js 2.101, `.on()` em canal ja inscrito lanca erro: um hook
 * com nome fixo montado em dois componentes ao mesmo tempo derruba a tela. Com
 * canal compartilhado, o unmount de um consumidor tambem fazia removeChannel e
 * cortava o realtime do outro.
 *
 * So para postgres_changes (o servidor filtra por tabela/filtro, nao pelo
 * topico). NUNCA para presence/broadcast: ali clientes diferentes precisam do
 * mesmo topico para se enxergarem.
 */
export function uniqueRealtimeTopic(base: string): string {
  return `${base}:${crypto.randomUUID()}`;
}
