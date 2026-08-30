/**
 * Negociação de versão de contrato (webhooks / Edge Functions).
 * v1 (default): envelope leniente — retrocompatibilidade total.
 * v2 (header 'x-contract-version: 2'): schema estrito.
 * Depreciação: definir V1_SUNSET (ISO) → respostas v1 passam a emitir
 * headers Deprecation/Sunset sem quebrar consumidores. Ver docs/contracts.md.
 */
import { z, parseBody, validationErrorResponse } from './schemas.ts';

export type ContractVersion = 1 | 2;
export const V1_SUNSET: string | null = null;

export function getContractVersion(req: Request): ContractVersion {
  return req.headers.get('x-contract-version') === '2' ? 2 : 1;
}

export function deprecationHeaders(version: ContractVersion): Record<string, string> {
  if (version === 1 && V1_SUNSET) return { Deprecation: 'true', Sunset: V1_SUNSET };
  return {};
}

export function parseVersioned<T1, T2>(
  req: Request,
  body: unknown,
  schemas: { v1: z.ZodSchema<T1>; v2: z.ZodSchema<T2> },
):
  | { ok: true; version: ContractVersion; data: T1 | T2 }
  | { ok: false; version: ContractVersion; response: Response } {
  const version = getContractVersion(req);
  const parsed = parseBody(version === 2 ? schemas.v2 : schemas.v1, body);
  if (!parsed.success) {
    return { ok: false, version, response: validationErrorResponse(parsed, req, version) };
  }
  return { ok: true, version, data: parsed.data as T1 | T2 };
}
