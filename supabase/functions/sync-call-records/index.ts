import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

/**
 * T72 — reconciliacao dos registros de chamada com o Bitrix24 (voximplant.statistic.get).
 *
 * Duas regras que nao se negociam nesta etapa:
 *   1. **Nunca cria chamada.** So casa por `peer_number` + `started_at` (janela de ±90 s) e
 *      ATUALIZA a linha existente. Se nao houver linha, o registro e ignorado — quem cria
 *      chamada e o motor da telefonia, nao um job de sincronizacao.
 *   2. **Sem fonte configurada, nao inventa.** Sem `BITRIX_WEBHOOK_URL` a funcao devolve
 *      `reconciliados: 0` com o motivo, em vez de erro: o agendamento do N8N continua de pe
 *      e passa a funcionar sozinho quando o segredo for configurado.
 *
 * O aceite da etapa admite exatamente isso: "1 chamada real reconciliada (ids) ou 0 registros".
 *
 * TEL-RECONCILIATION-001 (item 61 do BACKLOG_VERIFICADO) endurece a reconciliacao:
 *   - **Identidade com DDD**, nao apenas os ultimos 9 digitos: um numero de outro DDD nao
 *     recebe vinculo arbitrario.
 *   - **Ambiguidade e ignorada**: duas linhas casando o mesmo numero devolvem `null` (melhor
 *     nao reconciliar do que reconciliar a chamada errada).
 *   - **`CALL_FAILED_CODE` e traduzido** para o `end_reason` canonico (o codigo cru viola o
 *     CHECK de `calls.end_reason` e perde a semantica de encerramento).
 *   - **Reexecucao nao apaga dado bom**: campo sem valor novo na origem nao e sobrescrito.
 *
 * Agendamento: N8N a cada 5 min (etapa de infraestrutura do Joaquim, nao desta funcao).
 */
const JANELA_SEGUNDOS = 90;

/** Janela de casamento: `started_at` dentro de ±90 s do inicio registrado pelo Bitrix. */
export function janelaDoCasamento(inicio: Date, segundos = JANELA_SEGUNDOS) {
  return {
    de: new Date(inicio.getTime() - segundos * 1000).toISOString(),
    ate: new Date(inicio.getTime() + segundos * 1000).toISOString(),
  };
}

/**
 * Identidade normalizada do numero: so digitos, sem o DDI 55 quando o que sobra e um numero
 * nacional plausivel (10 ou 11 digitos). Mantem o **DDD** — casar apenas pelos ultimos digitos
 * vinculava a chamada um numero de outro DDD.
 */
export function identidadeDoNumero(numero: string | null | undefined): string | null {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // 55 + DDD(2) + 8..9 digitos = 12..13; sem DDI, DDD+numero = 10..11.
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos.slice(2);
  }
  return digitos;
}

/**
 * Mesmo numero? Compara **DDD + assinante**, tolerando o nono digito do celular (o mesmo
 * numero aparece com e sem o 9 nos dois lados). DDD diferente nunca casa.
 */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = identidadeDoNumero(a);
  const y = identidadeDoNumero(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.slice(0, 2) !== y.slice(0, 2)) return false; // DDD diferente nao casa
  const semNono = (assinante: string) => (assinante.length === 9 && assinante.startsWith("9") ? assinante.slice(1) : assinante);
  return semNono(x.slice(2)) === semNono(y.slice(2));
}

/**
 * Escolhe a chamada que o registro do Bitrix reconcilia. Exige **exatamente uma** linha
 * casando por identidade com DDD; zero ou mais de uma devolve `null` - e `null` significa
 * **ignorar**, nunca criar.
 */
export function escolherCandidata<T extends { id: string; peer_number?: string | null }>(
  candidatas: T[] | null | undefined,
  numero: string,
): T | null {
  if (!identidadeDoNumero(numero)) return null;
  const casam = (candidatas ?? []).filter((c) => mesmoNumero(c.peer_number, numero));
  // Ambiguidade (duas linhas casando o mesmo numero) e ignorada: associar gravacao/identificador
  // a chamada errada e pior do que nao reconciliar.
  return casam.length === 1 ? casam[0] : null;
}

/**
 * `CALL_FAILED_CODE` do Bitrix e um codigo SIP/VRU. Gravar o codigo cru em `end_reason` perde a
 * semantica **e** viola o CHECK de `calls.end_reason` (que so aceita o vocabulario canonico).
 * A traducao segue o mesmo contrato de `sipCodeToEndReason` (src/lib/calls/callStatus.ts):
 * 200 → concluida · 408/480 → nao atendida · 486 → ocupado · 487 → cancelada · 603 → recusada ·
 * 5xx e desconhecidos → falhou. Codigo ausente/nao numerico devolve `null` (sem valor novo).
 */
export function endReasonDoCodigo(codigo: string | null | undefined): string | null {
  const bruto = (codigo ?? "").trim();
  if (!bruto) return null;
  const n = Number.parseInt(bruto, 10);
  if (!Number.isFinite(n)) return null;
  switch (n) {
    case 200:
      return "completed";
    case 408:
    case 480:
      return "no_answer";
    case 486:
      return "busy";
    case 487:
      return "cancelled";
    case 603:
      return "declined";
    default:
      return "failed";
  }
}

