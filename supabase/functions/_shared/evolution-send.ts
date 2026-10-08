// evolution-send.ts — fetch outbound à Evolution com tradução v2→GO aplicada.
// Para functions que chamam a API direto, sem passar pelo evolution-api-proxy.
import { translateV2ToGo } from "./evolution-go-routes.ts";

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

/**
 * E15 (plano multi-conexão): nome da instância alvo, lido do path v2.
 *
 * Toda rota de instância do tradutor carrega o nome no ÚLTIMO segmento
 * (`/message/sendText/{instancia}`, `/chat/updatePresence/{instancia}`,
 * `/group/create/{instancia}`); o tradutor GO reduz a rota (`/send/text`) e o
 * nome desaparece — é aqui, na escolha do `apikey`, que ele precisa ser lido de
 * volta para não confundir a conexão escolhida com a padrão. Query string é
 * descartada e barra final não cria segmento. Sem segmento (ex.: `/instance/qr`
 * solto) devolve string vazia: rota sem dono comprovado.
 */
function instanceFromV2Path(v2Path: string): string {
  const semQuery = (v2Path.split("?")[0] ?? "").trim();
  const segmentos = semQuery.split("/").filter((segmento) => segmento.length > 0);
  return segmentos.length > 0 ? segmentos[segmentos.length - 1] : "";
}

