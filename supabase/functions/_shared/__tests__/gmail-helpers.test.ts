import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { decodeBase64Url, extractAttachments, extractBody, parseGmailAddressList, type GmailMessage } from "../gmail-helpers.ts";

function base64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.test('parseGmailAddressList preserva nome Unicode com virgula entre aspas', () => {
  assertEquals(parseGmailAddressList('"Silva, João" <Joao+vip@example.com>, maria@example.com'), [
    { name: 'Silva, João', address: 'joao+vip@example.com' },
    { name: '', address: 'maria@example.com' },
  ]);
});

Deno.test('decodeBase64Url decodifica UTF-8 sem perder acentos', () => {
  assertEquals(decodeBase64Url(base64Url('Cotação — válida')), 'Cotação — válida');
});

Deno.test('extractBody e extractAttachments percorrem MIME aninhado', () => {
  const payload: GmailMessage['payload'] = {
    mimeType: 'multipart/mixed', headers: [],
    parts: [{
      mimeType: 'multipart/alternative', body: { size: 0 }, parts: [
        { mimeType: 'text/plain', body: { size: 5, data: base64Url('texto') } },
        { mimeType: 'text/html', body: { size: 12, data: base64Url('<b>texto</b>') } },
      ],
    }, {
      mimeType: 'application/pdf', filename: 'arquivo.pdf', body: { size: 123, attachmentId: 'att-1' },
    }],
  };
  assertEquals(extractBody(payload), { text: 'texto', html: '<b>texto</b>' });
  assertEquals(extractAttachments(payload), [{ filename: 'arquivo.pdf', mimeType: 'application/pdf', attachmentId: 'att-1', size: 123 }]);
});
