// Bloco 5 / etapa 046 — leitura do env do processo para o registry.
//
// Arquivo proprio de proposito: `registry.ts` e `fake/index.ts` ambos precisam
// ler o env, e se qualquer um dos dois importasse o outro nasceria um ciclo.
//
// O leitor nao assume `Deno`: este modulo tambem e carregado por teste em Node
// (o kernel de mensageria tem o mesmo cuidado). Sem `Deno`, o env sai VAZIO — e
// env vazio significa provedor padrao (`evolution`) e nenhum override de teste,
// que e o comportamento seguro.

/** Env relevante para a resolucao de provedor. */
export interface ProviderEnv {
  /** `test` habilita o provedor falso e o override de teste. */
  DENO_ENV?: string;
  /** Knob do V3: forca o provedor da suite. So vale com `DENO_ENV=test`. */
  PROVIDER_UNDER_TEST?: string;
}

interface DenoLike {
  env?: { get(name: string): string | undefined };
}

function denoEnv(): { get(name: string): string | undefined } | undefined {
  const deno = (globalThis as { Deno?: DenoLike }).Deno;
  return deno?.env;
}

/** Le o env do processo AGORA (sem cache: a suite troca o valor entre testes). */
export function readProviderEnv(): ProviderEnv {
  const env = denoEnv();
  return {
    DENO_ENV: env?.get("DENO_ENV"),
    PROVIDER_UNDER_TEST: env?.get("PROVIDER_UNDER_TEST"),
  };
}
