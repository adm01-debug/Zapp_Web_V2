/**
 * E24: texto de cada causa de falha da busca — **uma fonte só**, usada pelo picker do inbox e pelo
 * cadastro de contato (antes cada consumidor escrevia o seu, e os dois divergiam: um dizia "Falha
 * ao buscar sugestões" para tudo, o outro não dizia nada).
 *
 * Regras que vieram do plano:
 *  - `cost_guard` não é falha: é pausa, e o texto diz o que continua funcionando (busca por Enter);
 *  - `not_found` é resposta legítima, não erro de rota;
 *  - nenhum texto carrega o termo digitado (E39 — o termo nunca sai do navegador).
 */
import type { GeoFailureKind } from '@/lib/mapboxGeocode';

/** Causas que a UI sabe explicar. `cost_guard` vem da guarda de custo, não da Mapbox. */
export type SearchFailureKind = GeoFailureKind | 'cost_guard';

const SEARCH_FAILURE_TEXT: Record<SearchFailureKind, string> = {
  network: 'Sem conexão com o serviço de mapas.',
  timeout: 'A busca demorou demais.',
  http: 'Erro no serviço de mapas.',
  rate_limited: 'Limite de buscas atingido — aguarde 1 min.',
  cost_guard: 'Sugestões pausadas este mês (busca por Enter continua).',
  not_found: 'Endereço não encontrado.',
  // `aborted` é consulta cancelada por outra mais nova: não é falha e não vira texto de erro.
  aborted: 'Busca cancelada.',
};

export function searchFailureText(kind: SearchFailureKind): string {
  return SEARCH_FAILURE_TEXT[kind];
}

/** E27: aviso único de pausa, com o relógio da frente quando o motivo é o 429. */
export function pausedNoticeText(
  reason: 'rate_limited' | 'cost_guard' | null,
  secondsLeft: number | null,
): string {
  if (reason === 'cost_guard') return SEARCH_FAILURE_TEXT.cost_guard;
  if (secondsLeft === null) return 'Sugestões pausadas — aguarde um instante.';
  // A3-04 (onda 2): a espera terminava e o texto continuava "pausadas por 0 s" — um contador
  // morto, que dizia limite vigente quando não havia mais nenhum. Zero é "já pode tentar".
  if (secondsLeft <= 0) return 'Sugestões pausadas — o tempo de espera acabou, já pode tentar de novo.';
  return `Sugestões pausadas por ${secondsLeft} s — a busca por Enter continua funcionando.`;
}