export async function evoFetch(
  evolutionUrl: string,
  evolutionKey: string,
  v2Path: string,
  body: unknown,
  fetcher: Fetcher = (u, o) => fetch(u, o),
  v2Method = "POST",
  signal?: AbortSignal,
  // E15 (plano multi-conexão): token da instância, resolvido pelo chamador a
  // partir da conexão do item (get_instance_token — E18/E19). Rota de instância
  // sem ele só cai no fallback do env quando o nome no path é o da instância
  // padrão; qualquer outra conexão falha fechado (400 `instance token ausente`)
  // antes de qualquer rede, nunca com a credencial global.
  instanceToken?: string,
): Promise<Response> {
  let path = v2Path;
  let method = v2Method;
  let finalBody = body;
  let apikey = evolutionKey;
  let contentType = "application/json";
  if ((Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    const go = translateV2ToGo(v2Path, method, body);
    if (go?.invalid) {
      console.error(`[Evolution GO] payload invalido em ${v2Path}: ${go.invalid}`);
      return new Response(JSON.stringify({ error: go.invalid }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    if (go) {
      path = go.path;
      method = go.method;
      finalBody = go.body;
      if (go.contentType) contentType = go.contentType;
      if (go.auth === "instance") {
        if (instanceToken) {
          apikey = instanceToken;
        } else {
          // E15 / TRA-002 (#18): `EVOLUTION_INSTANCE_TOKEN` é a credencial da
          // instância PADRÃO. Aplicá-la a uma rota de OUTRA conexão (o nome no
          // path v2 se perde na tradução) faz a GO selecionar a instância pela
          // credencial — o envio da conexão B sairia pela conexão A. O fallback
          // de transição só vale quando o nome no path é o da padrão
          // (EVOLUTION_INSTANCE_NAME) e o env está configurado; fora disso a
          // chamada morre aqui, ANTES de qualquer rede, sem a key global.
          const alvo = instanceFromV2Path(v2Path);
          const padrao = Deno.env.get("EVOLUTION_INSTANCE_NAME") ?? "";
          const fallbackToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
          if (!alvo || !padrao || alvo !== padrao || !fallbackToken) {
            console.error(
              `[Evolution GO] instance token ausente para rota de instância (${go.path}): ` +
                `alvo=${alvo || "(sem nome no path)"} padrao=${padrao || "(EVOLUTION_INSTANCE_NAME ausente)"} — ` +
                `a credencial global da instância padrão NÃO é usada em outra conexão.`,
            );
            return new Response(JSON.stringify({ error: "instance token ausente" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          // Log exigido pelo E21: o fallback é temporário (transição pre-E10) e
          // some quando EVOLUTION_INSTANCE_TOKEN sair do ambiente.
          console.warn(
            `[Evolution GO] instance token fallback (EVOLUTION_INSTANCE_TOKEN) na instância padrão ${alvo} (${go.path}) — remover em E21.`,
          );
          apikey = fallbackToken;
        }
      }
    }
  }
  return fetcher(`${evolutionUrl}${path}`, {
    method,
    headers: { "Content-Type": contentType, apikey },
    ...(method !== "GET" && finalBody ? { body: JSON.stringify(finalBody) } : {}),
    ...(signal ? { signal } : {}),
  });
}

// v2 retorna key.id; GO retorna data.Info.ID.
export function extractMessageId(data: unknown): string | undefined {
  const d = data as { key?: { id?: string }; data?: { Info?: { ID?: string } } };
  return d?.key?.id ?? d?.data?.Info?.ID;
}

// ── Extractors de resposta (v2 e GO) ─────────────────────────────────────────
// GO envelopa tudo em { message: 'success', data: {...} }.

// getBase64FromMediaMessage (v2): { base64, mimetype }
// downloadmedia (GO): { data: { base64: 'data:<mime>;base64,<raw>', timestamp } }
export function extractBase64Media(json: unknown): { base64: string; mimetype: string } | null {
  const j = json as {
    base64?: unknown;
    media?: unknown;
    mimetype?: unknown;
    data?: unknown;
  };
  const b64 = j?.base64
    ?? (j?.data as { base64?: unknown } | undefined)?.base64
    ?? (typeof j?.data === 'string' ? j.data : undefined)
    ?? j?.media;
  if (typeof b64 !== 'string' || !b64) return null;
  let mimetype = typeof j?.mimetype === 'string' ? j.mimetype : '';
  if (!mimetype && b64.startsWith('data:')) {
    mimetype = b64.slice(5, b64.indexOf(';')) || '';
  }
  return { base64: b64, mimetype: mimetype || 'application/octet-stream' };
}

// fetchProfilePictureUrl (v2): { profilePictureUrl } | { picture } | { url }
// /user/avatar (GO): { data: types.ProfilePictureInfo } → campo URL (sem json tag).
export function extractAvatarUrl(json: unknown): string | null {
  const j = json as {
    profilePictureUrl?: string;
    picture?: string;
    url?: string;
    data?: { URL?: string; url?: string };
  };
  return j?.profilePictureUrl
    ?? j?.picture
    ?? j?.url
    ?? j?.data?.URL
    ?? j?.data?.url
    ?? null;
}

// connectionState (v2): { instance: { state } } | { state } → 'open'|'close'|'connecting'
// /instance/status (GO): { data: { Connected, LoggedIn, Name } }
//
// Contrato E25 (PLANO_MULTI_CONEXAO_EVOLUTION_GO): só é 'open' com sessão E socket
// ativos. Durante uma queda de socket a GO responde {Connected:false, LoggedIn:true}
// (estado "Reconnecting": credenciais válidas, socket fora) — devolver 'open' aí era
// falso "conexão aberta" e o connection-health-check gravava healthy/connected com o
// WhatsApp fora do ar (TRA-003). Regra:
//   LoggedIn && Connected  → 'open'
//   LoggedIn && !Connected → 'connecting'  (transitório: o caller não promove a 'connected')
//   !LoggedIn              → 'close'
// Sem flag de socket no payload não há evidência de queda: LoggedIn decide (comportamento
// anterior preservado para respostas antigas/parciais da GO).
export function extractConnectionState(json: unknown): string {
  const j = json as {
    instance?: { state?: unknown };
    state?: unknown;
    data?: {
      LoggedIn?: unknown; loggedIn?: unknown;
      Connected?: unknown; connected?: unknown;
    };
  };
  const v2 = j?.instance?.state ?? j?.state;
  if (typeof v2 === 'string' && v2) return v2;
  const d = j?.data;
  if (d && typeof d === 'object'
    && ('LoggedIn' in d || 'Connected' in d || 'loggedIn' in d || 'connected' in d)) {
    const loggedIn = Boolean(d.LoggedIn ?? d.loggedIn);
    if (!loggedIn) return 'close';
    const hasConnected = 'Connected' in d || 'connected' in d;
    if (!hasConnected) return 'open';
    return (d.Connected ?? d.connected) ? 'open' : 'connecting';
  }
  return 'unknown';
}
