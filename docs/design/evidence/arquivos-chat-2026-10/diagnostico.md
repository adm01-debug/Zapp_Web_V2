# Diagnóstico ao vivo — Fase 0 (etapas 01–05)

**Data:** 2026-10-01 · **Base:** `main@547eda6` · **Plano:** `docs/design/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md`

## Estado das etapas

| Etapa | Estado | Evidência |
|---|---|---|
| 01 (a–d) confirmar os 4 achados ao vivo | **BLOQUEADA — Supabase degradado (13:40–14:40 UTC); 2ª tentativa às 14:45 bloqueada pelo sandbox** | Entre 13:40 e 14:05 UTC toda chamada que toca o banco do projeto `tnnnlkbymytvtqngbbqh` ficou sem resposta: MCP `SUPABASE - ZAPP WEB V2` (timeout 60 s em `ping`, `db_query`, `auth_list_users_by_email`); REST `GET /rest/v1/contacts?select=id&limit=1` com anon key > 60 s sem resposta; `POST /auth/v1/token` > 60 s; `GET /auth/v1/health` com apikey > 15 s. O gateway responde (401 em 0,6 s sem apikey; OpenAPI em 0,6 s). `status.supabase.com` em "Partially Degraded Service" (incidente "Intermittent latency in Eastern US", aberto em 29/09, status `identified`). Sem banco não há login, seed da mensagem descartável nem leitura do Esonic. Repetir quando `GET /rest/v1/contacts` voltar a responder em < 2 s. |
| 02 medir larguras reais (4 combinações) | **BLOQUEADA** | Mesma causa da 01; o script da 2ª tentativa já mede as 4 combinações (`sidebar` via "Recolher/Expandir menu", detalhes via "Detalhes do contato"). |
| 03 decisões registradas | **cumprida** | Seção 5 do plano, D1–D4 sem pendência. |
| 04 matriz de preservação | **cumprida** | `matriz-preservacao.md` (ao lado). |
| 05 PRs abertas × arquivos da aba | **cumprida — sem sobreposição** | 11 PRs abertas em 01/10 14:00 UTC (#1153, #1206, #1333, #1343, #1354, #1355, #1379, #1384, #1389, #1391, #1392); nenhuma toca `src/components/inbox/tabs/`, `src/hooks/chat/useContactMedia.ts` ou `src/components/inbox/media-gallery/`. A mais próxima (#1355) toca `src/components/inbox/contact-details/` e `src/components/contacts/` — sem conflito de arquivo. |

## O que já está confirmado por código (não substitui o ao vivo)

- G1 Encaminhar é stub: `FilesTab.tsx:162` passa `onForward={() => {}}`.
- G3 Apagadas voltam: `useContactMedia.ts:53-57` seleciona sem filtro de `is_deleted` e com `limit(200)`; `FileCard.tsx:41` só marca `is_deleted = true`.
- G4 Copiar link entrega a URL assinada: `FileCard.tsx:28` e `FileDetailPanel.tsx:25` escrevem `resolvedUrl || item.url` no clipboard.
- G5 Uma assinatura por card: cada `FileCard` e o `FileDetailPanel` chamam `useResolvedStorageUrl(item.url)` individualmente.

## Efeito colateral observado da degradação (mesmo dia)

- `E2E Talk X (PR)` e `E2E logado` falhando em `e2e/auth.setup.ts:34` (30 s sem `#main-navigation`) em branches não relacionadas, e teardown do `E2E logado` levando 90 s e falhando (`run 36869085242`). Não é regressão de código.

## 2ª tentativa (14:40–14:50 UTC) — banco de volta, bloqueio no sandbox

- Banco voltou a responder às 14:40 (REST `contacts` 1,6 s; `auth/v1/health` 200; MCP `ping` 3,4 s). Usuário E2E (`e2e.zapp@promobrindes.com.br`) logou no CI às 14:41 — o `E2E logado` da `main` voltou a passar.
- Preparado o caminho sem senha: sessão do usuário E2E via `auth_generate_link` (magiclink) + `POST /auth/v1/verify` com o OTP, injetada em `localStorage` (`sb-tnnnlkbymytvtqngbbqh-auth-token`) num Chromium local do Playwright 1.56 (viewport 1920×1080). Script em `scratchpad/pw/fase0.mjs` da sessão (não versionado): 01(b) conta requisições `/storage/v1/object/sign/` ao abrir Arquivos do Esonic; 01(d) "Copiar link" + `GET` anônimo; 01(c) Encaminhar → `[E2E]` → confirmar; 02 larguras nas 4 combinações; 01(a) exclusão da mensagem descartável.
- Mensagem descartável semeada (`messages.id a06f474d-…`, `sender='agent'`, objeto `whatsapp-media/04dff4dc-…/fase0-diag-20261001-descartavel.png`) ao fim da tentativa o objeto foi removido da Storage e a linha ficou **soft-deleted** (`is_deleted = true`, `content = '[Mensagem apagada]'`, igual ao que a UI faz) — o `DELETE` físico da linha **falhou** (ver achado abaixo).
- **Bloqueio:** o sandbox desta sessão só sai para a internet por um proxy com CA própria; o Chromium recusou `https://zapp-web-v2.vercel.app` (`ERR_CERT_AUTHORITY_INVALID`) e a execução com `ignoreHTTPSErrors`/proxy foi negada pela política da sessão (classificador de dados pessoais). Não há como executar o browser logado em produção a partir daqui. Caminho viável: rodar o mesmo script no container `claude-code` da VPS (sem o proxy) ou como job `workflow_dispatch` reutilizando `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`.

## Achado novo durante a preparação (entra no plano)

- **Mídia recebida do Esonic não fica na pasta do contato:** `media_url` real é `.../whatsapp-media/image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg` — pasta `image/`, não `<contactId>/`. A policy de SELECT do bucket só autoriza por pasta do contato ou `is_admin_or_supervisor`; logo um atendente **não supervisor** não consegue assinar/ver mídia recebida pelo WhatsApp (só a que ele mesmo enviou). Impacto no plano: a etapa 36 (cópia para `<destinoId>/`) está correta por isso mesmo, e a etapa 39 precisa de um caso "origem em pasta `image/`"; o `supabase/functions/_shared/evolution-media.ts` é quem grava em `image/` — conferir antes de assumir que G5/G4 se comportam igual para mídia enviada e recebida.

## Achado novo (fora do escopo do plano, vai para "Próximos passos")

- **`DELETE` em `public.messages` falha em produção:** `delete from messages where id = …` devolveu `42P10: cannot update table "talkx_recipients" — Column list used by the publication does not cover the replica identity`. A FK de `talkx_recipients` para `messages` dispara um `UPDATE` em `talkx_recipients`, e essa tabela está com `REPLICA IDENTITY FULL` (`relreplident = 'f'`) enquanto a publication `supabase_realtime` a publica com **lista de colunas** — combinação que o Postgres rejeita em todo `UPDATE`/`DELETE`. Consequência provável: qualquer `UPDATE` em `talkx_recipients` (status de envio das campanhas) também falha. Confirmar com o dono do Talk X antes de mexer; correção típica é `ALTER TABLE talkx_recipients REPLICA IDENTITY DEFAULT` ou publicar a tabela sem lista de colunas — DDL, logo migration + regra 6.
