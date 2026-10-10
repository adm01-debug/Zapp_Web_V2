/**
 * V03 — aceite do plano: "teste Deno do scheduler com 3 campanhas pausadas
 * (manual, janela, conexão) → só as 2 automáticas elegíveis retomam".
 *
 * O caso MANUAL é o bug de produção: uma campanha pausada pelo operador, COM
 * janela de envio configurada, era retomada no minuto seguinte pelo scheduler
 * antigo (que olhava só a janela). Aqui ela precisa ficar parada — e é o
 * primeiro teste de cada bloco, de propósito.
 */
import {
  AUTO_RESUME_REASONS,
  pauseReasonForWindow,
  connectionStatusResolver,
  selectResumableCampaigns,
  type PausedCampaignRow,
} from "../talkx-resume-policy.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Segunda-feira 10:00 em America/Sao_Paulo — dentro de uma janela 08:00-18:00.
const DENTRO_DA_JANELA = new Date("2026-09-28T13:00:00.000Z");
// Mesmo dia, 22:00 em São Paulo — fora da janela.
const FORA_DA_JANELA = new Date("2026-09-29T01:00:00.000Z");

const JANELA = {
  schedule_timezone: "America/Sao_Paulo",
  send_window_start: "08:00",
  send_window_end: "18:00",
  business_hours_only: false,
};

Deno.test("pauseReasonForWindow traduz a recusa da janela no motivo gravado", () => {
  assert(pauseReasonForWindow({ allowed: true }) === null, "janela aberta não gera motivo");
  assert(
    pauseReasonForWindow({ allowed: false, reason: "outside_send_window" }) === "send_window",
    "fora da janela de envio deve gravar send_window",
  );
  assert(
    pauseReasonForWindow({ allowed: false, reason: "outside_business_hours" }) === "business_hours",
    "fora do horário comercial deve gravar business_hours",
  );
  assert(
    pauseReasonForWindow({ allowed: false, reason: "invalid_schedule_timezone" }) === "invalid_schedule_timezone",
    "fuso inválido é preservado para diagnóstico (e fica fora da retomada automática)",
  );
  assert(
    !(AUTO_RESUME_REASONS as readonly string[]).includes("invalid_schedule_timezone"),
    "fuso inválido NÃO pode autorizar retomada automática",
  );
});

Deno.test("as 3 campanhas pausadas do aceite: manual fica parada, janela e conexão retomam", () => {
  const rows: PausedCampaignRow[] = [
    { id: "manual-1", name: "Pausada pelo operador", pause_reason: "Pausa manual: revisar texto", ...JANELA },
    { id: "janela-1", name: "Pausada pela janela", pause_reason: "send_window", ...JANELA },
    { id: "conexao-1", name: "Pausada pela conexão", pause_reason: "connection_lost", ...JANELA, whatsapp_connection_id: "conn-1" },
  ];

  const decisions = selectResumableCampaigns(rows, () => "connected", DENTRO_DA_JANELA);

  const retomadas = decisions.filter((d) => d.resume).map((d) => d.id).sort();
  assert(
    JSON.stringify(retomadas) === JSON.stringify(["conexao-1", "janela-1"]),
    `só as 2 automáticas elegíveis podem retomar, obtido: ${JSON.stringify(retomadas)}`,
  );

  const manual = decisions.find((d) => d.id === "manual-1")!;
  assert(manual.resume === false, "pausa do operador com janela aberta NÃO pode ser retomada (bug de produção)");
  assert(manual.because.includes("não retomar"), `motivo do bloqueio precisa ser explicado: ${manual.because}`);

  const janela = decisions.find((d) => d.id === "janela-1")!;
  assert(janela.resume === true && janela.because.includes("janela"), `janela aberta deve retomar: ${janela.because}`);

  const conexao = decisions.find((d) => d.id === "conexao-1")!;
  assert(conexao.resume === true && conexao.because.includes("conexão"), `conexão de pé deve retomar: ${conexao.because}`);
});

