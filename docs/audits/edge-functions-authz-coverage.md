# Cobertura de linhas — helpers de autorização das Edge Functions

Régua N217: a cobertura de linhas agregada dos 5 helpers abaixo não pode ficar abaixo de 50.0% (guarda em `scripts/ci/edge-coverage-authz.unit.mjs`, roda no `node --test`). Medição do zero via deno, sem reaproveitar perfil antigo.

| Arquivo | Linhas cobertas | Total de linhas | Cobertura |
|---|---|---|---|
| ai-auth.ts | 27 | 59 | 45.8% |
| ai-audio-authz.ts | 37 | 54 | 68.5% |
| cron-secret-auth.ts | 48 | 51 | 94.1% |
| evolution-control-authz.ts | 104 | 155 | 67.1% |
| voice-copilot-authz.ts | 25 | 25 | 100.0% |
| **Total** | **241** | **344** | **70.1%** |

Testes medidos (só estes entram no `deno test` da régua):

- `supabase/functions/_shared/__tests__/ai-auth.test.ts`
- `supabase/functions/_shared/__tests__/ai-audio-authz.test.ts`
- `supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts`
- `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`
- `supabase/functions/_shared/__tests__/voice-copilot-authz.test.ts`

Fora da medição de propósito: `supabase/functions/_shared/__tests__/ai-auth-service-path.test.ts` exercita o mesmo `ai-auth.ts` da régua e contaminaria a conta.

Como reproduzir:

```
deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 --coverage=<dir-fresco> \
  supabase/functions/_shared/__tests__/ai-auth.test.ts \
  supabase/functions/_shared/__tests__/ai-audio-authz.test.ts \
  supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts \
  supabase/functions/_shared/__tests__/evolution-control-authz.test.ts \
  supabase/functions/_shared/__tests__/voice-copilot-authz.test.ts \
deno coverage <dir-fresco> --lcov
```
