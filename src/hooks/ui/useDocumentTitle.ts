import { useEffect } from 'react';

import { formatDocumentTitle } from '@/lib/productName';

/**
 * Sets the document title dynamically.
 * Restores the base title on unmount.
 *
 * O nome do produto (e o separador) vêm de `@/lib/productName` — a mesma marca
 * do `<title>` do `index.html` e do popup do chat. Não repita o literal aqui:
 * era por isso que a aba dizia "WhatsApp Omnichannel" enquanto o app diz "ZAPP WEB".
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = formatDocumentTitle(title);
    return () => { document.title = prev; };
  }, [title]);
}
