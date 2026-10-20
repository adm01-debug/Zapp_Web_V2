// Teste do núcleo de preparação de mídia (bloco D / F40).
//
// Sobe um servidor HTTP EFÊMERO (Deno.serve em porta 0, loopback) que serve
// bytes de fixtures REAIS embutidos em base64 (PNG/PDF/MP3 mínimos) e prova,
// com HTTP de verdade, cada bloqueio do contrato:
//   - arquivo expirado (404)           -> not_found / media_pending
//   - arquivo maior que o limite       -> too_large
//   - magic bytes divergentes da ext. -> tipo REAL, não o sufixo
//   - documento sem fileName           -> missing_file_name
//   - signed URL do Storage vencida    -> signed_url_expired (ou re-assinada)
//
// Run with: deno test --config scripts/ci/deno.json --allow-net supabase/functions/_shared/messaging/__tests__/media.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  decodeSignedUrlExpiryMs,
  detectMediaKind,
  prepareMedia,
} from "../media.ts";

// ─── Fixtures reais (base64) ─────────────────────────────────────
// PNG 1x1 válido (assinatura 89 50 4e 47 0d 0a 1a 0a).
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// PDF mínimo real (começa em "%PDF-1.4", termina em "%%EOF").
const PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFtdIC9Db3VudCAwID4+CmVuZG9iagp0cmFpbGVyCjw8IC9Sb290IDEgMCBSID4+CiUlRU9GCg==";
// Um frame MPEG-1 Layer III (0xFF 0xFB 0x90 0x64) com padding até 417 bytes.
const MP3_B64 =
  "//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const PNG = fromBase64(PNG_B64); // 70 bytes
const PDF = fromBase64(PDF_B64); // 142 bytes
const MP3 = fromBase64(MP3_B64); // 417 bytes
const LARGE = new Uint8Array(4096); // zerado, sem assinatura
const RANDOM = new Uint8Array([0x99, 0x98, 0x97, 0x96, 0x95]); // nenhuma assinatura

interface Route {
  status?: number;
  body?: Uint8Array;
  contentType?: string;
}

// content-type DECLARADO de propósito divergente em /lie.txt e /documento.jpg.
const ROUTES: Record<string, Route> = {
  "/ok.png": { body: PNG, contentType: "image/png" },
  "/ok.pdf": { body: PDF, contentType: "application/pdf" },
  "/ok.mp3": { body: MP3, contentType: "audio/mpeg" },
  "/lie.txt": { body: PNG, contentType: "text/plain" }, // extensão + content-type mentem
  "/documento.jpg": { body: PDF, contentType: "image/jpeg" }, // extensão mente: é PDF
  "/large.bin": { body: LARGE, contentType: "application/octet-stream" },
  "/rand.bin": { body: RANDOM, contentType: "application/octet-stream" },
  "/expired.bin": { status: 404 },
  // URL de storage assinada do próprio "projeto" (origem = este servidor).
  "/storage/v1/object/sign/whatsapp-media/doc.pdf": { body: PDF, contentType: "application/pdf" },
};

function handler(request: Request): Response {
  const path = new URL(request.url).pathname;
  const route = ROUTES[path];
  const status = route?.status ?? (route ? 200 : 404);
  if (status >= 400) return new Response(null, { status });

  const body = route?.body ?? new Uint8Array(0);
  const headers = {
    "content-type": route?.contentType ?? "application/octet-stream",
    "content-length": String(body.length),
  };
  if (request.method === "HEAD") return new Response(null, { status, headers });
  return new Response(body.buffer as ArrayBuffer, { status, headers });
}

