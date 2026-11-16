# `copilot_presence` — arquivado sem aplicar, 16/11/2026

Último trabalho de banco de outra sessão que estava fora da `main`. A decisão foi
**não aplicar**, e guardar o SQL aqui para que ele não fique só no SHA de uma
branch. O arquivo ao lado é byte a byte o da origem.

- Origem: branch `claude/feat-copilot-radar-20261108-1800`, tip `be78e6cfa7bc0f7f3493449fdb28de086efc66ad`
- Arquivo: `supabase/migrations/20261108180100_copilot_presence.sql` (106 linhas)
- Blob: `35b6d6e7a01887377f954d50deb3db3d6100c5ad` — `git hash-object` do arquivo ao lado bate com o da branch

## O que a migration cria

| Objeto | O que é |
|---|---|
| `public.copilot_presence` | tabela de presença: quem está vendo qual conversa, com TTL de 90 s mantido por upsert periódico do front |
| `idx_copilot_presence_conversation` e `idx_copilot_presence_expires` | 2 índices (o comentário do autor explica por que o filtro de expiração não pode ser predicado de índice: `now()` é VOLATILE) |
| RLS + policies `own_presence` e `service_role_presence` | 2 policies |
| `upsert_copilot_presence(uuid, uuid)` | RPC que grava a presença do usuário autenticado, `GRANT` para `authenticated` |
| `copilot_has_presence(uuid)` | RPC de leitura, `GRANT` para `authenticated` e `service_role` |
| job `pg_cron` | limpeza dos registros expirados a cada 5 min |

A intenção declarada (`CV-142`): o `copilot-live` usaria a presença para não
processar contexto de conversa que ninguém está vendo.

## Por que não foi aplicada

Medido em 16/11/2026, no Supabase oficial `tnnnlkbymytvtqngbbqh`:

```
tabela 0 | rpc 0 | policies 0 | indices 0 | ledger (20261108180100) 0
```

E **nenhum consumidor**, em nenhum lugar: `git grep -il copilot_presence` em
`src/`, `supabase/functions/`, `api/` e `server/` não retorna nada — nem na
`main`, nem na própria branch de origem. Os únicos acertos na branch são
documentos de inventário e o próprio arquivo da migration.

Aplicar criaria em produção uma tabela, duas RPCs com `GRANT` para
`authenticated`, duas policies e um job de `pg_cron` que ninguém chama. Superfície
de banco sem consumidor é superfície morta — e, no caso de duas RPCs executáveis
pelo papel `authenticated`, é também superfície exposta sem necessidade.

O custo de esperar é zero: a migration é aditiva e idempotente (`IF NOT EXISTS`,
`DROP POLICY` antes de `CREATE`, `unschedule` antes de recriar o job).

## O que precisa existir antes de aplicar

1. O código que **escreve** a presença — um upsert periódico no front enquanto a
   conversa está aberta (o TTL de 90 s pressupõe isso).
2. O código que **lê** — a edge `copilot-live` consultando `copilot_has_presence`
   antes de processar contexto.
3. Então, e só então, o fluxo de `docs/agentes/banco.md`: arquivo → PR → merge →
   deploy do código → apply, com versão reservada por
   `supabase_migrations.reserve_migration_version`. **A versão `20261108180100` é
   antiga e não deve ser reusada**; reserve uma nova no momento de aplicar.
