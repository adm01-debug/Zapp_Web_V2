import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchPreviewViaSecureEgress,
  getSecureEgressConfig,
} from "../secure-egress.ts";

const config = {
  endpoint: "https://preview-egress.example.test/v1/fetch",
  sharedSecret: "0123456789abcdef0123456789abcdef",
};

Deno.test("secure egress signs the exact body and never fetches the user URL", async () => {
  let requestedEndpoint = "";
  let request: RequestInit | undefined;
  const result = await fetchPreviewViaSecureEgress("https://example.test/page", config, {
    now: () => 1_700_000_000_000,
    nonce: () => "nonce-with-at-least-sixteen-bytes",
    fetcher: (input, init) => {
      requestedEndpoint = input;
      request = init;
      return Promise.resolve(new Response(JSON.stringify({
        url: "https://example.test/page",
        status: 200,
        content_type: "text/html; charset=utf-8",
        body_base64: btoa("<title>Preview</title>"),
      }), { status: 200 }));
    },
  });
  assertEquals(requestedEndpoint, config.endpoint);
  assertEquals(request?.method, "POST");
  assertEquals(request?.body, JSON.stringify({ url: "https://example.test/page" }));
  const headers = new Headers(request?.headers);
  assertEquals(headers.get("X-Zapp-Egress-Timestamp"), "1700000000");
  assertEquals(headers.get("X-Zapp-Egress-Nonce"), "nonce-with-at-least-sixteen-bytes");
  assert(headers.get("X-Zapp-Egress-Signature")?.match(/^[a-f0-9]{64}$/));
  assertEquals(await result?.response.text(), "<title>Preview</title>");
});

Deno.test("secure egress fails closed for bad configuration and malformed proxy payloads", async () => {
  let calls = 0;
  const fetcher = () => {
    calls++;
    return Promise.resolve(new Response("unexpected"));
  };
  assertEquals(
    await fetchPreviewViaSecureEgress("https://example.test", {
      endpoint: "http://proxy.example.test/v1/fetch",
      sharedSecret: config.sharedSecret,
    }, { fetcher }),
    null,
  );
  assertEquals(calls, 0);
  assertEquals(
    await fetchPreviewViaSecureEgress("https://example.test", config, {
      fetcher: () => Promise.resolve(new Response(JSON.stringify({
        url: "file:///etc/passwd",
        status: 200,
        content_type: "text/html",
        body_base64: btoa("x"),
      }), { status: 200 })),
    }),
    null,
  );
  for (const malformed of [null, [], { url: "https://example.test/" }]) {
    assertEquals(
      await fetchPreviewViaSecureEgress("https://example.test", config, {
        fetcher: () => Promise.resolve(Response.json(malformed)),
      }),
      null,
    );
  }
  for (const status of [204, 205, 304]) {
    assertEquals(
      await fetchPreviewViaSecureEgress("https://example.test", config, {
        fetcher: () => Promise.resolve(new Response(JSON.stringify({
          url: "https://example.test/",
          status,
          content_type: "text/html",
          body_base64: "",
        }), { status: 200 })),
      }),
      null,
    );
  }
});

Deno.test("secure egress configuration requires HTTPS and a strong shared secret", () => {
  const previousUrl = Deno.env.get("PREVIEW_EGRESS_PROXY_URL");
  const previousSecret = Deno.env.get("PREVIEW_EGRESS_SHARED_SECRET");
  try {
    Deno.env.set("PREVIEW_EGRESS_PROXY_URL", "https://proxy.example.test/v1/fetch");
    Deno.env.set("PREVIEW_EGRESS_SHARED_SECRET", "short");
    assertEquals(getSecureEgressConfig(), null);
  } finally {
    if (previousUrl === undefined) Deno.env.delete("PREVIEW_EGRESS_PROXY_URL");
    else Deno.env.set("PREVIEW_EGRESS_PROXY_URL", previousUrl);
    if (previousSecret === undefined) Deno.env.delete("PREVIEW_EGRESS_SHARED_SECRET");
    else Deno.env.set("PREVIEW_EGRESS_SHARED_SECRET", previousSecret);
  }
});
