Especialista: senior (area-edge-api)

Ponto 1 — a edge webhook-hmac-selftest só pode ser usada por admin autenticado, sem vazar segredo.
O que mudei: adicionei supabase/functions/webhook-hmac-selftest/index.ts com validação do JWT recebido pelo verify_jwt, leitura do perfil via Supabase Auth/Admin e exigência de papel admin; o resultado de auditoria só expõe flags/HTTP status, nunca o valor do segredo. Também declarei a edge em supabase/config.toml com verify_jwt=true.
Teste que prova: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/webhook-hmac-selftest/index.test.ts — verde, 6 passed / 0 failed. Os testes cobrem admin autorizado, agente/supervisor sem admin 403, ausência de sessão 401, segredo ausente sem falso sucesso e o caminho real da evolution-webhook.

Ponto 2 — a evolution-webhook precisa aceitar o evento sintético assinado e recusar a mesma sonda sem assinatura.
O que mudei: em supabase/functions/evolution-webhook/index.ts acrescentei o evento selftest como ACK curto depois da validação HMAC existente, sem processar mensagem real nem alterar outros eventos.
Teste que prova: no mesmo deno test, o caso "evolution-webhook: evento selftest assinado é ACKado (200+selftest) e sem assinatura é recusado (401)" passou verde.

Ponto 3 — [refazer 2] a edge nova quebrava o espelho de documentação/CI porque não aparecia no ESTADO.md.
O que mudei: atualizei ESTADO.md para 82 edges, grupo D=7, total=82, e incluí webhook-hmac-selftest com âncora supabase/config.toml:90. Não alterei FEATURE_REGISTRY nem outras listas.
Teste que prova: antes da correção rodei node --test scripts/ci/docs-estado-registry-convention.unit.mjs e ele saiu 1; depois da correção o mesmo comando ficou verde: 11 tests, 11 pass, 0 fail.

Arquivos alterados (git diff --name-only dia/2026-10-13...HEAD após o commit):
.tmp/relato.md
ESTADO.md
supabase/config.toml
supabase/functions/evolution-webhook/index.ts
supabase/functions/webhook-hmac-selftest/index.test.ts
supabase/functions/webhook-hmac-selftest/index.ts

Verificações rodadas:
- deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/webhook-hmac-selftest/index.test.ts — ok | 6 passed | 0 failed.
- node --test scripts/ci/docs-estado-registry-convention.unit.mjs — ok | 11 passed | 0 failed.
- zapp-verify . --rapido — VERIFY: VERDE SEM BANCO (56s); db_guard, tipos, lint e migrations verdes; banco local não verificado por falta de nome de conjunto.
- zapp-verify full . — tentei conforme critério; passou por db_guard/tipos/lint/migrations e entrou em testes, mas a suíte global falhou fora do escopo em src/components/talkx/__tests__/RuleValueInput.test.tsx ("Lead score e Risco de churn ficam desabilitados no catálogo"), 1 failed | 1314 passed. Não mexi em TalkX nem nesse teste.

Autorrevisão:
- Não há migration, transação nem rollback neste cartão.
- A edge nova exige JWT/admin por padrão e não usa caminho opcional permissivo.
- O segredo HMAC não entra no payload de resposta nem no registro de auditoria do teste.
- A mudança na evolution-webhook é limitada ao evento selftest e retorna antes do processamento normal.
- O único arquivo fora da lista original é ESTADO.md, incluído só para resolver a recusa do refazer 2 e o gate que lista exatamente as edges existentes.
