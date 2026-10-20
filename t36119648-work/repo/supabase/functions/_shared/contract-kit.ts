/**
 * contract-kit — porta ÚNICA de validação de contrato das Edge Functions.
 *
 * Fecha o item 041 do inventário (`contract-kit/parseOrReject` inexistente):
 * até aqui cada edge repetia à mão o par `parseBody()` + `validationErrorResponse()`
 * (29 `index.ts` fazem `if (!parsed.success) return validationErrorResponse(...)`)
 * e a negociação de versão vivia só em `contracts.ts` (`parseVersioned`).
 *
 * `parseOrReject` reúne os dois numa chamada só, com três garantias:
 *
 *  1. ENVELOPE 422 ÚNICO — a falha sai no formato já fixado por
 *     `tests/contracts/error-format.contract.test.ts` e por `docs/contracts.md`
 *     (`{ error: { code: 'VALIDATION_ERROR', message, fields[] } }`). Nada é
 *     reimplementado: o corpo vem de `validationErrorResponse()`, então o
 *     caminho novo e o legado devolvem o MESMO corpo para a mesma entrada
 *     (provado em `tests/contracts/contract-kit.contract.test.ts`).
 *  2. VERSIONAMENTO — `x-contract-version: 2` seleciona o schema v2 e a resposta
 *     (sucesso E 422) ecoa a versão aplicada; sem header, ou com valor
 *     desconhecido, a versão é v1 (retrocompatibilidade preservada).
 *  3. FAIL-CLOSED — body ausente/primitivo, versão pedida sem schema registrado,
 *     valor que não é schema Zod ou schema que lança durante o parse terminam em
 *     422 com o envelope canônico. Nenhum desses casos pode virar 500.
 *
 * Uso:
 *   const parsed = parseOrReject(req, body, MeuSchema);          // schema único
 *   if (parsed.ok === false) return parsed.response;
 *   return jsonResponse({ ... }, 200, req);  // headers: parsed.headers
 *
 *   const v = parseOrReject(req, body, { v1: SchemaV1, v2: SchemaV2 }); // versionado
 *
 * Convenção de narrowing: use `parsed.ok === false` / `=== true` — a igualdade
 * estreita a union discriminada mesmo com `strictNullChecks` desligado.
 */
import { z, parseBody, validationErrorResponse, type FieldError } from './schemas.ts';
import { getContractVersion, deprecationHeaders, type ContractVersion } from './contracts.ts';

export { z };
export type { ContractVersion, FieldError };

/** Mapa versão→schema aceito pelo modo versionado. */
export interface VersionedSchemas<T1, T2> {
  v1: z.ZodSchema<T1>;
  v2: z.ZodSchema<T2>;
}

/** Schema único (v1) OU o mapa v1/v2 da negociação por header. */
export type SchemaInput<T1, T2 = T1> = z.ZodSchema<T1> | VersionedSchemas<T1, T2>;

export interface ParseOk<T> {
  ok: true;
  data: T;
  /** Versão efetivamente aplicada na validação. */
  version: ContractVersion;
  /** Headers de contrato para a resposta de SUCESSO (x-contract-version (+deprecação)). */
  headers: Record<string, string>;
}

export interface ParseFail {
  ok: false;
  /** Response 422 pronta para devolver — envelope único, já com x-contract-version. */
  response: Response;
  /** Os mesmos campos que o corpo da resposta carrega (para log/telemetria). */
  fields: FieldError[];
}

export type ParseResult<T> = ParseOk<T> | ParseFail;

function isZodSchema(value: unknown): value is z.ZodSchema<unknown> {
  return !!value && typeof (value as { safeParse?: unknown }).safeParse === 'function';
}

/** Headers de contrato de uma resposta de sucesso (x-contract-version + deprecação). */
export function contractHeaders(version: ContractVersion): Record<string, string> {
  return { 'x-contract-version': String(version), ...deprecationHeaders(version) };
}

/**
 * Valida `body` contra `schemas` (único ou v1/v2) e negocia a versão pelo header.
 * Devolve os dados validados (`ok === true`) ou a resposta 422 pronta (`ok === false`).
 */
export function parseOrReject<T1, T2 = T1>(
  req: Request,
  body: unknown,
  schemas: SchemaInput<T1, T2>,
): ParseResult<T1 | T2> {
  const version = getContractVersion(req);
  const schema: z.ZodSchema<T1 | T2> | undefined = isZodSchema(schemas)
    ? (schemas as z.ZodSchema<T1 | T2>)
    : version === 2
      ? (schemas as VersionedSchemas<T1, T2>).v2
      : (schemas as VersionedSchemas<T1, T2>).v1;

  // Registro incompleto (mapa sem a versão pedida) ou valor que não é schema:
  // falta de configuração NUNCA pode lançar — vira 422 no envelope canônico.
  if (!isZodSchema(schema)) {
    const fields: FieldError[] = [{
      path: '(root)',
      message: `contrato sem schema registrado para a versão v${version}`,
      code: 'contract_schema_missing',
    }];
    return { ok: false, response: validationErrorResponse(fields, req, version), fields };
  }

  let parsed: ReturnType<typeof parseBody<T1 | T2>>;
  try {
    parsed = parseBody(schema, body);
  } catch (err) {
    // Schema com `z.custom`/refine que lança: o erro do schema é payload
    // recusado, não falha do servidor.
    const fields: FieldError[] = [{
      path: '(root)',
      message: err instanceof Error ? err.message : String(err),
      code: 'custom',
    }];
    return { ok: false, response: validationErrorResponse(fields, req, version), fields };
  }

  if (parsed.success === false) {
    return { ok: false, response: validationErrorResponse(parsed, req, version), fields: parsed.issues };
  }

  return { ok: true, data: parsed.data, version, headers: contractHeaders(version) };
}