const server = Deno.serve(
  { port: 0, hostname: "127.0.0.1", onListen: () => {} },
  handler,
);
const { port } = server.addr as Deno.NetAddr;
const BASE = `http://127.0.0.1:${port}`;

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** JWT de signed URL do Storage (assinatura não é validada pelo nosso leitor). */
function makeStorageToken(expSeconds: number): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ url: "whatsapp-media/doc.pdf", exp: expSeconds })}.assinatura`;
}

Deno.test("prepareMedia (F40) — servidor HTTP efêmero", async (t) => {
  try {
    // ── Happy paths: o tipo REAL vem dos magic bytes ─────────────
    await t.step("PNG acessível e dentro do limite é aceito como imagem", async () => {
      const result = await prepareMedia(`${BASE}/ok.png`);
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.kind, "image");
      assertEquals(result.media.mime, "image/png");
      assertEquals(result.media.sizeBytes, PNG.length);
      assertEquals(result.media.signedUrl, `${BASE}/ok.png`);
    });

    await t.step("PDF com fileName é aceito como documento", async () => {
      const result = await prepareMedia(`${BASE}/ok.pdf`, { fileName: "contrato.pdf" });
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.kind, "document");
      assertEquals(result.media.mime, "application/pdf");
      assertEquals(result.media.sizeBytes, PDF.length);
      assertEquals(result.media.fileName, "contrato.pdf");
    });

    await t.step("MP3 é aceito como áudio", async () => {
      const result = await prepareMedia(`${BASE}/ok.mp3`);
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.kind, "audio");
      assertEquals(result.media.mime, "audio/mpeg");
    });

    // ── Bloqueio 1: arquivo expirado (404) ───────────────────────
    await t.step("arquivo expirado (404) bloqueia com not_found / media_pending", async () => {
      const result = await prepareMedia(`${BASE}/expired.bin`);
      assert(!result.ok, "404 deveria reprovar");
      assertEquals(result.reason, "not_found");
      assertEquals(result.eligibility, "media_pending");
    });

    // ── Bloqueio 2: maior que o limite ───────────────────────────
    await t.step("arquivo maior que o limite bloqueia com too_large", async () => {
      const result = await prepareMedia(`${BASE}/large.bin`, { maxBytes: 1024 });
      assert(!result.ok, "4096 > 1024 deveria reprovar");
      assertEquals(result.reason, "too_large");
      assertEquals(result.eligibility, "media_pending");
    });

    await t.step("limite vale também para mídia pequena quando apertado", async () => {
      const result = await prepareMedia(`${BASE}/ok.png`, { maxBytes: 10 });
      assert(!result.ok, "70 > 10 deveria reprovar");
      assertEquals(result.reason, "too_large");
    });

    // ── Bloqueio 3: magic bytes divergentes da extensão ──────────
    await t.step("extensão e content-type mentem: PNG em .txt vira imagem", async () => {
      const result = await prepareMedia(`${BASE}/lie.txt`);
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.kind, "image");
      assertEquals(result.media.mime, "image/png");
    });

    await t.step("PDF servido em .jpg vira documento (não imagem)", async () => {
      const result = await prepareMedia(`${BASE}/documento.jpg`, { fileName: "doc.pdf" });
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.kind, "document");
      assertEquals(result.media.mime, "application/pdf");
    });

    await t.step("PDF em .jpg sem fileName é barrado (o tipo real manda)", async () => {
      const result = await prepareMedia(`${BASE}/documento.jpg`);
      assert(!result.ok, "documento sem nome deveria reprovar");
      assertEquals(result.reason, "missing_file_name");
    });

    // ── Bloqueio 4: documento sem fileName ───────────────────────
    await t.step("documento sem fileName bloqueia com missing_file_name", async () => {
      const result = await prepareMedia(`${BASE}/ok.pdf`);
      assert(!result.ok, "PDF sem fileName deveria reprovar");
      assertEquals(result.reason, "missing_file_name");
      assertEquals(result.eligibility, "media_pending");
    });

    // ── Tipo desconhecido ────────────────────────────────────────
    await t.step("bytes sem assinatura conhecida bloqueiam com unsupported_type", async () => {
      const result = await prepareMedia(`${BASE}/rand.bin`);
      assert(!result.ok, "bytes aleatórios deveriam reprovar");
      assertEquals(result.reason, "unsupported_type");
    });

    // ── Signed URL: TTL amarrado ao envio ────────────────────────
    const now = Date.now();
    const expiredToken = makeStorageToken(Math.floor((now - 60_000) / 1000));
    const storageUrl = `${BASE}/storage/v1/object/sign/whatsapp-media/doc.pdf?token=${expiredToken}`;

    await t.step("signed URL vencida sem assinador bloqueia com signed_url_expired", async () => {
      const result = await prepareMedia(storageUrl, {
        fileName: "doc.pdf",
        now,
        ttlSeconds: 300,
        storageProjectUrl: BASE,
        allowedBuckets: ["whatsapp-media"],
      });
      assert(!result.ok, "signed URL vencida deveria reprovar");
      assertEquals(result.reason, "signed_url_expired");
    });

    await t.step("signed URL vencida é re-assinada com TTL do envio", async () => {
      const signed: Array<{ bucket: string; path: string; expiresIn: number }> = [];
      const result = await prepareMedia(storageUrl, {
        fileName: "doc.pdf",
        now,
        ttlSeconds: 300,
        storageProjectUrl: BASE,
        allowedBuckets: ["whatsapp-media"],
        sign: (request) => {
          signed.push(request);
          return Promise.resolve(`${BASE}/ok.pdf`);
        },
      });
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.kind, "document");
      assertEquals(result.media.fileName, "doc.pdf");
      assertEquals(result.media.signedUrl, `${BASE}/ok.pdf`);
      assertEquals(signed, [{ bucket: "whatsapp-media", path: "doc.pdf", expiresIn: 300 }]);
    });

    await t.step("signed URL ainda válida cobre a janela e passa direto", async () => {
      const validToken = makeStorageToken(Math.floor((now + 3_600_000) / 1000));
      const result = await prepareMedia(
        `${BASE}/storage/v1/object/sign/whatsapp-media/doc.pdf?token=${validToken}`,
        {
          fileName: "doc.pdf",
          now,
          ttlSeconds: 300,
          storageProjectUrl: BASE,
          allowedBuckets: ["whatsapp-media"],
        },
      );
      assert(result.ok, JSON.stringify(result));
      assertEquals(result.media.signedUrl, `${BASE}/storage/v1/object/sign/whatsapp-media/doc.pdf?token=${validToken}`);
    });

    // ── Detector puro (unidade, sem HTTP) ────────────────────────
    await t.step("detectMediaKind reconhece as assinaturas mínimas", () => {
      assertEquals(detectMediaKind(PNG), { kind: "image", mime: "image/png" });
      assertEquals(detectMediaKind(PDF), { kind: "document", mime: "application/pdf" });
      assertEquals(detectMediaKind(MP3), { kind: "audio", mime: "audio/mpeg" });
      assertEquals(detectMediaKind(RANDOM), null);
    });

    await t.step("decodeSignedUrlExpiryMs lê o exp do token (e devolve null em lixo)", () => {
      const token = makeStorageToken(1_900_000_000);
      assertEquals(decodeSignedUrlExpiryMs(token), 1_900_000_000 * 1000);
      assertEquals(decodeSignedUrlExpiryMs("nao-e-jwt"), null);
    });
  } finally {
    await server.shutdown();
  }
});
