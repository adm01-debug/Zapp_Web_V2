# Diagnóstico ao vivo — Fase 0 (etapas 01–05)

**Data:** 2026-10-01 · **Base:** `main@547eda6` · **Plano:** `docs/design/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md`

## Estado das etapas

| Etapa | Estado | Evidência |
|---|---|---|
| 01 (a–d) confirmar os 4 achados ao vivo | **BLOQUEADA — Supabase degradado** | Entre 13:40 e 14:05 UTC toda chamada que toca o banco do projeto `tnnnlkbymytvtqngbbqh` ficou sem resposta: MCP `SUPABASE - ZAPP WEB V2` (timeout 60 s em `ping`, `db_query`, `auth_list_users_by_email`); REST `GET /rest/v1/contacts?select=id&limit=1` com anon key > 60 s sem resposta; `POST /auth/v1/token` > 60 s; `GET /auth/v1/health` com apikey > 15 s. O gateway responde (401 em 0,6 s sem apikey; OpenAPI em 0,6 s). `status.supabase.com` em "Partially Degraded Service" (incidente "Intermittent latency in Eastern US", aberto em 29/09, status `identified`). Sem banco não há login, seed da mensagem descartável nem leitura do Esonic. Repetir quando `GET /rest/v1/contacts` voltar a responder em < 2 s. |
| 02 medir larguras reais (4 combinações) | **BLOQUEADA** | Depende de login real (mesma causa). |
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
