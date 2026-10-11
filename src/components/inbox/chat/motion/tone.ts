/**
 * Kit de microinterações do chat — tons de estado.
 *
 * Regra do dono (11/10/2026): só as cores que o sistema já tem. Toda cor sai
 * daqui, escrita **por extenso** — o Tailwind (JIT) só gera a classe que ele
 * enxerga como texto no arquivo — e cada uma aponta para um token de
 * `src/styles/tokens.css` (`hsl(var(--info))`, `hsl(var(--whatsapp))`…).
 * Nenhuma cor literal entra por aqui.
 *
 * Correspondência de estado (o guia `docs/design/CHAT_MICROINTERACOES.md` traz o
 * mapa completo): info = aviso de sistema, primary = ação/marca, success =
 * concluído, warning = atenção, destructive = falha, whatsapp = canal.
 */
export type MotionTone = 'info' | 'primary' | 'success' | 'warning' | 'destructive' | 'whatsapp';

export interface MotionToneClasses {
  /** Texto/ícone na cor do estado. */
  text: string;
  /** Fundo sólido do estado. */
  bg: string;
  /** Borda na cor do estado. */
  border: string;
  /** Anel (outline) na cor do estado. */
  ring: string;
  /** Fundo tonal suave — 15% do token, para o realce não virar bloco de cor. */
  soft: string;
}

const TONES: Record<MotionTone, MotionToneClasses> = {
  info: { text: 'text-info', bg: 'bg-info', border: 'border-info', ring: 'ring-info', soft: 'bg-info/15' },
  primary: { text: 'text-primary', bg: 'bg-primary', border: 'border-primary', ring: 'ring-primary', soft: 'bg-primary/15' },
  success: { text: 'text-success', bg: 'bg-success', border: 'border-success', ring: 'ring-success', soft: 'bg-success/15' },
  warning: { text: 'text-warning', bg: 'bg-warning', border: 'border-warning', ring: 'ring-warning', soft: 'bg-warning/15' },
  destructive: { text: 'text-destructive', bg: 'bg-destructive', border: 'border-destructive', ring: 'ring-destructive', soft: 'bg-destructive/15' },
  whatsapp: { text: 'text-whatsapp', bg: 'bg-whatsapp', border: 'border-whatsapp', ring: 'ring-whatsapp', soft: 'bg-whatsapp/15' },
};

/**
 * Classes do tom pedido. Tom fora da lista do sistema é **erro** (não cai em
 * cor nenhuma e não passa em silêncio): quem chamou escreveu um estado que o
 * produto não tem.
 */
export function toneClasses(tone: MotionTone): MotionToneClasses {
  const classes = TONES[tone];
  if (!classes) {
    throw new Error(
      `toneClasses: "${String(tone)}" não é cor do sistema. Use: info, primary, success, warning, destructive ou whatsapp.`,
    );
  }
  return classes;
}

/** Os seis tons, na ordem do mapa de tokens do guia. */
export const MOTION_TONES = Object.keys(TONES) as MotionTone[];

/**
 * Formata um número para exibição em pt-BR: separador de milhar e as casas
 * pedidas. Fração é informação — não arredonda sozinho. Mora aqui (módulo sem
 * componente) para não misturar função e componente no mesmo arquivo.
 */
export function formatMotionNumber(value: number, decimals = 0): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
