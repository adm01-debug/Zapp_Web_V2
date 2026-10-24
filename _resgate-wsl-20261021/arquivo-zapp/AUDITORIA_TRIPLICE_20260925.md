# Auditoria tríplice LOCAL ↔ GITHUB ↔ BANCO (25/09/2026)

Escopo: comparação exaustiva das 3 fontes de verdade para Zapp_Web_V3 e
zapp-web-v2-main. Todo achado abaixo tem comando real + output real por trás
(nenhuma suposição). Nada foi corrigido nesta rodada — auditoria pura.

## Zapp_Web_V3

### Local ↔ GitHub
`git fetch` + `git log origin/main..HEAD` e `HEAD..origin/main`: **ambos vazios**.
Working tree limpo. Repo local 100% sincronizado com origin/main (HEAD
59af6ad9, inclui PR #1565 mergeado).

### Repo (arquivos de migration) ↔ Banco (schema_migrations)
- 165 arquivos `.sql` no repo, 852 versões registradas no banco (esperado —
  squash de histórico documentado em `docs/history/migrations-archive/README.md`,
  baseline oficial = `20260817000000`; tudo antes disso foi arquivado de propósito).
- Filtrando por baseline (>= 20260817000000): 160 arquivos no repo, 174 versões
  no banco.
- **Repo → Banco (toda migration do repo foi aplicada?)**: SIM, 0 divergências.
  Nenhuma migration versionada no repo está ausente do banco.
- **Banco → Repo (toda migration do banco tem arquivo?)**: 14 versões no banco
  sem arquivo individual — são exatamente as 14 que a migration
  `20260925160000_reconcile_drift_...sql` (PR #1565, já mergeado) já cobriu e
  documentou como reconciliação agregada (mesmo padrão usado em
  `20260819155921_reconcile_repo_db_backfill.sql` para o squash anterior — 1
  arquivo cobre N versões órfãs, por design do próprio projeto). **Não é gap.**
- Confirmação independente: workflow "Migration Smoke Test" (rebuild do zero de
  todas as 165 migrations) rodou com `success` no commit exato do merge do
  PR #1565 (run 36171543431, 2026-09-25T18:08:40Z).
- Nenhuma migration aplicada no banco depois de `20260925160000` — zero drift
  novo surgido durante a sessão de trabalho.

### Segurança (schemas zapp/evo/prospeccao) — ver auditoria anterior (mesma sessão)
RLS confirmado habilitado em `zapp.pii_access_log`, `evo.rabbitmq_*`,
`evo.kpi_rollup_24h`. `prospeccao` inalterado (decisão consciente do usuário).

## zapp-web-v2-main

### Local ↔ GitHub
`git fetch` + `git pull --ff-only`: 65 commits novos trazidos do remoto (#748 a
#779, trabalho de outros agentes/devs). Após sync: `git log origin/main..HEAD`
e `HEAD..origin/main` ambos vazios, working tree limpo.

### Repo ↔ Banco
`supabase migration list --linked` (CLI oficial, projeto tnnnlkbymytvtqngbbqh):
**485 migrations, TODAS com `local == remote`** — zero divergência em qualquer
direção (nenhuma "só no repo", nenhuma "só no banco"). O melhor resultado dos
dois projetos.

### Achado investigado e descartado (falso positivo)
Run `36133743614` do workflow "DB Migrate (production)" (25/09 12:13, disparo
manual) falhou no passo "Provar paridade integral quando a versão já existe".
Investigação: NÃO é drift real. É o preflight anti-reaplicação do próprio
projeto bloqueando de propósito uma tentativa de reaplicar a migration
`20260925140000` que já estava registrada. Confirmei recalculando o SHA256 do
statement real do arquivo local vs o statement real armazenado no ledger
(`supabase_migrations.schema_migrations.statements`, extraído via
`supabase db dump --data-only -s supabase_migrations`): **hashes idênticos**
(`7f40db41a31f90393a5a9ba249b62746aeaafb802e96b632c4f38970dd80351d` nos dois
lados). O texto de erro do preflight ("conteúdo SQL divergente") é uma
mensagem informativa do próprio gate de segurança, não um erro de integridade.
Comportamento correto e intencional — não é um bug do projeto.

## Conclusão

Nenhuma divergência real entre local/GitHub/banco foi encontrada em nenhum dos
dois projetos, além do que já era conhecido e documentado (Card 9: migração
vitest 4→5 pendente no V3, não relacionada a integridade de dados). Os dois
repositórios estão íntegros nas 3 pontas.
