/**
 * X034 — provedor Evolution FALSO para os testes do motor.
 *
 * Servidor HTTP local (127.0.0.1, porta efêmera) que imita a Evolution API e
 * REGISTRA cada POST recebido. Nunca fala com a Evolution de produção: a URL
 * devolvida por `createFakeEvolution().url` é o único endereço que os testes
 * apontam em EVOLUTION_API_URL.
 *
 * Modos (mudam em runtime por `setMode`):
 *   - `ok`              → 200 `{ key: { id: "fake-<n>" } }` (id único por POST)
 *   - `500`             → 500 `{ error }` (erro 5xx ⇒ outcome_unknown no motor)
 *   - `timeout`         → nunca responde (o cliente estoura o AbortController)
 *   - `sem_id`          → 200 sem `key.id` (o motor classifica outcome_unknown)
 *   - `400_interativo`  → 400 `{ error: "interactive required" }` (falha definitiva)
 *
 * O `updatePresence` (rota de digitação, best-effort no motor) responde 200 em
 * qualquer modo — senão a presença travaria o laço.
 */

export type FakeEvolutionMode = "ok" | "500" | "timeout" | "sem_id" | "400_interativo" | "404";

export interface FakeEvolutionPost {
  /** rota relativa recebida (ex.: `/message/sendText/PRINCIPAL`). */
  path: string;
  /** corpo JSON do POST (objeto; `{}` se não for JSON). */
  body: Record<string, unknown>;
  /** true só para rotas de mensagem (`/message/...`), false para presença. */
  isMessage: boolean;
  /** método HTTP recebido; ausente equivale a POST (compatibilidade). */
  method?: string;
}

export interface FakeEvolution {
  /** base URL para EVOLUTION_API_URL (ex.: `http://127.0.0.1:54321`). */
  readonly url: string;
  /** todos os POSTs recebidos, na ordem. */
  readonly posts: FakeEvolutionPost[];
  /** só os POSTs de mensagem (`/message/...`). */
  messagePosts(): FakeEvolutionPost[];
  mode(): FakeEvolutionMode;
  setMode(mode: FakeEvolutionMode): void;
  /** limpa o registro de POSTs (não muda o modo). */
  reset(): void;
  /** para o servidor e libera a porta. */
  stop(): Promise<void>;
}

export function createFakeEvolution(
  options: { mode?: FakeEvolutionMode; hostname?: string; timeoutDelayMs?: number } = {},
): FakeEvolution {
  const posts: FakeEvolutionPost[] = [];
  let mode: FakeEvolutionMode = options.mode ?? "ok";
  // O modo `timeout` segura a resposta por este tempo (o motor corta em 20s); é
  // finito de propósito para o servidor conseguir encerrar (shutdown não trava).
  const timeoutDelayMs = options.timeoutDelayMs ?? 30_000;
  let counter = 0;

  const server = Deno.serve(
    { hostname: options.hostname ?? "127.0.0.1", port: 0, onListen() {} },
    async (req) => {
      const url = new URL(req.url);
      const path = url.pathname;

      // DELETE: exclusão de instância (`/instance/delete/...`). O provedor
      // responde 200 quando apaga e 404 quando a instância já não existe — os
      // dois desfechos que a Edge precisa reconciliar. Registrado em `posts`
      // (com o método) para o teste provar que a chamada aconteceu.
      if (req.method === "DELETE") {
        posts.push({ path, method: "DELETE", body: {}, isMessage: false });
        if (mode === "404") {
          return new Response(JSON.stringify({ error: true, status: 404, message: "Instance not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ status: "SUCCESS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Presença (digitação): best-effort no motor, sempre 200.
      if (path.startsWith("/chat/")) {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const raw = await req.text();
      let body: Record<string, unknown> = {};
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
      const isMessage = path.startsWith("/message/");
      posts.push({ path, body, isMessage });
      counter += 1;

      switch (mode) {
        case "500":
          return new Response(JSON.stringify({ error: "fake_provider_down" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        case "400_interativo":
          return new Response(JSON.stringify({ error: "interactive required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        case "sem_id":
          // 200 sem `key.id`: o motor não confirma a entrega (outcome_unknown).
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        case "timeout":
          // Segura a resposta além do AbortController do motor (20s): o cliente
          // aborta e o motor classifica outcome_unknown. Delay finito para o
          // servidor conseguir encerrar.
          await new Promise((resolve) => setTimeout(resolve, timeoutDelayMs));
          return new Response(JSON.stringify({ error: "client_aborted" }), {
            status: 499,
            headers: { "Content-Type": "application/json" },
          });
        case "ok":
        default:
          // Id ÚNICO por POST (uuid): o motor grava o id como recibo externo e
          // um id repetido entre invocações violaria a unicidade do recibo.
          return new Response(JSON.stringify({ key: { id: `fake-${crypto.randomUUID()}` } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
      }
    },
  );

  const addr = server.addr;
  if (addr.transport !== "tcp") {
    throw new Error("fake-evolution: era esperado um listener TCP");
  }

  return {
    url: `http://127.0.0.1:${addr.port}`,
    posts,
    messagePosts: () => posts.filter((p) => p.isMessage),
    mode: () => mode,
    setMode: (next: FakeEvolutionMode) => {
      mode = next;
    },
    reset: () => {
      posts.length = 0;
      counter = 0;
    },
    stop: () => server.shutdown(),
  };
}
