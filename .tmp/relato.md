Especialista: Edgar (area-edge-api) — worker (Edge Functions)

Diff: 4 arquivos alterados, 1 arquivo de teste (index.test.ts), 9 testes novos (vermelho antes, verde depois).

## Sensibilidade
- Diff só em `supabase/functions/request-password-reset/` (Edge pública, NOVA) e no registro `[functions.request-password-reset]` de `supabase/config.toml`. Toca `service_role`: o cliente é criado DENTRO do handler e usado só no lookup de `profiles` e no insert de `password_reset_requests`; não é exposto a ninguém.
- Nenhuma proteção afrouxada. `verify_jwt = false` é obrigatório aqui (o visitante está deslogado, sem JWT — é o ponto do cartão) e é o único comportamento novo no config; a RLS/policy da tabela NÃO foi tocada. Casos NEGADOS provados: (a) e-mail inexistente não grava nada e a resposta é idêntica à do existente; (b) acima do limite (por e-mail e por IP) também não grava; (c) payload inválido devolve 422 sem consultar `profiles` nem inserir.
- Nenhuma referência ao banco/endpoint de produção, nenhum deploy/push/login.
- Para quem chama (novo): contrato `{ email, reason? }`, resposta sempre `{ success: true }` com 200 (anti-enumeração). Nada que já existia muda.

## O que mudou e por quê
- `supabase/functions/request-password-reset/index.ts` (NOVO): a Edge pública que faltava para o `/forgot-password`. Hoje o cliente faz, DESLOGADO, select em `profiles` (sem policy para anon) e insert em `password_reset_requests` (o INSERT exige sessão) — em produção a busca volta vazia e nada é gravado, então ninguém consegue pedir redefinição. A Edge move o lookup e o insert para o `service_role` DENTRO da função.
  - Recebe `{ email, reason? }` (zod, 422 canônico via `parseBody`/`validationErrorResponse`). O e-mail é trimado antes do gate e normalizado (caixa baixa).
  - Limite: 3 por e-mail/hora e 10 por IP/hora, medido no próprio `password_reset_requests` (janela de 1 h, `.limit(max)`). O contador falha ABERTO e marca `markDegraded('reset_request_limit_check_unavailable')`, como o limiter da V2: consulta indisponível não derruba pedido legítimo.
  - Anti-enumeração: e-mail existente, inexistente e limite atingido devolvem payload/status IDÊNTICOS. Sem conteúdo pessoal no log — só `errorCodeOf(err)` (código/nome), nunca a mensagem nem e-mail/IP/motivo.
  - Grava `pending` com `user_id`, `email`, motivo truncado em 500, `user_agent` truncado em 500 e IP do cabeçalho (`getClientIP`); `ip_address` fica `null` quando não há cabeçalho. A aprovação do admin (Edge `approve-password-reset`) continua sendo a única porta do link.
- `supabase/config.toml`: registra a função com `verify_jwt = false` (visitante deslogado, sem JWT) — único ponto de configuração.
- `.tmp/relato.md`: este relato (artefato de fechamento versionado no repositório, não é código de produção). Fecha o diff em 4 arquivos: 3 de código/config + 1 de teste.
- `supabase/functions/request-password-reset/index.test.ts` (NOVO): 9 testes rodando o handler REAL com o `fetch` global stubado (o supabase-js passa pelo mesmo `fetch`: `profiles` GET, contagem GET e insert POST em `password_reset_requests`).

## Prova
- vermelho antes: sem o `index.ts` o teste não compila → `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/request-password-reset/index.test.ts` → `TS2307 [ERROR]: Cannot find module '.../request-password-reset/index.ts'` (o defeito é exatamente o handler que não existia).
- verde depois (mesmo comando):
  `ok | 9 passed | 0 failed (37ms)`
  Testes: existente grava e normaliza; inexistente não grava e responde igual; limite por e-mail (3) não grava; limite por IP (10) não grava; borda 2 < 3 ainda grava; motivo > 500 truncado; motivo vazio → null; sem IP → `ip_address` null e sem consulta por IP; payload inválido → 422 sem lookup/insert.

## O que NÃO fiz e por quê
- Não toquei em `ForgotPassword.tsx`/hook: o cartão restringe os arquivos ao diretório da Edge + `config.toml` + teste. O front (V2) ainda faz o insert direto; migrá-lo para esta Edge é outro cartão.
- Não regenerei manifesto de deploy (não é deste cartão; o integrador regenera).
