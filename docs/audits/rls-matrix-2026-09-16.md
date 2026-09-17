# Matriz RLS — 2026-09-16 (E24)

Verificação ao vivo contra o banco canônico (`tnnnlkbymytvtqngbbqh`), todas as 144
relações `relkind='r'` do schema `public`.

## Resumo

| Estado | Contagem |
|---|---|
| RLS habilitado | 144 / 144 (100%) |
| RLS habilitado com `FORCE ROW LEVEL SECURITY` | 0 |
| RLS habilitado, 0 policies (deny-by-default para todos os roles) | 4 |
| RLS desabilitado | 0 |

Nenhuma tabela está com RLS desabilitado. Nenhuma anomalia do tipo "RLS on
com `USING (true)` para `anon`" foi encontrada — todas as policies das 140
tabelas restantes exigem `auth.uid()` (via `is_admin_or_supervisor`,
`get_visible_agent_ids`, `created_by = ...`, etc.) ou papel `authenticated`
explícito.

## As 4 tabelas com RLS habilitado e zero policies

RLS com zero policies nega leitura/escrita a **qualquer** role via
PostgREST, inclusive `authenticated` — só `service_role` (que faz bypass de
RLS) consegue acessar. As 4 abaixo são **intencionais e documentadas**, não
bugs:

| Tabela | `anon` tem GRANT de tabela? | Motivo |
|---|---|---|
| `edge_rate_limits` | Não | Infra interna do limiter (`consume_rate_limit`, migration `20260905020000`); contador de rate limit não deve ser legível/editável por ninguém além do worker de service_role. |
| `talkx_links` | Sim (grant de schema, mas RLS bloqueia) | E90: acessada só via `record_talkx_link_click()` (`SECURITY DEFINER`) chamada pela edge function `talkx-link` com service_role. Nenhum fluxo do front lê a tabela diretamente. |
| `talkx_link_clicks` | Sim (idem) | Idem — só a mesma RPC grava; nenhuma leitura direta do front. |
| `talkx_conversions` | Sim (idem) | Idem — só o handler `POST /convert` de `talkx-link` grava, via service_role. |

O `GRANT` de schema para `anon` nas 3 tabelas E90 é o comportamento padrão
do Supabase (grant automático a `anon`/`authenticated` na criação do
objeto, que `REVOKE ALL ... FROM PUBLIC` não desfaz — o mesmo gotcha
corrigido 4x nesta sessão para funções). Não é explorável aqui porque RLS
com zero policies já nega qualquer linha, independente do GRANT de tabela
existir. Ainda assim, para consistência com o padrão já aplicado às
funções, uma migration de hardening cosmético (`REVOKE ALL ... FROM anon,
authenticated` explícito nas 3 tabelas) fecha a superfície por completo —
não é urgente (RLS já bloqueia), mas fica registrado como melhoria de
defesa em profundidade.

## Como regenerar

```sql
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       COALESCE(pc.n_policies, 0) AS n_policies,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_table_select_grant
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT tablename, count(*) AS n_policies
  FROM pg_policies WHERE schemaname='public'
  GROUP BY tablename
) pc ON pc.tablename = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY (c.relrowsecurity AND COALESCE(pc.n_policies,0) = 0) DESC, c.relname;
```
