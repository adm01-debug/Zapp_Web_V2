import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryWindowStatus, parseDndHours } from "../talkx-window.ts";

// N-118: DND no fuso da campanha; inválido fecha; weekdays ignora fora de 0..6.
// sex 22h SP = sáb em UTC (prova que o fuso usado é o da campanha).
const FRI_SP_22H = new Date("2026-10-03T01:00:00Z");
// qua 11h SP = 14h UTC (dia útil).
const WED_SP_11H = new Date("2026-09-30T14:00:00Z");
// seg 11h SP = 14h UTC.
const MON_SP_11H = new Date("2026-09-28T14:00:00Z");

const NEUTRA = {
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  send_weekdays: null,
} as const;

type WindowStatus = ReturnType<typeof deliveryWindowStatus>;

function reasonOf(status: WindowStatus): string | undefined {
  if (status.allowed) return undefined;
  return status.reason;
}

Deno.test("N-118/P1: feriado usa o 'hoje' no fuso da campanha, não UTC", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "America/Sao_Paulo" };
  const dnd = parseDndHours({ start: "03:00", end: "04:00", sundays: false, holidays: ["2026-10-02"] });
  const status = deliveryWindowStatus(campaign, FRI_SP_22H, null, dnd);
  assertEquals(status.allowed, false);
  assertEquals(reasonOf(status), "dnd");
});

Deno.test("N-118/P1: feriado só em UTC não bloqueia campanha de outro fuso", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "America/Sao_Paulo" };
  const dnd = parseDndHours({ start: "03:00", end: "04:00", sundays: false, holidays: ["2026-10-03"] });
  const status = deliveryWindowStatus(campaign, FRI_SP_22H, null, dnd);
  assertEquals(status.allowed, true);
});

Deno.test("N-118/P3: DND fora do contrato fecha a janela (reason dnd)", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "UTC" };
  const foraDoContrato: unknown[] = [
    { start: "25:00", end: "14:00", sundays: false, holidays: [] },
    { start: "10:00", end: "14:00", sundays: "yes", holidays: [] },
    { start: "10:00", end: "14:00", sundays: false, holidays: "2026-10-12" },
    { start: "10:00", end: "14:00", sundays: false, holidays: ["12/10/2026"] },
    { start: "10:00", end: "14:00", sundays: false, holidays: ["2026-13-99"] },
    {},
    "não é json",
    42,
  ];
  for (const raw of foraDoContrato) {
    const dnd = parseDndHours(raw as never);
    const status = deliveryWindowStatus(campaign, WED_SP_11H, null, dnd);
    assertEquals(status.allowed, false, `deveria fechar: ${JSON.stringify(raw)}`);
    assertEquals(reasonOf(status), "dnd", `reason deveria ser dnd: ${JSON.stringify(raw)}`);
  }
});

Deno.test("N-118/P3: DND ausente não restringe; string vazia é ausência", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "UTC" };
  assertEquals(parseDndHours(null), null);
  assertEquals(parseDndHours(undefined), null);
  assertEquals(parseDndHours(""), null);
  assertEquals(deliveryWindowStatus(campaign, WED_SP_11H, null, null).allowed, true);
});

Deno.test("N-118/P5: send_weekdays com só-valores-inválidos = irrestrito", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "America/Sao_Paulo", send_weekdays: [1.5] };
  assertEquals(deliveryWindowStatus(campaign, MON_SP_11H, null, null).allowed, true);
});

Deno.test("N-118/P5: send_weekdays ignora duplicatas e floats, usa os válidos", () => {
  const mesmaSegunda = {
    ...NEUTRA,
    schedule_timezone: "America/Sao_Paulo",
    send_weekdays: [1, 1, 2.5, 7, -1, 1],
  };
  assertEquals(deliveryWindowStatus(mesmaSegunda, MON_SP_11H, null, null).allowed, true);

  // Só terça (válido): segunda bloqueia com outside_weekdays.
  const soTerca = { ...NEUTRA, schedule_timezone: "America/Sao_Paulo", send_weekdays: [2] };
  const bloqueada = deliveryWindowStatus(soTerca, MON_SP_11H, null, null);
  assertEquals(bloqueada.allowed, false);
  assertEquals(reasonOf(bloqueada), "outside_weekdays");

  // [] = irrestrito.
  const vazio = { ...NEUTRA, schedule_timezone: "America/Sao_Paulo", send_weekdays: [] as number[] };
  assertEquals(deliveryWindowStatus(vazio, MON_SP_11H, null, null).allowed, true);
});

Deno.test("N-118/P3: send_window presente mas fora do contrato fecha", () => {
  // 09:30 em SP cairia dentro de 08:60–10:00 se o "60" fosse aceito como 540.
  const now = new Date("2026-09-30T12:30:00Z");
  const campaign = {
    ...NEUTRA,
    schedule_timezone: "America/Sao_Paulo",
    send_window_start: "08:60",
    send_window_end: "10:00",
  };
  const status = deliveryWindowStatus(campaign, now, null, null);
  assertEquals(status.allowed, false);
  assertEquals(reasonOf(status), "outside_send_window");
});

Deno.test("N-118: DND válido continua bloqueando e liberando nos horários certos", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "America/Sao_Paulo" };
  const dnd = parseDndHours({ start: "10:00", end: "14:00", sundays: false, holidays: [] });
  // 12:00 em SP (quarta) → dentro do DND.
  assertEquals(reasonOf(deliveryWindowStatus(campaign, new Date("2026-09-30T15:00:00Z"), null, dnd)), "dnd");
  // 15:00 em SP (quarta) → fora do DND.
  assertEquals(deliveryWindowStatus(campaign, new Date("2026-09-30T18:00:00Z"), null, dnd).allowed, true);
});

Deno.test("N-118: respect_dnd=false ignora o DND, inclusive quando inválido", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "UTC", respect_dnd: false };
  const invalido = parseDndHours({ start: "xx", end: "yy", sundays: false, holidays: [] });
  assertEquals(deliveryWindowStatus(campaign, WED_SP_11H, null, invalido).allowed, true);
  // E DND válido também é ignorado quando a campanha optou por sair.
  const valido = parseDndHours({ start: "00:00", end: "23:59", sundays: false, holidays: [] });
  assertEquals(deliveryWindowStatus(campaign, WED_SP_11H, null, valido).allowed, true);
});

Deno.test("N-118: DND que vira a meia-noite bloqueia dos dois lados (22:00-07:00)", () => {
  const campaign = { ...NEUTRA, schedule_timezone: "UTC" };
  const dnd = parseDndHours({ start: "22:00", end: "07:00", sundays: false, holidays: [] });
  // 23:30 UTC (sexta) → dentro do DND.
  assertEquals(reasonOf(deliveryWindowStatus(campaign, new Date("2026-10-02T23:30:00Z"), null, dnd)), "dnd");
  // 06:30 UTC (sexta) → dentro do DND (madrugada seguinte).
  assertEquals(reasonOf(deliveryWindowStatus(campaign, new Date("2026-10-02T06:30:00Z"), null, dnd)), "dnd");
  // 07:00 UTC → fim exclusivo, fora do DND.
  assertEquals(deliveryWindowStatus(campaign, new Date("2026-10-02T07:00:00Z"), null, dnd).allowed, true);
  // 12:00 UTC → fora do DND.
  assertEquals(deliveryWindowStatus(campaign, new Date("2026-10-02T12:00:00Z"), null, dnd).allowed, true);
});
