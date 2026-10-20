import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { buildGmailMimeMessage, encodeBase64Url } from "../gmail-mime.ts";

Deno.test("Gmail MIME preserva headers RFC da mensagem historica", () => {
  const mime = buildGmailMimeMessage({
    from: "agent@promobrindes.com.br",
    to: ["customer@example.com"],
    subject: "Re: Cotação",
    textBody: "Resposta",
    inReplyTo: "<original@example.com>",
    references: "<older@example.com> <original@example.com>",
  });

  assert(mime.includes("In-Reply-To: <original@example.com>\r\n"));
  assert(mime.includes("References: <older@example.com> <original@example.com>\r\n"));
  assertMatch(mime, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=/);
});

Deno.test("Gmail MIME inclui texto, HTML e multiplos anexos sem alterar os bytes base64", () => {
  const mime = buildGmailMimeMessage({
    from: "agent@promobrindes.com.br",
    to: ["customer@example.com"],
    cc: ["team@example.com"],
    subject: "Arquivos",
    textBody: "Versão em texto",
    htmlBody: "<strong>Versão HTML</strong>",
    attachments: [
      { filename: "a.txt", mimeType: "text/plain", content: "AAEC/w==" },
      { filename: "b.pdf", mimeType: "application/pdf", content: "JVBERi0=" },
    ],
  });

  assert(mime.includes("Content-Type: multipart/mixed"));
  assert(mime.includes("Content-Type: multipart/alternative"));
  assert(mime.includes('filename="a.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\nAAEC/w=='));
  assert(mime.includes('filename="b.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0='));
});

Deno.test("encodeBase64Url remove padding e usa alfabeto URL-safe", () => {
  assertEquals(encodeBase64Url("ÿ?"), "w78_");
});
