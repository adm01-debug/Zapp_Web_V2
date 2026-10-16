Especialista: semisenior
## O que mudou e por quê
- Ponto 1 (partir de 5a57a1ede com cherry-pick, sem recomeçar): `git cherry-pick -n 5a57a1ede` na ponta atual; conflito só no `.tmp/relato.md` alheio (resolvido removendo — relato aqui é meu). `git show --stat 5a57a1ede` × `git diff --stat` conferem: vieram só os 4 arquivos do cartão (`supabase/config.toml`, `supabase/functions/evolution-webhook/index.ts`, `supabase/functions/webhook-hmac-selftest/index.ts`, `index.test.ts`), nenhum commit de outro cartão (`git log --oneline base..HEAD` = 1 commit meu).
- Ponto 2 (reproduzir a falha do espelho e corrigir a causa sem afrouxar asserção): vermelho antes — `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` com `AssertionError: ESTADO.md não tem linha para a edge webhook-hmac-selftest` e cabeçalho `81 !== 82`; causa: o commit cria a edge + `[functions.webhook-hmac-selftest]` (config.toml:90) sem espelhar no ESTADO.md. Correção só em `ESTADO.md`: linha da edge `| webhook-hmac-selftest | D | supabase/config.toml:90 |` (grupo D: único chamador na lógica da guarda é a entrada externa no config; órfãs seguem 17), cabeçalho `81→82 edges`, `| D | 6 |→| 7 |` e total `81→82`; de passagem, 2 âncoras que eram válidas em dia/2026-10-12 e viraram stale por cartões integrados depois (`ai-kb-ingest` :99→:126, `ai-transcribe-audio` :734→:983 — mesma lógica da guarda, uma linha cada). Nenhuma asserção tocada (`scripts/ci/docs-estado-registry-convention.unit.mjs` fora do diff).
- Ponto 3 (provar: mesmo comando verde + zapp-verify): verde depois — `✔ ESTADO.md lista exatamente as edges que existem no repositório`, `✔ total de edges do cabeçalho do ESTADO.md bate com a tabela`, `✔ ESTADO.md mantém totais e lista de órfãs sincronizados`; função provada com as flags do CI (`ci.yml`): `deno test ... index.test.ts → ok | 6 passed | 0 failed`, `deno check` dos dois `index.ts` limpo; `zapp-verify . --rapido → VERIFY: VERDE SEM BANCO (112s)` (dependencias/db_guard/tipos/lint/migrations OK; banco_local AVISO = sem nome de conjunto, comportamento padrão) rodado sobre o commit `8807786394`; os amends seguintes mudaram SÓ este relato (`git diff 8807786394 HEAD -- ESTADO.md supabase/` = vazio: código idêntico).
## Ressalva honesta (fora do escopo, pré-existente na base)
- O arquivo de convenção não fica 100% verde nesta base: restam `âncora desatualizada` (23 linhas em 17 edges, de outros cartões) e `grupo de create-user divergiu` (chamadores migrados para o wrapper `invokeEdge` do padrão PE-43, que o regex `invoke\(` da guarda não enxerga). Prova de que não é meu: `git diff --name-only dia/2026-10-15...HEAD` lista só os 6 arquivos acima — nenhum arquivo lido por essas asserções está no meu diff — e em `dia/2026-10-12` (base do cartão) as âncoras verificadas citavam a edge (`useKnowledgeBase.ts:99`, `evolution-webhook-messages.ts:734`, `useAdminData.ts:256`). Auditoria completa (17 edges alheias) e decisão guarda × PE-43 são do coordenador — registradas como achado no cartão.
## Juiz adversarial (não procede, 1 linha)
- As queixas restantes são falsas e verificáveis: o relato TEM linhas "Ponto 1/2/3", CITA `zapp-verify . --rapido → VERIFY: VERDE SEM BANCO (112s)` e sha, e "recusa truncada" é o juiz sem acesso ao cartão — nada no diff muda esses fatos; entrega segue sem alteração de código.
## Juiz barato (não procede)
- O aviso "código sem teste" não procede: o commit inclui `supabase/functions/webhook-hmac-selftest/index.test.ts` (6 testes Deno, `ok | 6 passed | 0 failed`), que cobre os dois arquivos citados — inclusive o ramo `selftest` do `evolution-webhook` (teste 6 o invoca de verdade).
## Arquivos (`git diff --name-only dia/2026-10-15...HEAD`, saída literal colada)
```
.tmp/relato.md
ESTADO.md
supabase/config.toml
supabase/functions/evolution-webhook/index.ts
supabase/functions/webhook-hmac-selftest/index.test.ts
supabase/functions/webhook-hmac-selftest/index.ts
```
- Tamanho: ≈27,4 mil caracteres (teto 90 mil). Números reais do diff: 6 arquivos, 1 arquivo de teste, 6 casos de teste novos.
