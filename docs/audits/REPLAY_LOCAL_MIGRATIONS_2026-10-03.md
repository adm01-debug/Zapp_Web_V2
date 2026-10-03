# Replay local das migrations — E24 (2026-10-03)

Item do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`: *"Replay integral das migrations — job (ou doc de
execução local) com replay verde ponta a ponta"* e *"divergências viram exceção documentada ou fix"*.

**Banco canônico não foi tocado.** O replay roda em container Docker descartável, criado e removido
pelo próprio script.

## Como rodar

```bash
bash scripts/db-audit/replay-local.sh
```

Sobe `public.ecr.aws/supabase/postgres:17.6.1.159` (a imagem traz roles, `auth` e as extensões),
aplica `supabase/migrations/*.sql` em ordem por `psql -v ON_ERROR_STOP=1`, e reporta
`ok/falha` por arquivo. Container próprio (`hermes-e24-replay`), porta 5499, removido no fim.

## Resultado medido (2026-10-03)

| | |
|---|---|
| Migrations no repo | **765** (o plano dizia 443 — quase dobrou) |
| Aplicadas com sucesso | **695** |
| Falhas | **70** |

## Classificação das 70 falhas

**Nenhuma delas, até agora, é divergência do repositório.** A esmagadora maioria é lacuna do
container local, e a distribuição prova:

| Erro | Nº | Natureza |
|---|---|---|
| `relation "storage.objects"/"storage.buckets" does not exist` | **35** | **Lacuna do harness.** O schema `storage` é criado pelos serviços do Supabase (Storage API), não pelo Postgres. O container não o tem. |
| `relation "public.X" does not exist` | 7 | **Cascata** — depende de objeto de uma migration que já falhou por lacuna acima. |
| `already member of publication "supabase_realtime"` | 3 | **Idempotência esperada** — a imagem já traz a publicação com esses membros. Não é erro de migration. |
| `schema "supabase_migrations" does not exist` | 2 | **Lacuna do harness** — schema do CLI do Supabase. |
| `cannot change return type of existing function` | **4** | **Precisa inspeção** — pode ser ordem de aplicação ou divergência real; sozinho, não se conclui. |
| `syntax error at or near` | **3** | **Precisa inspeção** — idem. |
| outros (cascata de função/tabela) | ~16 | Cascata. |

### Primeira tentativa (registrada por honestidade)

A tentativa 1 usou um banco **vazio** (`POSTGRES_DB=replay`): **28 ok / 737 falhas**. O log trouxe a
prova de que o erro era do harness, não do repo — `can only create extension in database postgres`.
Usar o banco `postgres` da imagem (que tem o bootstrap) levou de 28 para **695 ok**. Fica registrado
porque um número desses, lido sem contexto, viraria um alarme falso sobre a saúde das migrations.

## O que falta para "verde ponta a ponta"

1. **Bootstrap do schema `storage`** antes do loop (as tabelas `storage.objects`/`storage.buckets` e
   o schema `supabase_migrations`) — resolve ~37 das 70.
2. **Inspecionar as 7 de `cannot change return type` e `syntax error`** — são as únicas candidatas a
   divergência real; 4+3 é o universo a olhar.
3. Reavaliar: com 1 e 2 feitos, o replay deve chegar a ~765/765 ou a um conjunto pequeno e nomeado de
   exceções.

## Limites declarados

- **Isto não é replay no Supabase de verdade.** Faltam os serviços (Storage, Auth, Realtime), então
  migrations que dependem deles não são exercidas de forma completa.
- O alvo de "443 migrations" do plano está desatualizado: são **765** arquivos hoje.
