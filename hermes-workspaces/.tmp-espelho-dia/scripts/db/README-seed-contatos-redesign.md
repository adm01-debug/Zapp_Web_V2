# Contatos de teste do redesign (RD-009)

Estes dois arquivos criam contatos de teste SO no banco LOCAL, para avaliar o visual
do modulo Contatos (retrato, iniciais, nome que corta, emoji, [E2E]) sem tocar dado real.

- `seed-contatos-redesign-local.sql` — DML puro (nenhum DDL, nenhuma migration).
- `seed-contatos-redesign-local.sh` — resolve a URL do banco local, recusa producao,
  aplica o `.sql` e confere o criterio de pronto.

## Como usar

```
# dentro da tarefa, com o banco local de pe:
bash scripts/db/seed-contatos-redesign-local.sh

# ou apontando a URL na mao (a senha vai em $SEED_DB_PASSWORD):
bash scripts/db/seed-contatos-redesign-local.sh --url "$SEED_DB_URL"

bash scripts/db/seed-contatos-redesign-local.sh --verificar   # so confere
bash scripts/db/seed-contatos-redesign-local.sh --rollback    # tira os dados de teste
```

## Travas (por que nao vaza para producao)

1. O wrapper recusa qualquer URL com host do Supabase (producao) ou host que nao seja
   `localhost`/`127.0.0.1`/`::1`.
2. O `.sql` exige a marca de sessao `app.zapp_seed_contatos_redesign=on`, que so o
   wrapper liga — rodar `psql -f` num banco qualquer falha de proposito.
3. O `.sql` recusa conexao TCP de fora da rede local.

## O que ele cria

~40 contatos com id deterministico no bloco `d9000000-*` e telefone com prefixo
`5599000`, cobrindo: os 6 tipos canonicos + 1 sem tipo, nomes curtos e de 60+
caracteres, `[E2E]` e emoji, com e sem e-mail, retratos (SVG minusculo embutido em
`data:image/svg+xml;...`, 6 variacoes), 3 com `avatar_url` quebrado e 2 legados (LID,
telefone de 16 digitos).

E idempotente: rodar 2x nao duplica (`ON CONFLICT DO NOTHING` sobre id fixo).

## Rollback

`--rollback` remove apenas os contatos cujo id comeca com `d9000000-`. Manutencao do
fixture local; o Zapp nao tem exclusao em massa de contatos.
