import { useEffect } from 'react';
import { motion } from 'framer-motion';

const LINHAS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

const SUBLABELS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  '0': '+',
};

/** Teclas aceitas pelo teclado fisico (o mesmo conjunto do teclado da tela). */
const TECLAS_FISICAS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#']);

interface KeypadProps {
  onKey: (digito: string) => void;
  disabled?: boolean;
  /**
   * `edit`: as teclas montam o numero que vai ser discado.
   * `dtmf`: a ligacao ja esta de pe e as teclas mandam tom para o outro lado.
   * O componente nao decide o que fazer com o digito - so avisa quem o usa.
   */
  mode: 'edit' | 'dtmf';
  /** Backspace fisico, quando quem usa quer que ele apague (o discador quer). */
  onBackspace?: () => void;
}

/**
 * Teclado numerico (T58), extraido do `DialPad` para ser reusado pelo painel lateral.
 *
 * O teclado fisico e escutado so enquanto o componente esta montado e vive dentro do
 * escopo `data-keypad-scope`, que existe para o atalho nao capturar digitacao de outros
 * campos da tela (busca de contato, anotacao).
 */
export function Keypad({ onKey, disabled = false, mode, onBackspace }: KeypadProps) {
  useEffect(() => {
    if (disabled) return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      // Nao rouba tecla de quem esta digitando num campo (busca, anotacao, input).
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      const escopo = document.querySelector('[data-keypad-scope]');
      if (!escopo) return;
      if (TECLAS_FISICAS.has(e.key)) {
        e.preventDefault();
        onKey(e.key);
      } else if (e.key === 'Backspace' && onBackspace) {
        e.preventDefault();
        onBackspace();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onKey, onBackspace, disabled]);

  return (
    <div
      className="grid w-full max-w-[280px] grid-cols-3 gap-2"
      data-keypad-scope
      data-keypad-mode={mode}
      role="group"
      aria-label={mode === 'dtmf' ? 'Teclado de tons (DTMF)' : 'Teclado numérico'}
    >
      {LINHAS.map((linha) =>
        linha.map((digito) => (
          <motion.button
            key={digito}
            type="button"
            whileTap={{ scale: 0.92 }}
            disabled={disabled}
            onClick={() => onKey(digito)}
            aria-label={digito}
            className="flex h-[46px] w-full flex-col items-center justify-center rounded-xl border border-border/50 bg-muted/50 transition-colors hover:bg-muted disabled:opacity-50"
          >
            <span className="text-base font-semibold text-foreground">{digito}</span>
            {SUBLABELS[digito] && (
              <span className="-mt-0.5 text-[9px] tracking-widest text-muted-foreground">{SUBLABELS[digito]}</span>
            )}
          </motion.button>
        )),
      )}
    </div>
  );
}
