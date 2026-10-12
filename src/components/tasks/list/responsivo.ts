/**
 * Etapa 070 — o responsivo da Lista.
 *
 * A partir de 1024 px a Lista é a TABELA; abaixo disso (o breakpoint `lg` do
 * Tailwind, 1024 px, é o corte) ela vira uma lista de cartões compactos, que não
 * rola na horizontal nem em 360 px.
 */
import { useEffect, useState } from 'react';

/** O corte do layout (uma consulta só, para a tela e os testes falarem igual). */
export const LISTA_ESTREITA_QUERY = '(max-width: 1023px)';

/** Mede a viewport AGORA; sem `matchMedia` (jsdom) o layout é o largo. */
function medir(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(LISTA_ESTREITA_QUERY).matches;
}

/**
 * `true` quando a viewport é estreita o bastante para a lista de cartões.
 * O valor nasce já medido (sem piscar) e acompanha a mudança de tamanho da
 * janela pelo listener — nada de `setState` solto no corpo do efeito.
 */
export function useListaEstreita(): boolean {
  const [estreita, setEstreita] = useState<boolean>(medir);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia(LISTA_ESTREITA_QUERY);
    const aoMudar = (evento: MediaQueryListEvent) => setEstreita(evento.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  return estreita;
}
