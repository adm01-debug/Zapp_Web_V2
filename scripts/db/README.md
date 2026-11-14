# Seeds locais de banco

Scripts que povoam o banco **LOCAL** com dados de teste para avaliação visual,
sem tocar dado real. Cada seed recusa produção explicitamente.

- `seed-contatos-redesign-local.sh` / `.sql` — contatos de teste do redesign
  (RD-009). Detalhe de uso em `README-seed-contatos-redesign.md`.

```bash
bash scripts/db/seed-contatos-redesign-local.sh              # aplica
bash scripts/db/seed-contatos-redesign-local.sh --verificar  # só confere
bash scripts/db/seed-contatos-redesign-local.sh --rollback   # remove
```
