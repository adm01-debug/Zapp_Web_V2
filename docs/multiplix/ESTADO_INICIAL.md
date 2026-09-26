# Multiplix — Estado Inicial (Fase 0 · E001–E010)

Executado em 26/09/2026, nesta sessão, sobre `main` (`cd67baba70a19b22a7ab3b22334962154b5da08a`).

## E001 — Grafo

`graphify` não está instalado neste container (sessão web). `graphify-out/` não existe no
checkout (consistente com o CLAUDE.md: `graph.json` só existe na VPS). Rebuild pendente via
container `claude-code` (Portainer) antes de usar o grafo para navegar a estrutura do Multiplix.
Não bloqueia o Portão F0 (E001 não está na lista de bloqueantes do plano).

## E002 — PRs abertas (checado agora via `github_list_pull_requests`, state=open)

| PR | Título | Arquivos | Colide com Multiplix? |
|---|---|---|---|
| #809 | dashboard: ranking da aba Equipe respeita o período | `useLeaderboard.ts`, RPC `dashboard_leaderboard` | Não |
| #791 | chore(db): sincronizar artefatos derivados do banco | types-sync automatizado | Não |

Nenhuma toca `talkx-*`, `_shared/`, `src/components/talkx/`, `evolution-webhook` ou
`docs/multiplix/`. Sem colisão com o escopo desta fase. Recheck obrigatório antes de cada branch
nova da Fase 1+ (regra 3 do fluxo Git).

## E007 — Modelo de permissão real (achado, não é a matriz final)

`src/hooks/system/usePermissions.ts` + `supabase/migrations/20251215025014_*.sql`:

- Enum `app_role`: `('admin', 'supervisor', 'agent')` — **sem `special_agent`**, apesar do tipo
  TS em `usePermissions.ts` incluir esse valor (drift entre tipo e enum real, não investigado
  além do necessário aqui).
- Modelo é **role + permissão nomeada**: `user_roles` (role por usuário) → `role_permissions`
  (permissão por role) → `permissions` (catálogo) → RPC `user_has_permission`.
- **Não existe conceito de departamento/carteira no ZAPP.** "Vendedor → carteira",
  "Compras → fornecedores", "Logística → transportadoras" (E015 do plano) só existem hoje do
  lado Singu (`companies.user_id`, `is_supplier`, `is_carrier`).

Implicação para a Fase 1 (E007/E015): o escopo do Multiplix não pode nascer de um "departamento"
que não existe no ZAPP. Proposta objetiva em `docs/multiplix/PERMISSOES.md`.

## E008 / E009 — Capacidades do canal e do TTS

Ver `docs/multiplix/CANAL.md` — tabela completa lida de `talkx-send/index.ts`,
`evolution-go-routes.ts` e `elevenlabs-tts/index.ts`.

## E010 — Tokens e entrada de módulo

Ver `docs/multiplix/DESIGN_TOKENS_MAP.md`. Confirmado: `src/pages/lazyViews.ts` é o único
mecanismo de entrada (`export const XView = lazyWithRetry(() => import(...))`); `TalkXView` já
está cadastrado lá como referência direta a seguir.

---

## Portão F0 — decisões pendentes (🔒 PARA, Joaquim)

Nenhuma DDL ou código de Fase 1+ começa antes destas quatro respostas. Recomendação objetiva em
cada uma — ver mensagem de decisão desta sessão.

- **E003** — caminho de acesso ao banco Singu (edge function com chave de serviço vs. esperar
  banco único).
- **E004** — política numérica do canal não oficial (intervalo entre envios, teto/hora, quando
  uma conexão é "em risco").
- **E005** — regra de "apto" sem dado de consentimento (100% `unknown` hoje no ZAPP).
- **E006** — permitir telefone da empresa como destino quando não há contato pessoa cadastrado
  (754 fornecedores → só 145 com contato; 114 transportadoras → só 76).
