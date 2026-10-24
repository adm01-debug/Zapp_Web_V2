# Armadilhas medidas no harness Playwright do Zapp_Web_V2 (E2E logado)

Regras curtas, cada uma com o sintoma que ela evita. Todas medidas em 02/10/2026 no
workflow `e2e-logado.yml` (id 366552889), projeto `Zapp_Web_V2`, Supabase cloud
`tnnnlkbymytvtqngbbqh`.

## Porta do dev-server

- `playwright.config.ts` fixa `webServer.url = http://localhost:5173` e `command = bun run dev -- --port 5173 --strictPort`.
  Outro chat pode deixar um dev-server vivo nessa porta e a sua corrida morre com
  `http://localhost:5173 is already used`.
  NUNCA mate o processo do outro workspace. Confira antes:
  `ss -ltnp | grep ':5173'` + `ps -o cmd= -p <pid>` — se o caminho for de outro workspace, não é seu.
- Saída: suba o seu próprio server (`bun run dev -- --host 127.0.0.1 --port 5183 --strictPort`,
  em `background=true` — `nohup`/`disown` são recusados pelo wrapper de terminal) e rode o Playwright com
  `PLAYWRIGHT_BASE_URL=http://localhost:5183` (a config lê essa variável em `use.baseURL`).
- `CI=true` no ambiente faz o Playwright exigir o **webServer próprio** (`reuseExistingServer: !process.env.CI`).
  Se você exportou `CI=true` numa chamada anterior, a variável persiste na sessão: rode `unset CI`.
- Ao terminar, mate o SEU server (o `bun run dev` gera um filho `vite` — mate o filho, o pai sozinho não libera a porta).

## Sessão logada (storageState)

- `--project=setup` escreve `e2e/.auth/user.json`; rodar com `--no-deps` nas specs depois,
  senão o setup roda de novo e sobrescreve o que você ajustou.
- O usuário de QA local (`qa.*`) **não** tem linha em `user_settings`, então o `WelcomeModal`
  (overlay `fixed inset-0 z-[9999] backdrop-blur-sm`) abre e intercepta cliques na lista de conversas.
  O usuário do CI (`e2e.zapp@…`) tem a linha e não vê o modal.
  Neutralize no storageState: chave `onboarding_completed_<sub>` = `'true'` na origem do baseURL
  (o `sub` sai do JWT em `localStorage['sb-<ref>-auth-token']`; nunca imprima o token).

## Regras de negócio que derrubam retry

- `close_conversation_atomic` grava em `conversation_closures`, que tem índice único
  `conversation_closures_contact_day_uidx (contact_id, conversation_closure_day(created_at))`
  — **1 encerramento por contato por DIA** (`conversation_closure_day = (created_at AT TIME ZONE 'America/Sao_Paulo')::date`).
  O token do usuário **não** apaga a linha (RLS: `DELETE` devolve 200 e remove 0 linhas — confira com
  `Prefer: return=representation`); o teardown do workflow limpa com `service_role` só **entre runs**.
  Consequência: o retry do Playwright nunca pode passar depois de um encerramento bem-sucedido.
  Um teste de encerramento tem de checar a pré-condição e validar os dois desfechos (encerra ou recusa o duplicado do dia).
- O envio de mensagem é **assíncrono**: a UI chama `POST /rest/v1/rpc/enqueue_outbound_message` (200) e o
  worker da fila grava em `messages` depois. Latência medida: **2,8 s a 8,5 s** (6 envios).
  Assert de "a mensagem apareceu" com o timeout padrão de 5 s falha ~metade das vezes — use ≥20 s.

## Evidência

- O CI **não** publica artefatos do Playwright (repo público + e-mail de QA no relatório).
  Prova vem de: repro local com `--trace on`, parse do trace, leitura do banco de produção (gateway RO) e log do run.
- Trace: `--trace on` grava por contexto (`0-trace.network` costuma vir vazio; o conteúdo está em `1-trace.network`,
  formato `{"type":"resource-snapshot","snapshot":{request:{method,url},response:{status}}}`).
  Parse com `python3` via `terminal` (não existe Python no kernel do `execute_code`).
- Para latência de fila, o texto do teste costuma embutir `Date.now()`: compare com `created_at` da linha em `messages`.
- `gh run view <id> --log-failed` estoura o timeout com facilidade; baixe com `timeout 280 gh run view <id> --log > arq`
  e faça `cut -f3-` antes do grep.
- Log do run diz o **projeto** de cada falha (`1) [webkit-conversation] › e2e/messaging.spec.ts:31`).
  Reproduza no MESMO projeto: `conversation.spec.ts` roda em `chromium-e2e-core`, `messaging.spec.ts` também em `webkit-conversation`.
