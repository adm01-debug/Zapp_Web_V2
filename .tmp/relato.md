Especialista: hugo

## O que mudou e por quê
- src/lib/redactPII.ts (novo): `redactPII(texto)` redige e-mail, telefone BR (com/sem `+55`, com/sem separadores), JWT/`Bearer`, valor de `apikey=`/token/secret e segredo longo solto. `redactPIIValue(valor)` repete a redação em objetos e arrays e troca por inteiro o valor de chave sensível (`password`, `token`, `apikey`, `secret`, ...). É o ponto único de redação da área de dados do front.
- src/lib/errorReporter.ts: `message` e `stack` passam por `redactPII` e o objeto inteiro de `details` passa por `redactPIIValue` antes do `logAudit` (ação `client_error`), então nenhum e-mail, telefone ou token chega a `audit_logs`. O `shouldReport` usa a mensagem já redigida: o fingerprint em memória também não guarda o texto cru.
- src/lib/logger.ts: `formatMessage` redige a mensagem e `debug/info/warn/error` redigem os argumentos antes do `console.*` — o console também não mostra PII/segredo.
- src/lib/__tests__/redactPII.test.ts (novo) mais casos novos em `errorReporter.test.ts` e `logger.test.ts`: cobrem os quatro formatos do cartão, o aninhamento em `details`/contexto e a saída do console.

## Prova
- vermelho antes: `npx vitest run src/lib/__tests__/redactPII.test.ts` → `Failed to resolve import "@/lib/redactPII"` / `Test Files 1 failed (1); Tests no tests`
- verde depois: `npx vitest run src/lib/__tests__/redactPII.test.ts src/lib/__tests__/errorReporter.test.ts src/lib/__tests__/logger.test.ts` → `Test Files 3 passed (3); Tests 27 passed (27)`
- regressão nas bordas de erro/log: `npx vitest run src/components/errors src/hooks/system` → `Test Files 14 passed (14); Tests 108 passed | 3 expected fail (111)`
- `zapp-verify --rapido`: verde (rodado no fechar; tipos ok, db_guard ok).
