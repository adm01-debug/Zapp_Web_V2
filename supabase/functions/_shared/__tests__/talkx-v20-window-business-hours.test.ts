import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryWindowStatus, parseBusinessHours } from "../talkx-window.ts";
import { AUTO_RESUME_REASONS, selectResumableCampaigns } from "../talkx-resume-policy.ts";

// terça-feira 2026-09-29 14:00 UTC — dia útil, meio do horário comercial.
const TUE_14 = new Date("2026-09-29T14:00:00Z");

Deno.test("V20: mudar business_hours muda o veredito allowed", () => {
  const campaign = { business_hours_only: true, schedule_timezone: "UTC" } as const;

  // 14h UTC cai dentro de 08:00–18:00 → allowed
  assertEquals(deliveryWindowStatus(campaign, TUE_14, { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] }).allowed, true);

  // business_hours encurtado para 15:00–17:00 → 14h fica fora → blocked
  assertEquals(deliveryWindowStatus(campaign, TUE_14, { start: "15:00", end: "17:00", days: [1, 2, 3, 4, 5] }).allowed, false);

  // dia da semana restrito (só sáb/dom) → terça fica fora → blocked
  assertEquals(deliveryWindowStatus(campaign, TUE_14, { start: "00:00", end: "23:59", days: [0, 6] }).allowed, false);
});

Deno.test("V20: parseBusinessHours extrai o JSON de talkx_settings", () => {
  const parsed = parseBusinessHours('{"start":"09:00","end":"17:30","tz":"America/Sao_Paulo","days":[1,2,3,4,5]}');
  assertEquals(parsed?.start, "09:00");
  assertEquals(parsed?.end, "17:30");
  assertEquals(parseBusinessHours("não é json"), null);
  assertEquals(parseBusinessHours(""), null);
});

Deno.test("V20: daily_limit é retomável mas só no dia seguinte", () => {
  assertEquals((AUTO_RESUME_REASONS as readonly string[]).includes("daily_limit"), true);

  const campaign = {
    id: "c1",
    name: "Campanha",
    pause_reason: "daily_limit",
    whatsapp_connection_id: "conn-1",
    paused_at: new Date("2026-09-29T10:00:00Z").toISOString(), // hoje (mesmo dia)
    business_hours_only: false,
  };

  // mesmo dia → não retoma
  const sameDay = selectResumableCampaigns([campaign], () => "connected", new Date("2026-09-29T14:00:00Z"))[0];
  assertEquals(sameDay.resume, false);

  // dia seguinte → retoma (janela aberta)
  const nextDay = selectResumableCampaigns([campaign], () => "connected", new Date("2026-09-30T14:00:00Z"))[0];
  assertEquals(nextDay.resume, true);
});
