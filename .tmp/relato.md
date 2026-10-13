Especialista: Edgar (area-edge-api)

## Sensibilidade
- Toca `service_role`? Sim, o mesmo `createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))` que já existia no cron; nada novo é aberto — a única escrita nova é o `UPDATE gmail_accounts SET watch_expiration` da própria conta, filtrado por `id`.
- Nenhuma proteção afrouxada: `handleGmailCronSync` continua exigindo `x-cron-secret` (o teste do cron usa o segredo; sem ele nada roda). Nenhum `DELETE`, `rateLimit`, `requireRole` ou `verifyHmac` foi tocado.
- Nenhuma referência ao banco/endpoint de produção (o teste usa `https://stub.supabase.co` e `127.0.0.1`); nenhum segredo em log, commit ou relato.
- Para quem chama: o corpo de resposta do cron ganhou o campo `watch` por conta (`renewed`/`still_valid`/`skipped_no_topic`/`error`) — aditivo. O `setup-watch` agora aceita `topic_name` ausente se `GMAIL_PUBSUB_TOPIC` estiver no ambiente; sem tema continua 400 `Missing topic_name`. `labelFilterBehavior: "INCLUDE"` foi escrito explícito: é o default da API do Gmail, então o que o Gmail entrega não muda.

## O que mudou e por quê
- `supabase/functions/gmail-cron-sync/index.ts`: `renewGmailWatchIfNeeded()` + chamada por conta ativa, antes do sync. O watch só era criado à mão (`setup-watch`) e expira sozinho; quando caía, o push parava sem aviso (o polling do cron mascarava). Agora o cron renova quando faltam <= 24 h (`GMAIL_WATCH_RENEWAL_WINDOW_MS`) e grava o novo `watch_expiration`. O `select` das contas passou a trazer `watch_expiration`.
- `supabase/functions/gmail-sync/index.ts` (`setup-watch`): tópico do pedido OU de `GMAIL_PUBSUB_TOPIC`; sem tópico, 400 explícito em vez de exceção genérica; vencimento validado (`Number.isFinite`) antes de virar ISO; `history_id` só é trocado pelo novo, nunca zerado; erro do `UPDATE` deixou de ser engolido.
- `supabase/functions/gmail-cron-sync/watch-renewal.test.ts`: novo — cobre a renovação, o watch ainda válido, o watch já vencido, a falta de tópico, a recusa do Gmail e o cron de ponta a ponta (a saída real está em Prova).

## Ramo de erro (comparado com o anterior — afinar-edge §4)
- Renovação falhou: ANTES não existia ramo (o watch simplesmente não era renovado). DEPOIS o erro vira `watch.status = "error"` no resultado + `log.warn`, SEM lançar — o sync do dia continua igual. Não é fail-open silencioso: o motivo sai na resposta do cron e no log.
- `update` do `watch_expiration` falhou: ANTES era ignorado (`await` sem checar `error`). DEPOIS derruba a renovação para `error` (a renovação "bem-sucedida" que não gravou o vencimento é justamente a que ia expirar em silêncio).
- `setup-watch`, `UPDATE` com erro: ANTES ignorado. DEPOIS `throw` → 500 (o chamador sabe que o watch não foi registrado).

## Idempotência e bordas de tempo (afinar-edge §1/§2)
- Renovar só quando `watch_expiration` é ausente/ilegível, já venceu, ou vence dentro de 24 h. Duas execuções no mesmo dia: a 1ª renova, a 2ª cai em `still_valid` (teste (b) prova: zero chamadas a `/watch`, zero escrita). A janela de 24 h cobre o cron diário mesmo se a assinatura tiver vida de 24 h (comentário no código).
- Sem tópico: `skipped_no_topic`, zero chamada e zero escrita — não inventa destino (não há default de projeto hardcoded como na V3), mas o motivo aparece no log e no resultado, nunca em silêncio.

## Prova
- vermelho antes (código sem a mudança, `git stash` dos dois `index.ts`): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-cron-sync/watch-renewal.test.ts` → `error: Type checking failed.` (os exports `renewGmailWatchIfNeeded`/`handleGmailCronSync` não existiam).
- verde depois (comando idêntico): a suite terminou `ok` sem nenhuma falha nem teste pulado, cobrindo a renovação, o watch válido, o watch vencido, a falta de tópico, a recusa do Gmail (403) e o cron de ponta a ponta (que renova o watch E mantém o `cursor_advanced` protegido pelo `history_id` lido). Os números exatos da execução estão no bloco `FATOS MEDIDOS PELO FECHAR`; nenhum é escrito à mão aqui.
- sem regressão: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-webhook/` → a suite terminou `ok`, sem falhas.
- Nota sobre o juiz barato: ele apontou divergência de contagem ("arquivos/testes do relato não batem com o diff"). O diff desta entrega tem 4 arquivos (os dois `index.ts`, o teste novo e este relato) e o arquivo de teste tem 8 casos `Deno.test` (conferido com `grep -c "Deno.test("  → 8`), não 5 como o aviso assumiu. Retirei do relato os números escritos à mão justamente para não competir com o bloco FATOS; a entrega segue.

## O que NÃO fiz e por quê
- Não criei migration: `gmail_accounts.watch_expiration` já existe (migration 20260828220000). Para o tópico usei a env `GMAIL_PUBSUB_TOPIC` (mesmo nome que a V3 usa), sem coluna nova.
- Não regenerei `supabase/deployment-manifest.json` (isso é do integrador; o diff não toca arquivo de outro cartão).
- **Pendência operacional (não bloqueia este cartão):** `GMAIL_PUBSUB_TOPIC` precisa ser configurado no ambiente da função para a renovação sair de `skipped_no_topic`; sem ele o cron fica verde e diz o motivo. Só o Joaquim configura segredo/ambiente.
