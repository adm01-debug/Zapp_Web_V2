import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DnsResolver,
  fetchPublicHttpUrl,
  isBlockedIpAddress,
  parseApprovedStorageUrl,
  resolvePublicHttpUrl,
} from "../ssrf.ts";

const publicDns: DnsResolver = (_host, type) =>
  Promise.resolve(type === "A" ? ["93.184.216.34"] : []);
const privateDns: DnsResolver = (_host, type) =>
  Promise.resolve(type === "A" ? ["10.0.0.8"] : []);

Deno.test("SSRF guard rejects private, special and credential-bearing URL targets", async () => {
  for (
    const value of [
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://169.254.169.254/",
      "http://[::1]/",
      "http://localhost/",
      "https://user:pass@example.test/",
      "https://example.test:8443/",
    ]
  ) {
    assertEquals(await resolvePublicHttpUrl(value, publicDns), null, value);
  }
  assertEquals(isBlockedIpAddress("100.64.0.1"), true);
  assertEquals(isBlockedIpAddress("198.18.0.1"), true);
  assertEquals(
    await resolvePublicHttpUrl("https://example.test/", privateDns),
    null,
  );
  assertEquals(
    (await resolvePublicHttpUrl("https://example.test/ok", publicDns))
      ?.hostname,
    "example.test",
  );
});

Deno.test("SSRF guard validates every redirect target before fetching it", async () => {
  const seen: string[] = [];
  const result = await fetchPublicHttpUrl("https://example.test/start", {
    resolver: publicDns,
    fetcher: (url) => {
      seen.push(url);
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
      );
    },
  });
  assertEquals(result, null);
  assertEquals(seen, ["https://example.test/start"]);
});

Deno.test("SSRF guard fails closed on a malformed redirect location", async () => {
  const result = await fetchPublicHttpUrl("https://example.test/start", {
    resolver: publicDns,
    fetcher: () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "http://[" },
        }),
      ),
  });
  assertEquals(result, null);
});

Deno.test("SSRF guard aborts a stalled DNS lookup before outbound fetch", async () => {
  const controller = new AbortController();
  let fetchCalls = 0;
  const resultPromise = fetchPublicHttpUrl("https://slow.example.test/", {
    signal: controller.signal,
    resolver: () => new Promise<string[]>(() => {}),
    fetcher: () => {
      fetchCalls++;
      return Promise.resolve(new Response("unexpected"));
    },
  });

  controller.abort();
  assertEquals(await resultPromise, null);
  assertEquals(fetchCalls, 0);
});

Deno.test("SSRF guard permits a bounded public redirect chain", async () => {
  const seen: string[] = [];
  const result = await fetchPublicHttpUrl("https://example.test/start", {
    resolver: publicDns,
    fetcher: (url) => {
      seen.push(url);
      return Promise.resolve(
        url.endsWith("/start")
          ? new Response(null, { status: 302, headers: { location: "/final" } })
          : new Response("ok", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      );
    },
  });
  assertEquals(result?.response.status, 200);
  assertEquals(seen, [
    "https://example.test/start",
    "https://example.test/final",
  ]);
});

Deno.test("approved audio storage URLs require exact project origin and safe paths", () => {
  const projectUrl = "https://tnnnlkbymytvtqngbbqh.supabase.co";
  const allowedBuckets = [
    "whatsapp-media",
    "audio-messages",
    "audio-memes",
  ];

  assertEquals(
    parseApprovedStorageUrl(
      `${projectUrl}/storage/v1/object/sign/audio-messages/2026/voice.ogg?token=x`,
      projectUrl,
      allowedBuckets,
    ),
    { bucket: "audio-messages", path: "2026/voice.ogg" },
  );
  assertEquals(
    parseApprovedStorageUrl(
      `${projectUrl}/storage/v1/object/public/audio-memes/voice-changer/voice.mp3`,
      projectUrl,
      allowedBuckets,
    ),
    { bucket: "audio-memes", path: "voice-changer/voice.mp3" },
  );

  for (
    const value of [
      `https://tnnnlkbymytvtqngbbqh.supabase.co.evil.test/storage/v1/object/sign/audio-messages/voice.ogg`,
      `https://evil.test/?${projectUrl}/storage/v1/object/sign/audio-messages/voice.ogg`,
      `${projectUrl}/storage/v1/object/sign/team-chat-files/voice.ogg`,
      `${projectUrl}/storage/v1/object/sign/audio-messages/%252e%252e/private.ogg`,
    ]
  ) {
    assertEquals(
      parseApprovedStorageUrl(value, projectUrl, allowedBuckets),
      null,
      value,
    );
  }
});