Deno.test("conexão caída não retoma, mesmo com a janela aberta", () => {
  const rows: PausedCampaignRow[] = [
    { id: "conexao-1", name: "Pausada pela conexão", pause_reason: "connection_lost", ...JANELA, whatsapp_connection_id: "conn-1" },
  ];
  for (const status of ["disconnected", "connecting", "qr_pending", null]) {
    const [decision] = selectResumableCampaigns(rows, () => status, DENTRO_DA_JANELA);
    assert(decision.resume === false, `conexão '${status}' não pode retomar`);
    assert(decision.because.includes("conexão"), `motivo precisa citar a conexão: ${decision.because}`);
  }
  const [comConexaoDePe] = selectResumableCampaigns(rows, () => "connected", DENTRO_DA_JANELA);
  assert(comConexaoDePe.resume === true, "com a conexão de pé, retoma");
});

Deno.test("motivo automático, mas ainda fora da janela: não retoma", () => {
  const rows: PausedCampaignRow[] = [
    { id: "janela-1", name: "Pausada pela janela", pause_reason: "send_window", ...JANELA },
  ];
  const [possivel] = selectResumableCampaigns(rows, () => "connected", DENTRO_DA_JANELA);
  const [foraDaJanela] = selectResumableCampaigns(rows, () => "connected", FORA_DA_JANELA);
  assert(possivel.resume === true && foraDaJanela.resume === false, "a janela precisa ser reavaliada na hora da retomada");
});

Deno.test("pausa sem motivo (anterior à V03) e motivo desconhecido nunca retomam", () => {
  const rows: PausedCampaignRow[] = [
    { id: "legado-1", name: "Pausa antiga", pause_reason: null, ...JANELA },
    { id: "espaco-1", name: "Motivo só com espaço", pause_reason: "   ", ...JANELA },
    { id: "outro-1", name: "Motivo de outra versão", pause_reason: "pausado_pelo_cliente", ...JANELA },
  ];
  const decisions = selectResumableCampaigns(rows, () => "connected", DENTRO_DA_JANELA);
  for (const decision of decisions) {
    assert(decision.resume === false, `${decision.id} não pode retomar sozinha (motivo: ${decision.pauseReason})`);
  }
  assert(decisions[1].resume === false, "motivo só com espaço não pode autorizar retomada");
});

Deno.test("connection_lost sem whatsapp_connection_id conhecido NÃO retoma", () => {
  // Cobertura nascida da auditoria de 2026-09-29: uma mutação que trocava a
  // guarda por `if (campaign.whatsapp_connection_id && status !== "connected")`
  // SOBREVIVIA à suíte (6/6 verdes), porque todos os casos usavam 'conn-1'.
  // Sem saber QUAL conexão está de pé, retomar é chutar — então não retoma, e
  // este teste passa a derrubar aquela mutação.
  const rows: PausedCampaignRow[] = [
    { id: "conexao-orfa", name: "Pausa por conexão sem id", pause_reason: "connection_lost", ...JANELA },
  ];
  const [semId] = selectResumableCampaigns(rows, () => null, DENTRO_DA_JANELA);
  assert(semId.resume === false, "campanha sem connection_id não pode ser retomada automaticamente");
  assert(semId.because.includes("conexão"), `motivo precisa citar a conexão: ${semId.because}`);

  // O mesmo caso, mas com o id presente e a conexão respondendo 'connected'.
  const comId: PausedCampaignRow[] = [
    { id: "conexao-ok", name: "Pausa por conexão com id", pause_reason: "connection_lost", ...JANELA, whatsapp_connection_id: "conn-1" },
  ];
  const [ok] = selectResumableCampaigns(comId, () => "connected", DENTRO_DA_JANELA);
  assert(ok.resume === true, "com a conexão identificada e de pé, retoma");
});

Deno.test("[M6] motivo retomável COM espaço nas bordas não retoma (trava o .trim() fora)", () => {
  // Lacuna que a auditoria de 2026-09-29 provou: reintroduzir o .trim() no
  // pause_reason SOBREVIVIA à suíte, porque o único fixture de whitespace era
  // "   " — não-retomável COM ou SEM trim, logo incapaz de distinguir as duas
  // implementações. O fixture que distingue é um motivo VÁLIDO com espaço.
  const rows: PausedCampaignRow[] = [
    { id: "espaco-antes", name: "Motivo com espaço antes", pause_reason: " send_window", ...JANELA },
    { id: "espaco-depois", name: "Motivo com espaço depois", pause_reason: "send_window ", ...JANELA },
  ];
  for (const decision of selectResumableCampaigns(rows, () => null, DENTRO_DA_JANELA)) {
    assert(
      decision.resume === false,
      `${decision.id} não pode retomar: a comparação é exata, igual ao filtro do banco (${decision.because})`,
    );
  }
});

