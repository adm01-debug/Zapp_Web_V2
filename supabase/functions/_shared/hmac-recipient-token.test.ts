import { createRecipientTokenCache, hmacTokenForRecipient } from "./hmac-validation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Ponto 3 da recusa (refazer 2): o token HMAC custa 1x por recipient —
// calculado uma vez e reutilizado em todos os links da mensagem.
Deno.test("createRecipientTokenCache calcula 1 HMAC por recipient e reutiliza em todos os links", async () => {
  let hmacCalls = 0;
  const countingHash = (id: string, secret: string) => {
    hmacCalls++;
    return hmacTokenForRecipient(id, secret);
  };
  const rFor = createRecipientTokenCache("segredo-de-teste", countingHash);
  // 1 recipient x 5 links (tracking + rotulos + repeticao) e outro recipient.
  const a = [await rFor("rec-A"), await rFor("rec-A"), await rFor("rec-A"), await rFor("rec-A"), await rFor("rec-A")];
  const b = await rFor("rec-B");
  assert(hmacCalls === 2, "HMAC deveria rodar 1x por recipient (2), rodou " + hmacCalls + "x");
  assert(a.every((t) => t === a[0]), "token do mesmo recipient variou entre links");
  assert(a[0] !== b, "recipients diferentes geraram o mesmo token");
  assert(
    a[0] === await hmacTokenForRecipient("rec-A", "segredo-de-teste"),
    "token não confere com o HMAC real",
  );
});
