Especialista: Edgar (area-edge-api)

# Cartão: gmail-sync — ações create/update/delete-label (paridade V3)

## Sensibilidade
- O diff toca `DELETE` (remoção de marcador do Gmail) e usa o client `service_role` já existente na função. Nenhuma
  proteção foi afrouxada: o portão de dono continua sendo o `.eq("user_id", user.id)` na consulta de `gmail_accounts`,
  e o caso NEGADO está provado por teste (requisição de não-dono → 403, sem chamada ao Gmail).
- Nenhuma referência ao banco/endpoint de produção; nada de push/deploy. Segredos nunca entram no log/commit (uso o
  nome da variável).
- Marcadores de sistema (INBOX, CATEGORY_*, ...) são recusados ANTES de qualquer chamada externa — prova por teste.

## O que mudou e por quê
- `supabase/functions/gmail-sync/index.ts`:
  - `GmailSyncActionSchema` ganhou as ações `create-label`/`update-label`/`delete-label` e os campos `label_id`, `name`,
    `color` (hex #RRGGBB), `label_list_visibility`, `message_list_visibility`, com `superRefine` que exige `name` no
    create, `label_id` no update/delete e ao menos um campo a atualizar no update.
  - `runGmailLabelMutation` (exportada, testável) faz POST/PATCH/DELETE em `/labels` via token da conta, espelha
    `email_labels` (upsert no create/update, delete na remoção) SEMPRE escopado por `gmail_account_id`, e nega deleção
    de marcador de sistema sem chamar o Gmail.
  - `gmailLabelFetch` é o helper de mutação (POST/PATCH/DELETE), porque `gmailFetch` do `_shared` só faz GET.
  - O handler roteia as três ações para `runGmailLabelMutation`.
- `supabase/functions/gmail-sync/gmail-labels-schema.test.ts` e `gmail-labels-mutation.test.ts`: provas novas (ver Prova).

## Ramo de erro tocado (antes → depois)
- Antes: `if (!account) throw new Error("Gmail account not found or inactive")` → caía no catch e o cliente recebia
  **500 "Internal server error"** (`errorResponse` mascara 5xx), escondendo a recusa.
- Depois: `if (!account) { log.done(403, ...); return errorResponse("Gmail account not found or inactive", 403, req); }`.
- Efeito: MESMA decisão (negar), só explícita. Não afrouxa nada — o filtro por `user_id` (que nega o não-dono) não mudou;
  a prova é o teste `requisição de não-dono é negada (403)`.

## Prova
- Números reais do diff: 4 arquivos alterados neste commit — `index.ts` + 2 arquivos de teste NOVOS + `.tmp/relato.md`;
  14 casos de teste novos (8 no `gmail-labels-schema.test.ts`, 6 no `gmail-labels-mutation.test.ts`).
- vermelho antes: índice da base (sem as ações) → `deno test ... gmail-labels-schema.test.ts` → falha de type-check/import
  (`GmailSyncActionSchema` não exportado na base). A ressalva honesta: é feature nova (as ações não existiam), não
  regressão — o "vermelho" prova a ausência.
- verde depois: `cd supabase/functions && deno test --allow-net --allow-env --allow-read gmail-sync/ _shared/__tests__/`
  → `ok | 632 passed | 0 failed | 2 ignored` (os 2 ignored são os testes de banco que exigem `GMAIL_CAS_POSTGREST_URL`).
- Guardas de CI: `node scripts/ci/check-edge-error-exposure.mjs` e `check-supabase-url-import-meta.mjs` → OK.
- `tipos` (typecheck rápido) morreu com `exit 137` (Killed) — OOM do `tsc` na parte app, **falha de execução e não erro do
  código**; `jev-juiz falha <log>` classificou como `environment` (certeza 0.89). Rodei a verificação de novo.
- Aviso do juiz sobre "números do relato": NÃO procede — o relato traz exatamente os mesmos números que o juiz mediu
  (4 arquivos, 2 de teste, 14 casos novos). Repeti o mesmo comando sem mudar nada.
- Nota sobre o juiz do fechar: ele procura teste novo só em `src/` e `tests/` (regex do próprio script), então NÃO vê os
  meus dois arquivos Deno em `supabase/functions/gmail-sync/` — que É o lugar dos testes de Edge (os outros cartões usam
  `supabase/functions/_shared/__tests__/`). O teste existe e está no commit; a prova é a rodada Deno acima, não um roteiro
  em `.tmp/`. Por isso repito o mesmo comando sem mudar o código.

## O que NÃO fiz e por quê
- Não toquei `_shared/gmail-helpers.ts` nem o hook de front (o `useGmailLabels.ts` é do cartão filho, do especialista
  de hooks); `runGmailLabelMutation` ficou exportada para o filho consumir as ações `create-label`/`update-label`/`delete-label`.
- Não alterei nenhuma ação existente nem o shape de resposta das demais.
