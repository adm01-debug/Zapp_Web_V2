import { useEffect } from 'react';

/** Prefixo de contagem no padrão de e-mail: "(3) " antes do título. */
const BADGE_PREFIX = /^\(\d+\)\s*/;

/** Monta o título da aba com o prefixo de contagem (padrão de e-mail). */
export function formatBadgeTitle(count: number, base: string): string {
  return count > 0 ? `(${count}) ${base}` : base;
}

/** Remove um prefixo "(n) " já aplicado — evita empilhar contagens. */
export function stripBadgeTitle(title: string): string {
  return title.replace(BADGE_PREFIX, '');
}

/**
 * useDocumentBadge — prefixa o título da aba com "(n) " enquanto houver `count`
 * itens pendentes E a aba estiver em segundo plano (etapa 107, padrão de e-mail).
 *
 * - Visível: título intacto.
 * - Oculta com `count > 0`: "(n) " + título.
 * - Ao voltar para a aba: prefixo removido; ao desmontar: título restaurado.
 *
 * Só escreve em `document.title` — sem estado e sem `useEffect` que chame
 * `setState` (o lint-ratchet reprova setState dentro de efeito).
 */
export function useDocumentBadge(count: number): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const apply = () => {
      const base = stripBadgeTitle(document.title);
      document.title = document.hidden ? formatBadgeTitle(count, base) : base;
    };

    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      document.title = stripBadgeTitle(document.title);
    };
  }, [count]);
}
