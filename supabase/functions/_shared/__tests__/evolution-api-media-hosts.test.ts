// t_76478b12 — a URL de mídia que a Edge ENTREGA ao provedor (`p_media_url`) só
// pode sair para host conhecido. Antes, `resolvePrivateBucketUrl` devolvia
// qualquer https como estava e o provedor era mandado buscar loopback,
// link-local ou host arbitrário (SSRF-por-procurador).
import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONFIGURED_MEDIA_HOST_SUFFIXES,
  resolveAllowedMediaEgressUrl,
  resolvePrivateBucketUrl,
} from "../evolution-api-proxy.ts";
import type { MediaEgressPolicy } from "../media-egress.ts";

const POLICY: MediaEgressPolicy = {
  trustedOrigins: ["https://proj.supabase.co", "https://evo.local:8080"],
  // `CONFIGURED_MEDIA_HOST_SUFFIXES` entra aqui como a política de envio faz.
  hostSuffixes: ["whatsapp.net", ...CONFIGURED_MEDIA_HOST_SUFFIXES],
};

function signerFor(signedUrl: string) {
  return {
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: (_path: string) =>
          Promise.resolve({ data: { signedUrl }, error: null }),
      }),
    },
  };
}

Deno.test("media de envio: rejeita host arbitrário (loopback, link-local, IP literal)", () => {
  for (
    const raw of [
      "http://127.0.0.1:9999/metadata",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/internal",
      "http://[::1]/x",
      "https://evil.example.com/x.jpg",
      "https://imagedelivery.net.evil.example.com/x.jpg",
      "https://93.184.216.34/x.jpg",
      "http://mmg.whatsapp.net/x", // CDN do WhatsApp exige https
      "https://user:pass@mmg.whatsapp.net/x.jpg",
      "file:///etc/passwd",
      "nao-e-url",
    ]
  ) {
    assertEquals(resolveAllowedMediaEgressUrl(raw, POLICY), null, raw);
  }
});

Deno.test("media de envio: aceita Storage do projeto e provedores configurados", () => {
  for (
    const raw of [
      "https://proj.supabase.co/storage/v1/object/sign/audio-messages/c/1.webm?token=t",
      "https://proj.supabase.co/storage/v1/object/public/whatsapp-media/c/a.webm",
      "https://imagedelivery.net/acc/id/public",
      "https://mmg.whatsapp.net/v/t62/enc",
      "https://evo.local:8080/files/media.bin",
    ]
  ) {
    assert(resolveAllowedMediaEgressUrl(raw, POLICY) !== null, raw);
  }
});

Deno.test("resolvePrivateBucketUrl: objeto privado do Storage segue assinado", async () => {
  const signed = "https://proj.supabase.co/storage/v1/object/sign/whatsapp-media/c/a.webm?token=abc";
  const out = await resolvePrivateBucketUrl(
    signerFor(signed),
    "https://proj.supabase.co/storage/v1/object/public/whatsapp-media/c/a.webm",
    undefined,
    undefined,
    POLICY,
  );
  assertEquals(out, signed);
});

Deno.test("resolvePrivateBucketUrl: passe-livre só para provedor conhecido", async () => {
  const signer = signerFor("https://proj.supabase.co/storage/v1/object/sign/x");
  const image = "https://imagedelivery.net/acc/id/public";
  assertEquals(await resolvePrivateBucketUrl(signer, image, undefined, undefined, POLICY), image);

  await assertRejects(
    () => resolvePrivateBucketUrl(signer, "http://169.254.169.254/latest/meta-data", undefined, undefined, POLICY),
    Error,
    "media_url de host não permitido",
  );
  await assertRejects(
    () => resolvePrivateBucketUrl(signer, "https://evil.example.com/x.jpg", undefined, undefined, POLICY),
    Error,
    "media_url de host não permitido",
  );
});
