import { useEffect } from 'react';

const BASE_TITLE = 'WhatsApp Omnichannel';

/**
 * Sets the document title dynamically.
 * Restores the base title on unmount.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = prev; };
  }, [title]);
}
