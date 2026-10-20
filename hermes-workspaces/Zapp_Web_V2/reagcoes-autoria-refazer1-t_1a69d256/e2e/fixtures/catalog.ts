// Fixtures E2E do módulo Catálogo (`?view=catalog`) — CT-81.
//
// Contato: NÃO duplicar o id. O contato fixo de produção já está versionado em
// `./e2e-contact` (`E2E_FIXTURE_CONTACT_ID`, `[E2E] Contato de teste`) e é
// reaproveitado aqui por import/re-export.
//
// Produto: o plano CT-81 citava o produto fixo `PO-13153` (`CHANGELOG_CATALOGO.md:12`,
// "PO-13153: 6 imagens, 1 swatch, LASER"). **VERIFICADO em 2026-10-02** com sessão
// autenticada no próprio app (`?view=catalog`, conta de teste): buscar `PO-13153`
// devolve **1 card** e o detalhe mostra `SKU: PO-13153` —
// "Açucareiro com formato de coração e colher em bambu", gravação LASER, 1 variante
// (o plano citava 6 imagens; a ficha real mostra 8). Buscar `13153` sem o prefixo
// devolve 0 cards, ou seja o SKU é buscável pelo valor exato. O SKU continua
// parametrizável por env (`E2E_CATALOG_PRODUCT_SKU`) e o flag
// `E2E_CATALOG_PRODUCT_SKU_VERIFIED` libera os asserts que dependem dele. Um spec deve degradar com aviso claro enquanto
// `E2E_CATALOG_PRODUCT_SKU_VERIFIED` for falso, em vez de buscar um id
// inventado. Não invente id/URL de produto.
import {
  E2E_FIXTURE_CONTACT_ID,
  E2E_FIXTURE_CONTACT_NAME,
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
} from './e2e-contact';

export {
  E2E_FIXTURE_CONTACT_ID,
  E2E_FIXTURE_CONTACT_NAME,
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
};

/** View do catálogo no `ViewRouter`. */
export const E2E_CATALOG_VIEW = 'catalog';
/** URL da tela principal do catálogo (CT-82 passo 2). */
export const E2E_CATALOG_PATH = '/?view=catalog';

/**
 * PENDÊNCIA (CT-81) — SKU do produto de teste, ainda NÃO confirmado no
 * PromoGifts. Parametrizado por `E2E_CATALOG_PRODUCT_SKU` (default = o SKU
 * citado na doc do repo). Não é um id verificado.
 */
export const E2E_CATALOG_PRODUCT_SKU =
  process.env.E2E_CATALOG_PRODUCT_SKU ?? 'PO-13153';

/**
 * Enquanto falso, nenhum assert pode depender de o produto existir/buscar no
 * catálogo externo — o spec deve pular com aviso. Virar `true` só depois de
 * confirmar o SKU no PromoGifts (env `E2E_CATALOG_PRODUCT_SKU_VERIFIED=true`).
 */
export const E2E_CATALOG_PRODUCT_SKU_VERIFIED =
  process.env.E2E_CATALOG_PRODUCT_SKU_VERIFIED === 'true';

/** Template de mensagem usado no fluxo de envio do CT-82. */
export const E2E_CATALOG_TEMPLATE_INFORMAL = 'Informal';

/** Tabelas usadas pelos asserts e pela limpeza do CT-82 (via REST). */
export const E2E_CATALOG_SEND_EVENTS_TABLE = 'catalog_send_events';
export const E2E_CATALOG_MESSAGES_TABLE = 'messages';

/** Prefixo do texto de fixture para localizar/limpar o que o teste criou. */
export const E2E_CATALOG_FIXTURE_MARKER = '[E2E catalog]';
