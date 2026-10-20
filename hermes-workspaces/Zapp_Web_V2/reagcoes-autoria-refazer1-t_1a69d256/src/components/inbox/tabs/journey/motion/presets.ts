/**
 * J05 — Peças de efeito sutil do Journey (decisão **D12 ampliada em 07/10/2026**).
 *
 * Regras do dono que este arquivo materializa:
 *  - **manter as cores atuais**: só tokens que o `tailwind.config.ts` já define
 *    (primary, success, warning, info, muted, border, ring…), nenhuma cor nova;
 *  - **efeito sutil**: nada gira, quica ou passa de 400 ms (as durações estão em
 *    `MOTION`, fonte única) e o clique funciona durante a animação;
 *  - **tudo desligado em "reduzir movimento"**: toda classe de movimento vive sob
 *    a variante `motion-safe:` e tem a contraparte neutra sob `motion-reduce:`.
 *
 * Por que as classes são escritas **por extenso** e não montadas em tempo de
 * execução: o Tailwind (JIT) só gera a classe que ele enxerga como texto no
 * arquivo. Uma duração montada por interpolação (`duration-[` + valor + `ms]`)
 * não gera nada e o efeito simplesmente não aconteceria. Por isso o teste
 * `presets.test.ts` confere que as strings batem com `MOTION` — CSS e JS não
 * podem divergir em silêncio.
 *
 * Aqui só mora **classe de movimento** (e as constantes de tempo/atraso que os
 * componentes compartilham). Classe estática de cor fica no componente que a
 * usa, junto do contexto onde ela aparece.
 */

/** Durações (ms) e curva usadas por TODAS as peças — fonte única. */
export const MOTION: {
  fast: number;
  base: number;
  slow: number;
  ease: [number, number, number, number];
} = {
  fast: 120,
  base: 200,
  slow: 320,
  ease: [0.22, 1, 0.36, 1],
};

/** Cores que o sistema já tem (D02). Nenhuma cor nova entra por aqui. */
export type GlowToken = 'primary' | 'success' | 'warning' | 'info' | 'muted';

/**
 * Cartão do episódio: transição de 200 ms ease-out, elevação de 2 px, sombra,
 * borda realçada, "afundar" ao pressionar e anel suave no foco pelo teclado.
 * Em "reduzir movimento" o cartão fica parado (nada de deslocar, encolher ou
 * levantar sombra) — sem `shadow-none`, para não apagar a sombra que o cartão
 * já tem — e o anel de foco continua igual ao do modo normal **nos dois modos**:
 * anel de foco é acessibilidade de teclado, não movimento.
 */
export const CARD_INTERACTIVE =
  'motion-safe:transition motion-safe:duration-[200ms] motion-safe:ease-out ' +
  'motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-primary/50 motion-safe:hover:shadow-md ' +
  'motion-safe:active:scale-[0.99] ' +
  'motion-safe:focus-visible:ring-2 motion-safe:focus-visible:ring-ring/50 motion-safe:focus-visible:ring-offset-1 ' +
  'motion-reduce:transition-none motion-reduce:transform-none ' +
  'motion-reduce:focus-visible:ring-2 motion-reduce:focus-visible:ring-ring/50 motion-reduce:focus-visible:ring-offset-1';

/**
 * Setinha "abrir" do cartão: nasce escondida e 2 px à esquerda; aparece e desliza
 * até o lugar no hover OU no foco do cartão (`group`) — é o sinal de que o clique
 * abre o episódio. Em "reduzir movimento" ela nunca fica escondida.
 */
export const CHEVRON_REVEAL =
  'motion-safe:opacity-0 motion-safe:-translate-x-0.5 motion-safe:transition motion-safe:duration-[120ms] motion-safe:ease-out ' +
  'motion-safe:group-hover:opacity-100 motion-safe:group-hover:translate-x-0 ' +
  'motion-safe:group-focus-visible:opacity-100 motion-safe:group-focus-visible:translate-x-0 ' +
  'motion-reduce:opacity-100 motion-reduce:transform-none motion-reduce:transition-none';

/**
 * Brilho de borda no hover do cartão, na cor do token da categoria (D02):
 * `primary` (mensagens), `success` (telefone), `warning` (tarefas), `info`
 * (e-mail) e `muted` (arquivos/encerramento).
 */
const GLOW_RING_POR_TOKEN: Record<GlowToken, string> = {
  primary:
    'motion-safe:transition-shadow motion-safe:duration-[200ms] motion-safe:hover:border-primary/60 motion-safe:hover:ring-2 motion-safe:hover:ring-primary/40 motion-reduce:transition-none',
  success:
    'motion-safe:transition-shadow motion-safe:duration-[200ms] motion-safe:hover:border-success/60 motion-safe:hover:ring-2 motion-safe:hover:ring-success/40 motion-reduce:transition-none',
  warning:
    'motion-safe:transition-shadow motion-safe:duration-[200ms] motion-safe:hover:border-warning/60 motion-safe:hover:ring-2 motion-safe:hover:ring-warning/40 motion-reduce:transition-none',
  info: 'motion-safe:transition-shadow motion-safe:duration-[200ms] motion-safe:hover:border-info/60 motion-safe:hover:ring-2 motion-safe:hover:ring-info/40 motion-reduce:transition-none',
  muted:
    'motion-safe:transition-shadow motion-safe:duration-[200ms] motion-safe:hover:border-muted-foreground/60 motion-safe:hover:ring-2 motion-safe:hover:ring-muted-foreground/40 motion-reduce:transition-none',
};

/** Classes do brilho de borda para o token pedido. Token desconhecido é erro. */
export function GLOW_RING(token: GlowToken): string {
  const classes = GLOW_RING_POR_TOKEN[token];
  if (!classes) {
    throw new Error(
      `GLOW_RING: "${String(token)}" não é cor do sistema. Use: primary, success, warning, info ou muted.`,
    );
  }
  return classes;
}

/** Atraso por item da entrada escalonada (60 ms). */
export const STAGGER_PER_ITEM_MS = 60;

/** Quantos itens entram escalonados; do 9º em diante não há atraso. */
export const STAGGER_MAX_ITEMS = 8;

/**
 * Atraso da entrada do item de índice `index`: 60 ms por item, teto de 8 itens.
 * Índice inválido (negativo, fracionário, infinito) não atrasa nada.
 */
export function fadeSlideDelay(index = 0): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  if (index >= STAGGER_MAX_ITEMS) return 0;
  return Math.round(index) * STAGGER_PER_ITEM_MS;
}

/**
 * Entrada dispara UMA vez, quando o item entra na tela (com 40 px de antecipação
 * na parte de baixo, para o cartão não "pular" ao aparecer).
 */
export const FADE_SLIDE_VIEWPORT = { once: true, margin: '0px 0px -40px 0px' } as const;