Deno.test("[M7] o fuso da CAMPANHA é usado de verdade (não cai no DEFAULT)", () => {
  // 2026-09-28T11:30:00Z é segunda 08:30 em America/Sao_Paulo (DENTRO da janela
  // 08:00-18:00) e 07:30 em America/New_York (FORA). Se a política deixar de
  // passar o schedule_timezone da campanha para deliveryWindowStatus, ela avalia
  // tudo no DEFAULT e retoma indevidamente a campanha de Nova York.
  const agora = new Date("2026-09-28T11:30:00.000Z");
  const rows: PausedCampaignRow[] = [
    { id: "sp", name: "São Paulo 08:30", pause_reason: "send_window", ...JANELA },
    { id: "ny", name: "Nova York 07:30", pause_reason: "send_window", ...JANELA, schedule_timezone: "America/New_York" },
  ];
  const porId = new Map(selectResumableCampaigns(rows, () => null, agora).map((d) => [d.id, d]));
  assert(
    porId.get("sp")?.resume === true,
    `São Paulo deveria retomar (08:30 dentro de 08:00-18:00): ${porId.get("sp")?.because}`,
  );
  assert(
    porId.get("ny")?.resume === false,
    `Nova York NÃO pode retomar (07:30 fora de 08:00-18:00): ${porId.get("ny")?.because}`,
  );
});

Deno.test("[M11] fiação do scheduler: sem conexão conhecida, nunca retoma", () => {
  // A mutação que sobrevivia era trocar o null do caso "sem
  // whatsapp_connection_id" por "connected" — inline na edge function, nenhum
  // teste a alcançava. A fiação agora é connectionStatusResolver, testada aqui.
  const statusById = new Map<string, string | null>([
    ["conn-viva", "connected"],
    ["conn-caida", "disconnected"],
    ["conn-sem-status", null],
  ]);
  const resolver = connectionStatusResolver(statusById);
  const campanha = (id: string, connectionId?: string | null): PausedCampaignRow => ({
    id,
    name: id,
    pause_reason: "connection_lost",
    ...JANELA,
    whatsapp_connection_id: connectionId ?? null,
  });

  assert(resolver(campanha("x", null)) === null, "sem id o resolvedor devolve null — nunca 'connected'");
  assert(resolver(campanha("x", "conn-de-outra-conta")) === null, "id fora da resposta devolve null");
  assert(resolver(campanha("x", "conn-viva")) === "connected", "id conhecido devolve o status da tabela");
  assert(resolver(campanha("x", "conn-sem-status")) === null, "status nulo na tabela continua null");

  const rows = [
    campanha("viva", "conn-viva"),
    campanha("caida", "conn-caida"),
    campanha("sem-status", "conn-sem-status"),
    campanha("desconhecida", "conn-de-outra-conta"),
    campanha("orfa", null),
  ];
  const porId = new Map(selectResumableCampaigns(rows, resolver, DENTRO_DA_JANELA).map((d) => [d.id, d]));
  assert(porId.get("viva")?.resume === true, "conexão de pé retoma");
  for (const id of ["caida", "sem-status", "desconhecida", "orfa"]) {
    assert(porId.get(id)?.resume === false, `${id} não pode retomar sem conexão de pé (${porId.get(id)?.because})`);
  }
});

Deno.test("business_hours retoma só dentro do horário comercial", () => {
  const rows: PausedCampaignRow[] = [
    { id: "comercial-1", name: "Fora do comercial", pause_reason: "business_hours", schedule_timezone: "America/Sao_Paulo", business_hours_only: true },
  ];
  const [tercaDeMadrugada] = selectResumableCampaigns(rows, () => "connected", FORA_DA_JANELA);
  const [tercaDeManha] = selectResumableCampaigns(rows, () => "connected", DENTRO_DA_JANELA);
  assert(tercaDeMadrugada.resume === false, "22:00 não é horário comercial");
  assert(tercaDeManha.resume === true, "10:00 é horário comercial");
});