/** Os campos que a reconciliacao pode escrever. Campo sem valor novo na origem nao entra. */
export function dadosDaReconciliacao(registro: {
  CALL_ID?: string;
  CALL_RECORD_URL?: string;
  CALL_FAILED_CODE?: string;
  CALL_DURATION?: string;
}): Record<string, unknown> {
  // `recording_status` e um flag derivado (nunca null): diz se ha audio para tocar.
  const dados: Record<string, unknown> = {
    recording_status: registro.CALL_RECORD_URL ? "available" : "none",
  };
  // Campos de origem so entram quando ha valor novo: reexecucao nao apaga o que ja existe com null.
  if (registro.CALL_ID) dados.provider_call_id = registro.CALL_ID;
  if (registro.CALL_RECORD_URL) dados.recording_url = registro.CALL_RECORD_URL;
  const endReason = endReasonDoCodigo(registro.CALL_FAILED_CODE);
  if (endReason) dados.end_reason = endReason;
  const duracao = Number.parseInt(registro.CALL_DURATION ?? "", 10);
  if (Number.isFinite(duracao) && duracao > 0) dados.talk_seconds = duracao;
  return dados;
}

type RegistroBitrix = {
  CALL_ID?: string;
  CALL_START_DATE?: string;
  PHONE_NUMBER?: string;
  PORTAL_USER_ID?: string;
  CALL_DURATION?: string;
  CALL_FAILED_CODE?: string;
  RECORD_FILE_ID?: string;
  CALL_RECORD_URL?: string;
};

export async function handleSyncCallRecords(req: Request) {
  // (o Deno.serve fica no fim, sob import.meta.main: importar este modulo num teste
  //  nao pode subir um servidor na porta 8000.)
  const logger = new Logger("sync-call-records");
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  try {
    // Quem chama e o N8N: exige a service_role (segredo que ja existe, nenhum novo).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || token !== serviceRole) return errorResponse("Unauthorized", 401, req);

    const supabase = createClient(requireEnv("SUPABASE_URL"), serviceRole, { auth: { persistSession: false } });

    const webhook = Deno.env.get("BITRIX_WEBHOOK_URL");
    if (!webhook) {
      logger.info("sem BITRIX_WEBHOOK_URL: nada a reconciliar");
      return jsonResponse({ reconciliados: 0, ignorados: 0, motivo: "BITRIX_WEBHOOK_URL nao configurado" }, 200, req);
    }

    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const resposta = await fetch(`${webhook}/voximplant.statistic.get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ FILTER: { ">=CALL_START_DATE": desde }, SORT: "CALL_START_DATE", ORDER: "DESC" }),
    });

    if (!resposta.ok) {
      logger.error("bitrix respondeu erro", { status: resposta.status });
      return jsonResponse({ reconciliados: 0, ignorados: 0, motivo: `bitrix ${resposta.status}` }, 200, req);
    }

    const corpo = await resposta.json().catch(() => null);
    const registros: RegistroBitrix[] = Array.isArray(corpo?.result) ? corpo.result : [];

    let reconciliados = 0;
    let ignorados = 0;

    for (const registro of registros) {
      const numero = (registro.PHONE_NUMBER ?? "").replace(/\D/g, "");
      const inicio = registro.CALL_START_DATE ? new Date(registro.CALL_START_DATE) : null;
      if (!numero || !inicio || Number.isNaN(inicio.getTime())) {
        ignorados++;
        continue;
      }

      // A janela e feita em JS de proposito: o formato de `started_at` no Postgres nao aceita
      // soma de segundos sem cast, e um cast errado aqui deslocaria a janela inteira.
      const { de, ate } = janelaDoCasamento(inicio);

      const { data: candidatas, error: erroBusca } = await supabase
        .from("calls")
        .select("id, peer_number")
        .gte("started_at", de)
        .lte("started_at", ate);

      if (erroBusca) {
        logger.error("erro buscando candidata", { erro: erroBusca.message });
        ignorados++;
        continue;
      }

      const alvo = escolherCandidata(candidatas, numero);
      if (!alvo) {
        ignorados++; // nao cria: so reconcilia o que o motor ja registrou (ou ha ambiguidade)
        continue;
      }

      const atualizacao = dadosDaReconciliacao(registro);

      const { error: erroUpdate } = await supabase.from("calls").update(atualizacao).eq("id", alvo.id);
      if (erroUpdate) {
        logger.error("erro atualizando", { erro: erroUpdate.message, id: alvo.id });
        ignorados++;
        continue;
      }
      reconciliados++;
    }

    logger.info("reconciliacao concluida", { reconciliados, ignorados });
    return jsonResponse({ reconciliados, ignorados }, 200, req);
  } catch (erro) {
    logger.error("falha inesperada", { erro: String(erro) });
    return errorResponse("Erro inesperado", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve(handleSyncCallRecords);
}
