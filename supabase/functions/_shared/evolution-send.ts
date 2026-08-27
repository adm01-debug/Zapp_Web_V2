// evolution-send.ts — fetch outbound à Evolution com tradução v2→GO aplicada.
// Para functions que chamam a API direto, sem passar pelo evolution-api-proxy.
import { translateV2ToGo } from "./evolution-go-routes.ts";

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

export function evoFetch(
  evolutionUrl: string,
  evolutionKey: string,
  v2Path: string,
  body: unknown,
  fetcher: Fetcher = (u, o) => fetch(u, o),
): Promise<Response> {
  let path = v2Path;
  let method = "POST";
  let finalBody = body;
  let apikey = evolutionKey;
  if ((Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    const go = translateV2ToGo(v2Path, method, body);
    if (go) {
      path = go.path;
      method = go.method;
      finalBody = go.body;
      if (go.auth === "instance") apikey = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") ?? evolutionKey;
    }
  }
  return fetcher(`${evolutionUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey },
    ...(method !== "GET" && finalBody ? { body: JSON.stringify(finalBody) } : {}),
  });
}

// v2 retorna key.id; GO retorna data.Info.ID.
// deno-lint-ignore no-explicit-any
export function extractMessageId(data: any): string | undefined {
  return data?.key?.id ?? data?.data?.Info?.ID;
}
