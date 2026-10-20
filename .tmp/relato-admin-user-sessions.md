Especialista: worker (auth) (area-auth-seguranca) + worker (auth) (area-edge-api)

# feat(auth): edge `admin-user-sessions` lista e encerra sessões (paridade V3)

Cartão reencaminhado ao workerauth (assunto: sessão/Auth). O corpo pedia `Especialista: edgar`
(boilerplate da triagem); assino como o perfil que o pegou, com as duas áreas que o cartão cruza.

## O que mudou e por quê (arquivo por arquivo)
- `supabase/functions/admin-user-sessions/index.ts` (NOVO, 273 linhas) — a Edge que faltava para a
  paridade. Na V2 só existia "forçar logout" de TODAS as sessões (`ForceLogoutButton` →
  `revoke-auth-sessions` com `scope:"global"`), sem listar nem derrubar UMA sessão específica.
  * `handleAdminUserSessionsRequest` (`index.ts:161`): handler exportado que só aceita POST; identifica o
    chamador pelo JWT (`auth.getUser`, `index.ts:187`), **reconfere o papel `admin` em `user_roles` via
    service role ANTES de qualquer acesso ao esquema auth** (`index.ts:210`) e recusa com 403 quem não é
    admin. Lista (`index.ts:226`) e revoga (`index.ts:239`) pelo endpoint admin do GoTrue.
  * `sanitizeSession` (`index.ts:151`) e `summarizeUserAgent` (`index.ts:99`): a resposta devolve só o
    necessário (id, `created_at`, `last_used_at` = `refreshed_at` ?? `updated_at` ?? `created_at`,
    `not_after`, user agent **resumido** em rótulo fixo "Navegador · SO" e IP). **Nunca o UA cru** — o
    UA completo é fingerprint e não precisa sair do Auth para investigar a origem. **Nenhum** caminho de
    exportar/baixar/copiar payload foi criado; o endpoint só responde JSON à tela de investigação.
  * `createGoTrueSessionsGateway` (`index.ts:122`) + `buildSessionsUrl` (`index.ts:89`): acesso ao
    esquema `auth` pela API admin do GoTrue (`/auth/v1/admin/users/{id}/sessions[/{sid}]`), com a service
    role — o mesmo caminho que as outras edges já usam (`auth.admin.getUserById`).
  * Revogação auditada em `audit_logs` (`index.ts:248`): ator = admin do JWT (`user_id`), `entity_id` =
    sessão, `details.target_user_id` = alvo. A falha da trilha é **LOGADA** (`index.ts:257-259`), nunca
    engolida em silêncio, mas não desfaz a revogação já aplicada.
  * Rate limit chaveado pela **identidade autenticada** (`caller.id`, `index.ts:197`), não por
    `x-forwarded-for` (cabeçalho controlado pelo cliente) — alinha com a armadilha #3 do workerauth.
- `supabase/functions/admin-user-sessions/index.test.ts` (NOVO, 340 linhas) — 16 testes chamando o
  HANDLER real com `Request`, cobrindo os caminhos NEGADOS.
- `supabase/config.toml` — só o bloco `[functions.admin-user-sessions]` (`verify_jwt = true`, default do
  CLI declarado para documentação explícita). Nenhuma outra seção tocada.

## Prova
- vermelho (mutação da guarda do cartão: `role !== "admin"` → `role === "__mutante__"` em `index.ts:210`)
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 --filter "não-admin" supabase/functions/admin-user-sessions/index.test.ts`
  → `FAILED | 0 passed | 1 failed` (`não-admin recebe 403 e o esquema auth NÃO é tocado`).
- verde (mutação revertida, estado do commit)
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/admin-user-sessions/index.test.ts`
  → `ok | 16 passed | 0 failed (57ms)`.
- `deno check --config scripts/ci/deno.json supabase/functions/admin-user-sessions/index.ts` → CHECK_OK.
- (O lint global do editor/tsc mostra ruído pré-existente de `_shared` — import de URL `esm.sh`, `Deno`
  ausente no lib do tsc — que atinge todo `supabase/functions/**`. A checagem que vale nesta área é o
  `deno check`, que passa.)

## CRITÉRIO DE PRONTO — item por item
1. **"Admin investiga e encerra uma sessão específica"** — `action:"list"` devolve as sessões com
   `last_used_at`, `ip` e user agent resumido (`index.ts:151`, testes "admin lista ... 200" e
   "sanitizeSession cai para updated_at ..."); `action:"revoke"` encerra UMA por `session_id`
   (`index.ts:239`, teste "admin encerra uma sessão ... auditada").
2. **"Só admin pelo JWT..."** — papel reconferido em `user_roles` (`index.ts:210`); teste
   "não-admin recebe 403 e o esquema auth NÃO é tocado" prova que o gateway nem é chamado; teste
   "sem linha em user_roles ... 403", "sem header Authorization é 401", "token inválido ... 401".
3. **"Auditoria das revogações"** — `audit_logs.insert` com ator/alvo/sessão (`index.ts:248`); teste
   "admin encerra uma sessão ... auditada" confere a inserção; testes "sessão inexistente (gateway 404)"
   e "falha do gateway (500) vira 502" provam que **não** audita quando o efeito não aconteceu.
4. **"Nenhuma informação é exportada"** — nenhum caminho de download/cópia/impressão; a resposta só
   devolve os campos acima e o UA sai RESUMIDO (teste "summarizeUserAgent resume ... sem vazar o UA").

## O que NÃO fiz e por quê
- **Não liguei a UI** (o corpo cita "adicionar a lista ao painel do AdminV3"): `src/**` **não** está em
  ARQUIVOS QUE PODE TOCAR deste cartão. Deixei o achado em `kanban_comment` para virar cartão de tela
  (worker telas), sem scope-creep.
- **Não regenerei `supabase/deployment-manifest.json`** (derivado): o integrador cuida disso.
- Não toquei banco/migration: a tarefa é Edge; nada de DDL.
