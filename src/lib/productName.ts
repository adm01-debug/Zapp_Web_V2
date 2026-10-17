/**
 * productName.ts — nome do produto em um só lugar.
 *
 * O texto é o mesmo do `<title>` de `index.html` ("ZAPP WEB"). Enquanto eram
 * dois literais separados, o título da aba montado pelos hooks dizia
 * "WhatsApp Omnichannel" (nome antigo) e destoava da marca que o aplicativo
 * mostra. Quem escreve em `document.title` usa a constante (ou
 * `formatDocumentTitle`) daqui — nunca repita o literal.
 */
export const PRODUCT_NAME = 'ZAPP WEB';

/**
 * Título da aba no padrão "Tela | ZAPP WEB" — ou só a marca quando não há tela.
 *
 * `useDocumentBadge` prefixa "(n) " no título JÁ montado (padrão de e-mail),
 * então o separador e o nome do produto ficam só aqui.
 */
export function formatDocumentTitle(title?: string): string {
  return title ? `${title} | ${PRODUCT_NAME}` : PRODUCT_NAME;
}
