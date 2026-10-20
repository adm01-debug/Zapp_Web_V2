import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isBlockedIpAddress,
  parseApprovedStorageUrl,
} from "../ssrf.ts";

Deno.test("SSRF primitives classify private and special addresses", () => {
  for (
    const value of [
      "127.0.0.1",
      "169.254.169.254",
      "::1",
      "fc00::1",
      "100.64.0.1",
      "198.18.0.1",
    ]
  ) {
    assertEquals(isBlockedIpAddress(value), true, value);
  }
  assertEquals(isBlockedIpAddress("93.184.216.34"), false);
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
