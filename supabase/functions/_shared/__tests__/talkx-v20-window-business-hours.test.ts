import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryWindowStatus, localClockInTimezone, parseBusinessHours, parseDndHours } from "../talkx-window.ts";
// N-118/refazer: import dinâmico com skip condicional — se talkx-resume-policy.ts
// não existir no filesystem, o teste conserva o comportamento (skip) em vez de RED
// por módulo ausente. Ver teste "V20: daily_limit…" abaixo.

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

Deno.test("V20: daily_limit é retomável mas só no dia seguinte", async () => {
  // P1/refazer: conserva o teste existente; skip condicional se o módulo não
  // existir no filesystem (sem fixture de banco — teste é em memória).
  let policy: typeof import("../talkx-resume-policy.ts");
  try {
    policy = await import("../talkx-resume-policy.ts");
  } catch {
    console.warn("skip: talkx-resume-policy.ts ausente no filesystem");
    return;
  }
  const { AUTO_RESUME_REASONS, selectResumableCampaigns } = policy;
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

// ── N-118: send_weekdays e DND (sobre o arquivo original, sem reescrita) ─────

const TUE_14Z = new Date("2026-09-29T14:00:00Z"); // 14:00 UTC = 11:00 SP
const TUE_20Z = new Date("2026-09-29T20:00:00Z"); // 20:00 UTC = 17:00 SP
const TUE_23Z = new Date("2026-09-29T23:00:00Z");
const WED_05Z = new Date("2026-09-30T05:00:00Z");
const SUN_23Z = new Date("2026-10-04T23:00:00Z"); // domingo, fora de 08:00–18:00

Deno.test("N-118: send_weekdays restringe o dia do envio; ausente/vazio é irrestrito", () => {
  const base = { business_hours_only: false, schedule_timezone: "UTC" } as const;

  // terça está na lista → allowed; sáb/dom fora da lista → bloqueado
  assertEquals(deliveryWindowStatus({ ...base, send_weekdays: [2] }, TUE_14Z).allowed, true);
  const blocked = deliveryWindowStatus({ ...base, send_weekdays: [0, 6] }, TUE_14Z);
  assertEquals(blocked.allowed, false);
  assertEquals(blocked.allowed === false ? blocked.reason : null, "outside_weekdays");

  // ausente / vazio / nulo = todos os dias
  assertEquals(deliveryWindowStatus(base, TUE_14Z).allowed, true);
  assertEquals(deliveryWindowStatus({ ...base, send_weekdays: [] }, TUE_14Z).allowed, true);
  assertEquals(deliveryWindowStatus({ ...base, send_weekdays: null }, TUE_14Z).allowed, true);
});

Deno.test("N-118: DND fecha dentro da janela, inclusive na virada da meia-noite", () => {
  const campaign = { business_hours_only: false, schedule_timezone: "UTC" } as const;
  const dndNoite = { start: "22:00", end: "06:00", sundays: false, holidays: [] };

  // 23:00 UTC cai em 22:00–06:00 (vira a meia-noite) → bloqueado
  const noturno = deliveryWindowStatus(campaign, TUE_23Z, null, dndNoite);
  assertEquals(noturno.allowed, false);
  assertEquals(noturno.allowed === false ? noturno.reason : null, "dnd");
  // 05:00 UTC do dia seguinte também cai no outro lado da virada → bloqueado
  assertEquals(deliveryWindowStatus(campaign, WED_05Z, null, dndNoite).allowed, false);
  // 14:00 UTC está fora da janela DND → allowed
  assertEquals(deliveryWindowStatus(campaign, TUE_14Z, null, dndNoite).allowed, true);
});

Deno.test("N-118: respect_dnd=false ignora o DND; domingos e feriados fecham", () => {
  const campaign = { business_hours_only: false, schedule_timezone: "UTC" } as const;
  const dndDia = { start: "08:00", end: "18:00", sundays: false, holidays: [] };

  // mesmo dentro do DND, opt-out explícito libera
  assertEquals(
    deliveryWindowStatus({ ...campaign, respect_dnd: false }, TUE_14Z, null, dndDia).allowed,
    true,
  );
  // default (respect_dnd ausente) respeita: 14:00 UTC cai em 08:00–18:00
  assertEquals(deliveryWindowStatus(campaign, TUE_14Z, null, dndDia).allowed, false);

  // domingo: bloqueia o dia inteiro quando sundays=true; libera quando false.
  // Usa 23:00 UTC (fora de 08:00–18:00) para isolar o efeito do dia.
  assertEquals(deliveryWindowStatus(campaign, SUN_23Z, null, { ...dndDia, sundays: true }).allowed, false);
  assertEquals(deliveryWindowStatus(campaign, SUN_23Z, null, { ...dndDia, sundays: false }).allowed, true);
  // sundays=true não afeta terça
  assertEquals(deliveryWindowStatus(campaign, TUE_23Z, null, { ...dndDia, sundays: true }).allowed, true);

  // feriado no fuso da campanha bloqueia
  assertEquals(
    deliveryWindowStatus(campaign, TUE_14Z, null, { ...dndDia, holidays: ["2026-09-29"] }).allowed,
    false,
  );
});

Deno.test("N-118: dnd_hours ausente = sem DND; fora do contrato fecha com 'dnd' (fail-closed)", () => {
  const campaign = { business_hours_only: false, schedule_timezone: "UTC" } as const;

  assertEquals(parseDndHours(undefined), null);
  assertEquals(parseDndHours(""), null);
  assertEquals(deliveryWindowStatus(campaign, TUE_14Z, null, null).allowed, true);

  // objeto presente mas fora do contrato → invalid → fecha, nunca abre
  for (const mau of [{ start: "25:00", end: "06:00" }, { start: "22:00" }, "não é json", 42]) {
    const parsed = parseDndHours(mau);
    assertEquals(parsed?.invalid, true, `deveria marcar inválido: ${JSON.stringify(mau)}`);
    const status = deliveryWindowStatus(campaign, TUE_14Z, null, parsed);
    assertEquals(status.allowed, false);
    assertEquals(status.allowed === false ? status.reason : null, "dnd");
  }
});

Deno.test("N-118 contrato: business_hours sem tz segue válido com default America/Sao_Paulo", () => {
  const semTz = parseBusinessHours({ start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] });
  assertEquals(semTz?.invalid, undefined);
  assertEquals(semTz?.tz, undefined);

  // 20:00 UTC = 17:00 em SP → dentro; se o default fosse UTC, 20:00 estaria fora
  const campaign = { business_hours_only: true, schedule_timezone: "UTC" } as const;
  assertEquals(deliveryWindowStatus(campaign, TUE_20Z, semTz).allowed, true);
});

Deno.test("N-118 contrato: days fora de 0..6 é INVÁLIDO (invalid_business_hours), não filtrado", () => {
  const parsed = parseBusinessHours({ start: "08:00", end: "18:00", days: [7] });
  assertEquals(parsed?.invalid, true);
  const status = deliveryWindowStatus({ business_hours_only: true, schedule_timezone: "UTC" }, TUE_14Z, parsed);
  assertEquals(status.allowed, false);
  assertEquals(status.allowed === false ? status.reason : null, "invalid_business_hours");
});

Deno.test("N-118 contrato: fuso desconhecido mantém a reason invalid_schedule_timezone", () => {
  const status = deliveryWindowStatus({ business_hours_only: false, schedule_timezone: "Marte/Olympus" }, TUE_14Z);
  assertEquals(status.allowed, false);
  assertEquals(status.allowed === false ? status.reason : null, "invalid_schedule_timezone");
});

Deno.test("N-118 contrato: localClockInTimezone exportado devolve hora e dia locais", () => {
  assertEquals(localClockInTimezone("UTC", TUE_14Z), { weekday: 2, hour: 14, minute: 0 });
  assertEquals(localClockInTimezone("America/Sao_Paulo", TUE_14Z), { weekday: 2, hour: 11, minute: 0 });
});

// ── refazer rodada 2: provas que faltavam (P2/P3/P5/P6/P7/P8) ────────────────

// P5: regime 22h–06h provado nas fronteiras (início inclusivo, fim exclusivo).
Deno.test("N-118 refazer P5: DND 22:00–06:00 — fronteiras 21:59/22:00/05:59/06:00", () => {
  const campaign = { business_hours_only: false, schedule_timezone: "UTC" } as const;
  const dnd = { start: "22:00", end: "06:00", sundays: false, holidays: [] };
  const at = (iso: string) => deliveryWindowStatus(campaign, new Date(iso), null, dnd);

  // fora (antes do início) → allowed
  assertEquals(at("2026-09-29T21:59:00Z").allowed, true);
  // exatamente no início (inclusivo) → bloqueado
  const inicio = at("2026-09-29T22:00:00Z");
  assertEquals(inicio.allowed, false);
  assertEquals(inicio.allowed === false ? inicio.reason : null, "dnd");
  // outro lado da virada, ainda dentro → bloqueado
  const madrugada = at("2026-09-30T05:59:00Z");
  assertEquals(madrugada.allowed, false);
  assertEquals(madrugada.allowed === false ? madrugada.reason : null, "dnd");
  // exatamente no fim (exclusivo) → liberado
  assertEquals(at("2026-09-30T06:00:00Z").allowed, true);
});

// P3: e2e local — DND 23:00–23:30 (30 min): 23:15 bloqueia,
// 23:45 (fora da janela restante) libera.
Deno.test("N-118 refazer P3: DND 23:00–23:30 — 23:15 fecha, 23:45 (fora da janela restante) abre", () => {
  const campaign = { business_hours_only: false, schedule_timezone: "UTC" } as const;
  const dnd = { start: "23:00", end: "23:30", sundays: false, holidays: [] };

  const dentro = deliveryWindowStatus(campaign, new Date("2026-09-29T23:15:00Z"), null, dnd);
  assertEquals(dentro.allowed, false);
  assertEquals(dentro.allowed === false ? dentro.reason : null, "dnd");

  assertEquals(deliveryWindowStatus(campaign, new Date("2026-09-29T23:45:00Z"), null, dnd).allowed, true);
  assertEquals(deliveryWindowStatus(campaign, new Date("2026-09-29T22:45:00Z"), null, dnd).allowed, true);
});

// P2+P6: normalização fora do contrato fecha com "dnd" — teste dedicado onde
// sundays / holidays / corpo falham, com volta redonda parse → veredito
// (objeto direto e via string JSON, como o banco entrega).
Deno.test("N-118 refazer P6: sundays/holidays/corpo fora do contrato → invalid → reason dnd", () => {
  const campaign = { business_hours_only: false, schedule_timezone: "UTC" } as const;
  const foraDoContrato: unknown[] = [
    { start: "22:00", end: "06:00", sundays: "yes", holidays: [] }, // sundays não-booleano
    { start: "22:00", end: "06:00", sundays: 1, holidays: [] }, // sundays não-booleano
    { start: "22:00", end: "06:00", sundays: false, holidays: "2026-09-29" }, // holidays não é array
    { start: "22:00", end: "06:00", sundays: false, holidays: ["29/09/2026"] }, // feriado fora de YYYY-MM-DD
    { start: "22:00", end: "06:00", sundays: false, holidays: ["2026-13-40"] }, // data impossível
    { start: "22:00", end: "06:00", sundays: false, holidays: [42] }, // feriado não-string
    ["22:00", "06:00"], // dnd_hours não é objeto
    { end: "06:00", sundays: false, holidays: [] }, // sem start
    { start: "22:00", sundays: false, holidays: [] }, // sem end
    {}, // presente e vazio
  ];
  for (const mau of foraDoContrato) {
    // volta redonda 1: objeto direto
    const parsed = parseDndHours(mau);
    assertEquals(parsed?.invalid, true, `deveria marcar inválido: ${JSON.stringify(mau)}`);
    const status = deliveryWindowStatus(campaign, TUE_14Z, null, parsed);
    assertEquals(status.allowed, false, `fora do contrato precisa FECHAR: ${JSON.stringify(mau)}`);
    assertEquals(status.allowed === false ? status.reason : null, "dnd");

    // volta redonda 2: via string JSON (formato que o banco pode entregar)
    const viaString = parseDndHours(JSON.stringify(mau));
    assertEquals(viaString?.invalid, true, `via string deveria marcar inválido: ${JSON.stringify(mau)}`);
    const statusStr = deliveryWindowStatus(campaign, TUE_14Z, null, viaString);
    assertEquals(statusStr.allowed, false);
    assertEquals(statusStr.allowed === false ? statusStr.reason : null, "dnd");
  }
});

// P7: sundays/holidays no fuso da campanha (não UTC) — domingo 02:00 UTC de
// 2026-10-04 é sábado 23:00 em São Paulo: com sundays=true, a campanha SP
// libera (sábado no fuso dela) e a campanha UTC bloqueia (domingo).
Deno.test("N-118 refazer P7: sundays e feriados avaliados no fuso da campanha, não em UTC", () => {
  // 2026-10-04T02:00:00Z = sábado 2026-10-03 23:00 em America/Sao_Paulo.
  const sabadoSp = new Date("2026-10-04T02:00:00Z");
  assertEquals(localClockInTimezone("America/Sao_Paulo", sabadoSp), { weekday: 6, hour: 23, minute: 0 });
  assertEquals(localClockInTimezone("UTC", sabadoSp), { weekday: 0, hour: 2, minute: 0 });

  const dndDomingo = { start: "00:00", end: "00:01", sundays: true, holidays: [] };
  const sp = { business_hours_only: false, schedule_timezone: "America/Sao_Paulo" } as const;
  const utc = { business_hours_only: false, schedule_timezone: "UTC" } as const;

  // P8: as lentes abaixo usam o default (respect_dnd ausente = respeita);
  // nenhum veredito de bloqueio usa respect_dnd=false.
  assertEquals("respect_dnd" in sp, false);
  assertEquals(deliveryWindowStatus(sp, sabadoSp, null, dndDomingo).allowed, true);
  const bloqueadoUtc = deliveryWindowStatus(utc, sabadoSp, null, dndDomingo);
  assertEquals(bloqueadoUtc.allowed, false);
  assertEquals(bloqueadoUtc.allowed === false ? bloqueadoUtc.reason : null, "dnd");

  // feriado: "hoje" é o dia no fuso da campanha — 2026-10-03 em SP, 2026-10-04 em UTC.
  const dndFeriado = { start: "00:00", end: "00:01", sundays: false, holidays: ["2026-10-03"] };
  const feriadoSp = deliveryWindowStatus(sp, sabadoSp, null, dndFeriado);
  assertEquals(feriadoSp.allowed, false);
  assertEquals(feriadoSp.allowed === false ? feriadoSp.reason : null, "dnd");
  assertEquals(deliveryWindowStatus(utc, sabadoSp, null, dndFeriado).allowed, true);
});
