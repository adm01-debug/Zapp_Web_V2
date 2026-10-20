# Recriar o banco local do zero

> Última atualização: 2026-10-09. Usa só o banco local e `supabase/migrations/`.
> Nunca consulta produção.

## Pré-requisitos

- Docker rodando no host.
- Repositório clonado com `supabase/migrations/` presente (782+ migrations).
- Sem necessidade de credenciais de produção.

## 1. Rodar o replay

```bash
bash scripts/db-audit/replay-local.sh
```

O script faz, nesta ordem:

1. **Sobe um container Docker descartável** com a imagem `public.ecr.aws/supabase/postgres:17.6.1.159` (fixada por digest), nome único por run, porta `5499` (ou `REPLAY_PORTA`).
2. **Aguarda o PostgreSQL ficar pronto** (até 90 s).
3. **Executa o bootstrap da plataforma** — cria os objetos que os serviços do Supabase trazem e que as migrations referenciam:
   - Schema `storage` + tabelas `buckets` e `objects` + funções auxiliares (`foldername`, `filename`, `extension`).
   - Schema `supabase_migrations` + tabela `schema_migrations` (registro de versões aplicadas).
   - Colunas de `auth.users` que as migrations esperam (`banned_until`, `banned`, `phone`, `email_confirmed_at`, `last_sign_in_at`, `raw_user_meta_data`).
   - `app.settings.trusted_domains = 'localhost,127.0.0.1'`.
4. **Bloqueia o acesso à produção** dentro do container:
   - Resolve os hostnames do canônico para `127.0.0.1` em `/etc/hosts`.
   - Desliga o agendador de jobs do `pg_cron` (`cron.launch_active_jobs = off`).
5. **Aplica todas as migrations** em ordem alfabética de `supabase/migrations/*.sql`, como usuário `supabase_admin`, gravando o erro ao lado de cada arquivo.
6. **Classifica as falhas** contra o allowlist (`scripts/db-audit/replay-known-failures.json`). Falhas fora do allowlist são drift novo (exit 1); falhas dentro são esperadas (exit 0).
7. **Remove o container** ao final (inclusive em caso de aborto).

## 2. Ler o resultado

```
RESULTADO: N ok, M falha(s) de TOTAL
CLASSIFICACAO: K esperada(s), L INESPERADA(s) de M falha(s)
REPLAY=verde          # exit 0 — nenhuma falha inesperada
```

Saída completa em `replay.log`; falhas nomeadas em `replay-erros.tsv`.

## 3. Referências

- Script: `scripts/db-audit/replay-local.sh`
- Allowlist de falhas esperadas: `scripts/db-audit/replay-known-failures.json`
- Classificador: `scripts/db-audit/replay-classify.py`
- Auditoria das rodadas anteriores: `docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md`