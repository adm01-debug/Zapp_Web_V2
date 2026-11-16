// Shim só para rodar os testes nesta sessão: deno.land é bloqueado pelo proxy.
// `Deno.serve` é nativo no deno 2.x, então a assinatura usada pelos testes basta.
export function serve(handler: (req: Request) => Response | Promise<Response>, opts?: { port?: number; hostname?: string; onListen?: (p: { port: number; hostname: string }) => void }) {
  const s = Deno.serve({ port: opts?.port ?? 0, hostname: opts?.hostname ?? '127.0.0.1', onListen: opts?.onListen ?? (() => {}) }, handler);
  return s;
}
