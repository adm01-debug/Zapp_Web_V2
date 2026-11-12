import type { ConnectionOption } from '@/hooks/connections/useConnectionOptions';

/** Mensagem do erro (inclusive `notSupported` da Evolution GO) ou o texto padrão. */
export function mensagemDeErro(err: unknown, padrao: string): string {
  return err instanceof Error && err.message ? err.message : padrao;
}

/** Conexão escolhida, ou a única que existe (já vem marcada). */
export function conexaoEfetiva(escolhida: string, conexoes: ConnectionOption[]): string {
  return escolhida || (conexoes.length === 1 ? conexoes[0].id : '');
}

export function instanciaDa(conexaoId: string, conexoes: ConnectionOption[]): string {
  return conexoes.find((c) => c.id === conexaoId)?.instance_id ?? '';
}

/** Lista que a Evolution devolve direta ou embrulhada (`{ data }`, `{ templates }`, `{ products }`…). */
export function listaDe(data: unknown, ...chaves: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    for (const chave of ['data', ...chaves]) {
      const v = (data as Record<string, unknown>)[chave];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

export function texto(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}
