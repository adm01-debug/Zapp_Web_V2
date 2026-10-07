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

Deno.test("V20/#121A: parseBusinessHours aceita o OBJETO JSONB real e preserva start/end/tz/days", () => {
  // como o banco devolve talkx_settings.business_hours (coluna jsonb)
  const doBanco = { start: "09:00", end: "17:30", tz: "America/Sao_Paulo", days: [1, 2, 3, 4, 5] };
  const parsed = parseBusinessHours(doBanco);
  assertEquals(parsed?.start, "09:00");
  assertEquals(parsed?.end, "17:30");
  assertEquals(parsed?.tz, "America/Sao_Paulo");
  assertEquals(parsed?.days, [1, 2, 3, 4, 5]);
  assertEquals(parsed?.invalid, undefined);

  // string JSON segue aceita como compatibilidade (formato antigo)
  const viaString = parseBusinessHours('{"start":"09:00","end":"17:30","tz":"America/Sao_Paulo","days":[1,2,3,4,5]}');
  assertEquals(viaString?.start, "09:00");
  assertEquals(viaString?.end, "17:30");
  assertEquals(viaString?.tz, "America/Sao_Paulo");
  assertEquals(viaString?.days, [1, 2, 3, 4, 5]);

  // ausência da configuração não é erro: quem decide aplica o default
  assertEquals(parseBusinessHours(undefined), null);
  assertEquals(parseBusinessHours(null), null);
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

// ── #121A: JSONB presente, fuso próprio e default ────────────────────────────

const COMERCIAL = { business_hours_only: true, schedule_timezone: "UTC" } as const;

Deno.test("#121A: objeto presente mas malformado NÃO vira o default — fecha a janela", () => {
  const malformados: unknown[] = [
    {}, // presente e vazio
    { start: "08:00" }, // faltando end/days
    { start: "25:00", end: "18:00", days: [1, 2, 3, 4, 5] }, // hora inválida
    { start: "08:00", end: "18:60", days: [1, 2, 3, 4, 5] }, // minuto inválido
    { start: "08:00", end: "18:00", days: [] }, // nenhum dia
    { start: "08:00", end: "18:00", days: [7] }, // 7 não é dia da semana
    { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5], tz: "Marte/Olympus" },
    "não é json",
    [1, 2, 3],
    42,
  ];
  for (const mau of malformados) {
    const parsed = parseBusinessHours(mau);
    assertEquals(
      parsed === null,
      false,
      `presente e inválido não pode ser tratado como ausente: ${JSON.stringify(mau)}`,
    );
    assertEquals(parsed?.invalid, true, `deveria vir marcado como inválido: ${JSON.stringify(mau)}`);
    const status = deliveryWindowStatus(COMERCIAL, TUE_14, parsed);
    assertEquals(
      status.allowed,
      false,
      `presente e inválido precisa FECHAR a janela (nunca cair no default): ${JSON.stringify(mau)}`,
    );
  }
});

Deno.test("#121A: ausência mantém o default 08:00–18:00, seg–sex, America/Sao_Paulo", () => {
  // terça 14:00 UTC = 11:00 em São Paulo → dentro do default
  assertEquals(deliveryWindowStatus(COMERCIAL, TUE_14, parseBusinessHours(undefined)).allowed, true);
  // sábado 14:00 UTC = 11:00 em SP → fora (o default é seg–sex)
  assertEquals(deliveryWindowStatus(COMERCIAL, new Date("2026-10-03T14:00:00Z"), null).allowed, false);
  // terça 22:00 em SP → fora de 08:00–18:00
  assertEquals(deliveryWindowStatus(COMERCIAL, new Date("2026-09-30T01:00:00Z"), null).allowed, false);
});

Deno.test("#121A: business_hours.tz governa o horário comercial; send_window_* segue a campanha", () => {
  // terça 18:00 UTC = 15:00 em São Paulo
  const terca18z = new Date("2026-09-29T18:00:00Z");
  const bhSp = { start: "15:00", end: "17:00", tz: "America/Sao_Paulo", days: [1, 2, 3, 4, 5] };
  const bhUtc = { start: "15:00", end: "17:00", tz: "UTC", days: [1, 2, 3, 4, 5] };

  // campanha em UTC, business_hours em São Paulo → quem manda é o tz do business_hours
  assertEquals(
    deliveryWindowStatus({ business_hours_only: true, schedule_timezone: "UTC" }, terca18z, bhSp).allowed,
    true,
  );
  // mesma campanha com business_hours em UTC → 18:00 está fora de 15:00–17:00
  assertEquals(
    deliveryWindowStatus({ business_hours_only: true, schedule_timezone: "UTC" }, terca18z, bhUtc).allowed,
    false,
  );
  // campanha noutro fuso não muda o veredito do business_hours
  assertEquals(
    deliveryWindowStatus({ business_hours_only: true, schedule_timezone: "America/New_York" }, terca18z, bhSp).allowed,
    true,
  );

  // send_window_* continua sendo avaliado no fuso da CAMPANHA
  assertEquals(
    deliveryWindowStatus(
      { business_hours_only: false, schedule_timezone: "UTC", send_window_start: "15:00", send_window_end: "17:00" },
      terca18z,
      bhSp,
    ).allowed,
    false,
  );
  assertEquals(
    deliveryWindowStatus(
      {
        business_hours_only: false,
        schedule_timezone: "America/Sao_Paulo",
        send_window_start: "15:00",
        send_window_end: "17:00",
      },
      terca18z,
      bhSp,
    ).allowed,
    true,
  );
});
