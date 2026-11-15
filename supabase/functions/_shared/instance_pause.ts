/**
 * C121 — consulta de pausa de instância compartilhada pelos caminhos de envio.
 *
 * `is_instance_paused` (SECURITY DEFINER) aceita staff ou service_role; todos os
 * chamadores aqui usam o cliente de serviço. Falha de leitura NÃO bloqueia o envio
 * (fail-open): a pausa é proteção operacional, não pré-requisito de entrega.
 */

export interface PauseRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

export async function isInstancePaused(
  client: PauseRpcClient,
  instance: string,
  onError?: (code: string | undefined) => void,
): Promise<boolean> {
  if (!instance) return false;
  try {
    const { data, error } = await client.rpc('is_instance_paused', { p_instance: instance });
    if (error) {
      onError?.(error.code);
      return false;
    }
    return data === true;
  } catch (e) {
    onError?.(e instanceof Error ? e.name : 'unknown');
    return false;
  }
}
