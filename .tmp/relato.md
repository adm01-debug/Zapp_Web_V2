Especialista: edgar

## Ponto 1 — agulha sem DDD vazava status de outro contato
O que mudei (`supabase/functions/evolution-api/index.ts`): `statusPhoneNeedles` agora só gera variantes COM DDD (com/sem DDI 55, com/sem o 9 extra), cada uma com ≥10 dígitos; a forma local de 8 dígitos foi removida. `statusMatchesPhone` exige candidato com ≥10 dígitos e casa só por `digits.endsWith(needle)` — removido o `needle.endsWith(digits)`, que aceitava candidato curto (ex.: "9"). Sem agulha válida, nada é devolvido (negação por padrão).
Teste que prova (`supabase/functions/evolution-api/index.test.ts`, "PH-03 [refazer1]: status de outro DDD com os mesmos 8 dígitos finais NÃO sai"): contato 5511987654321 (DDD 11) + intruso 5521987654321 (DDD 21, mesmos 8 finais) no mesmo `status@broadcast`; pede o contato e exige 1 registro só dele. Vermelho antes: `FAILED | 0 passed | 1 failed` ("só o status do DDD do contato pedido pode sair" — o intruso saía). Verde depois: o teste passa; suíte completa `ok | 33 passed | 0 failed`.

## Ponto 2 — teste "log sem telefone" (item 4 dos testes)
O que mudei (só teste, mesmo arquivo): "PH-03 [refazer1]: find-status-messages não registra o telefone em console.*" captura `console.log/info/warn/error/debug` durante a chamada real (`handleEvolutionApi` com fake HTTP + client injetado) e afirma que nenhum registro contém os dígitos do contato (forma com e sem DDI 55). Vermelho antes (mutação-prova: `console.log` temporário com o telefone no handler): `FAILED` com "nenhum registro de console pode conter o telefone (5511999999999)". Mutação removida (grep confirma 0 ocorrências); verde depois: o teste passa, `ok | 33 passed | 0 failed` no arquivo.

## Ponto 3 — primeira linha do relato
Feito: a primeira linha deste arquivo é exatamente `Especialista: edgar` (antes era `Especialista: Edgar (area-edge-api) — worker (Edge Functions)`).

## Sincronia com a base do dia (fora dos pontos, sem defeito novo)
`src/hooks/integrations/useWhatsAppStatus.ts` estava na versão da dia/2026-10-13; a dia/2026-10-14 trouxe mudanças da tela WS1 no mesmo arquivo (campo `instanceName`, `resolvedInstance`). Reapliquei essas mudanças e mantive o `number: phone` do contrato deste cartão. Prova: `git diff dia/2026-10-14 -- src/hooks/integrations/useWhatsAppStatus.ts` mostra SÓ a linha do `number`. `bun x vitest run src/hooks/__tests__/useWhatsAppStatus.test.ts` → 12 passed.

## Arquivos (`git diff --name-only 09fe45e2fd...HEAD`)
supabase/functions/evolution-api/index.ts
supabase/functions/evolution-api/index.test.ts
src/hooks/integrations/useWhatsAppStatus.ts
.tmp/relato.md

## Verificação
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 42 passed | 0 failed`
- `bun x vitest run src/hooks/__tests__/useWhatsAppStatus.test.ts` → `Test Files 1 passed (1); Tests 12 passed (12)`
- `zapp-verify <cópia> --rapido` → `VERIFY: VERDE SEM BANCO (77s)` (db_guard/tipos/lint/migrations OK; banco_local AVISO esperado: sem migration no cartão)
- `node --test scripts/ci/evolution-edge-fixes.unit.mjs` → `pass 14; fail 0`
- Sem migration, sem manifesto, sem referência a produção; chamador único do endpoint no app é o hook, que envia `number`.
