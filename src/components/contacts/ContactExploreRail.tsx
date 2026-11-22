import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ContactRound, Pause, Play, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactPortrait } from './ContactPortrait';
import { toContactDisplay } from './contactDisplay';
import { useContactsMotion } from './contactsMotion';
import type { Contact } from './types';

/**
 * ZD-081..084 — carrossel "Explore seus contatos" (`.zc-network` do design).
 *
 * Fica no rodapé dos resultados e é a navegação rápida pelos contatos do
 * recorte atual: clicar num mini-card abre a ficha dele.
 *
 * Movimento:
 *  - auto-avanço por `requestAnimationFrame`, ~0,021 px/ms (o mesmo passo do
 *    modelo), com pausa no hover, no foco e com a aba oculta;
 *  - "Pausar/Reproduzir" é do operador e tem precedência: o auto-avanço nunca
 *    volta sozinho depois da pausa manual;
 *  - `prefers-reduced-motion` desliga o auto-avanço (`contactsCarouselMotion`),
 *    nunca a navegação manual;
 *  - as setas andam UM mini-card por vez e param o auto-avanço (é o que o
 *    operador pediu ao clicar).
 */
export function ContactExploreRail({
  contatos,
  onAbrirContato,
  onAnteriorNoCarrossel,
  className,
}: {
  contatos: Contact[];
  onAbrirContato: (contactId: string) => void;
  /** Opcional: `raiz`/`ScrollArea` externos podem reagir ao passo dado pela seta. */
  onAnteriorNoCarrossel?: (direcao: 1 | -1) => void;
  className?: string;
}) {
  const { reduced, carousel } = useContactsMotion();
  const trilhoRef = useRef<HTMLDivElement | null>(null);
  const [pausadoManual, setPausadoManual] = useState(false);
  const [hover, setHover] = useState(false);
  const [foco, setFoco] = useState(false);
  const [abaOculta, setAbaOculta] = useState(false);
  const [podeMover, setPodeMover] = useState(false);

  const autoAvanca = carousel.autoplay && !pausadoManual && !hover && !foco && !abaOculta;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const aoTrocarVisibilidade = () => setAbaOculta(document.hidden);
    aoTrocarVisibilidade();
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    return () => document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
  }, []);

  /** Largura de um passo: largura do primeiro mini-card + o gap de 11px. */
  const passo = useCallback((): number => {
    const primeiro = trilhoRef.current?.firstElementChild;
    if (!primeiro) return 224;
    return primeiro.getBoundingClientRect().width + 11;
  }, []);

  /** Recalcula se o trilho é maior que a janela visível (habilita os controles). */
  const medirExcedente = useCallback(() => {
    const trilho = trilhoRef.current;
    const janela = trilho?.parentElement;
    if (!trilho || !janela) return;
    // Largura 0 = layout ainda não medido (primeiro paint/SSR): não dá para
    // afirmar que o trilho cabe, então os controles ficam disponíveis.
    const medido = janela.clientWidth > 0;
    setPodeMover(contatos.length > 1 && (!medido || trilho.scrollWidth > janela.clientWidth + 1));
  }, [contatos.length]);

  useEffect(() => {
    medirExcedente();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medirExcedente);
    if (trilhoRef.current) observador.observe(trilhoRef.current);
    return () => observador.disconnect();
  }, [medirExcedente]);

  // Auto-avanço: desloca o trilho e recicla o cartão que saiu para o fim da
  // fila — o trilho nunca "termina", como no modelo.
  useEffect(() => {
    if (!autoAvanca || typeof requestAnimationFrame === 'undefined') return;
    let quadro = 0;
    let deslocamento = 0;
    let ultimo = 0;
    const animar = (agora: number) => {
      const delta = ultimo ? agora - ultimo : 16;
      ultimo = agora;
      const trilho = trilhoRef.current;
      if (trilho) {
        deslocamento += delta * 0.021;
        const passoAtual = passo();
        while (deslocamento >= passoAtual) {
          deslocamento -= passoAtual;
          const primeiro = trilho.firstElementChild;
          if (primeiro) trilho.appendChild(primeiro);
        }
        trilho.style.transform = `translateX(${-deslocamento}px)`;
      }
      quadro = requestAnimationFrame(animar);
    };
    quadro = requestAnimationFrame(animar);
    const trilho = trilhoRef.current;
    return () => {
      cancelAnimationFrame(quadro);
      if (trilho) {
        trilho.style.transform = '';
      }
    };
  }, [autoAvanca, passo]);

  const moverUmPasso = (direcao: 1 | -1) => {
    setPausadoManual(true);
    const trilho = trilhoRef.current;
    if (trilho) {
      trilho.style.transform = '';
      if (direcao === 1) {
        const primeiro = trilho.firstElementChild;
        if (primeiro) trilho.appendChild(primeiro);
      } else {
        const ultimo = trilho.lastElementChild;
        if (ultimo) trilho.insertBefore(ultimo, trilho.firstElementChild);
      }
    }
    onAnteriorNoCarrossel?.(direcao);
  };

  const rotuloPausa = pausadoManual || (reduced && !carousel.autoplay)
    ? 'Reproduzir'
    : 'Pausar';

  const controlesHabilitados = podeMover && contatos.length > 1;

  const itens = useMemo(
    () => contatos.map((contato) => ({ contato, display: toContactDisplay(contato) })),
    [contatos],
  );

  return (
    <section
      aria-label="Carrossel de todos os contatos"
      className={cn(
        'mt-[23px] rounded-[12px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] p-[17px]',
        'shadow-[inset_0_1px_0_hsl(0_0%_100%/0.02)]',
        'max-[659px]:mt-[21px] max-[659px]:p-[13px]',
        'max-[559px]:p-3',
        className,
      )}
    >
      <div className="mb-[15px] flex items-center justify-between gap-[15px] max-[659px]:gap-2 max-[559px]:gap-[6px]">
        <div className="flex min-w-0 items-center gap-[10px] max-[559px]:gap-2">
          <span
            className={cn(
              'grid h-8 w-[31px] shrink-0 place-items-center rounded-[8px] border border-[hsl(221_83%_53%/0.3)]',
              'bg-[hsl(var(--contacts-blue-soft))] text-[hsl(var(--contacts-blue))]',
              'max-[659px]:h-[29px] max-[659px]:w-[27px] max-[559px]:hidden',
            )}
          >
            <ContactRound className="h-[17px] w-[17px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 font-display text-[18px] font-medium leading-[1.2] tracking-[-.2px] text-[hsl(var(--contacts-ink))] max-[659px]:text-[16px] max-[559px]:text-[15px]">
              Explore seus contatos
            </h2>
            <p className="mb-0 mt-[3px] text-2xs text-[hsl(var(--contacts-quiet))] max-[659px]:hidden">
              Navegação rápida pelos resultados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-[6px] max-[659px]:gap-1 max-[559px]:gap-[4px]">
          <button
            type="button"
            onClick={() => setPausadoManual((atual) => !atual)}
            disabled={!controlesHabilitados}
            aria-label={`${rotuloPausa} carrossel`}
            className={cn(
              'flex min-h-[30px] items-center gap-[6px] rounded-[7px] border border-[hsl(var(--contacts-line))]',
              '[@media(pointer:coarse)]:min-h-[42px]',
              'bg-[hsl(var(--contacts-raised))] px-[9px] py-[7px] text-2xs text-[hsl(var(--contacts-muted))]',
              'transition-colors hover:text-[hsl(var(--contacts-ink))] disabled:pointer-events-none disabled:opacity-40',
              'max-[659px]:p-[7px]',
            )}
          >
            {pausadoManual || (reduced && !carousel.autoplay) ? (
              <Play className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Pause className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{rotuloPausa}</span>
          </button>
          <button
            type="button"
            onClick={() => moverUmPasso(-1)}
            disabled={!controlesHabilitados}
            aria-label="Contato anterior no carrossel"
            className={cn(
              'grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[hsl(var(--contacts-line))]',
              'bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-muted))]',
              'transition-colors hover:text-[hsl(var(--contacts-ink))] disabled:pointer-events-none disabled:opacity-40',
              '[@media(pointer:coarse)]:h-[42px] [@media(pointer:coarse)]:w-[42px]',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => moverUmPasso(1)}
            disabled={!controlesHabilitados}
            aria-label="Próximo contato no carrossel"
            className={cn(
              'grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[hsl(var(--contacts-line))]',
              'bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-muted))]',
              'transition-colors hover:text-[hsl(var(--contacts-ink))] disabled:pointer-events-none disabled:opacity-40',
              '[@media(pointer:coarse)]:h-[42px] [@media(pointer:coarse)]:w-[42px]',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'relative min-w-0 overflow-hidden',
          '[mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-15px),transparent)]',
        )}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFoco(true)}
        onBlur={(evento) => { setFoco(evento.currentTarget.contains(evento.relatedTarget as Node | null)); }}
      >
        <div
          ref={trilhoRef}
          data-rail-track=""
          className="flex w-max gap-[11px] [will-change:transform]"
        >
          {itens.map(({ contato, display }) => (
            <button
              key={contato.id}
              type="button"
              onClick={() => onAbrirContato(contato.id)}
              aria-label={`Abrir ficha de ${display.nomeCompleto ?? contato.name}`}
              className={cn(
                'relative flex min-h-[88px] w-[248px] min-w-[248px] items-center gap-3 rounded-[10px] p-[6px] text-left',
                'border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-ink))]',
                'shadow-[inset_0_1px_0_hsl(0_0%_100%/0.03)] transition-colors',
                'hover:border-[hsl(221_83%_53%/0.55)] hover:bg-[hsl(var(--contacts-soft-line))]',
                'max-[659px]:w-[238px] max-[659px]:min-w-[238px] max-[659px]:gap-[10px]',
              )}
            >
              <ContactPortrait
                contact={contato}
                className="h-[76px] w-[61px] shrink-0 rounded-[6px]"
                initialsClassName="text-[24px]"
              />
              <span className="grid min-w-0 max-w-[136px] gap-[5px] pr-0.5 max-[659px]:max-w-[132px]">
                <span className="truncate font-display text-[16px] font-medium leading-[1.2] tracking-[-.2px]">
                  {display.nomeCompleto ?? contato.name}
                </span>
                <span className="truncate text-2xs text-[hsl(var(--contacts-muted))]">
                  {display.empresa ?? 'Empresa não informada'}
                </span>
              </span>
              <ArrowUpRight
                className="absolute bottom-3 right-[10px] h-[13px] w-[13px] text-[hsl(var(--contacts-quiet))]"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        {itens.length === 0 && (
          <p className="py-6 text-center text-xs text-[hsl(var(--contacts-quiet))]">
            Nenhum contato neste filtro.
          </p>
        )}
      </div>
    </section>
  );
}