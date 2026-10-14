Especialista: semisenior (area-sql-banco) — [refazer 1] de t_2edcd6af (entrega 8630ecee82)

A migration (20261012184049) segue intocada — a recusa a declarou correta. Este refazer resolve os 3 pontos.

Ponto 1 — types.ts agora cobre a tabela nova
- O que mudei: `src/integrations/supabase/types.ts` — bloco `rate_limit_alert_settings` (Row/Insert/Update,
  `Relationships: []`) inserido em ordem alfabética entre `rate_limit_alert_configs` e `rate_limit_logs`.
  Colunas/tipos espelham a migration (boolean→boolean, integer→number, text/timestamptz/uuid→string; tudo
  opcional em Insert/Update porque cada coluna tem DEFAULT ou é nulável). `Relationships: []` é o que o
  gerador produz para FK fora do schema public — provado por `catalog_favorites`, que tem
  `references auth.users(id)` na migration e `Relationships: []` no types.
- Teste que prova: `bunx tsc --noEmit --skipLibCheck --target es2020 src/integrations/supabase/types.ts` → exit 0.
- Divergência do receituário (recusa mandava "rodar gen-types.sh"): o modo padrão exige DESTINO_URL (produção,
  proibido pela REGRA R1) e o `--local` exige `supabase db start` (stack parada e linkada a outro projeto).
  Fiz a adição à mão no formato exato do gerador; o diff fica mínimo e o tsc comprova.

Ponto 2 — teste saiu do lugar órfão e foi para supabase/tests/
- O que mudei (frase da recusa que autoriza a remoção: "o teste ... está ... órfão. O teste pertence a
  supabase/tests/ ou tests/contracts/"): excluído `scripts/db-audit/rate-limit-alerts-limiares.test.sh`;
  criado `supabase/tests/rate-limit-alerts-limiares.sql` com as mesmas 15 asserções convertidas para blocos DO
  com RAISE (fixture mínima à mão, migration aplicada pelo marcador `-v mig=`, RLS exercida com o papel real
  via `SET LOCAL ROLE` + `request.jwt.claims`, rollback executado de verdade com as 3 declarações do bloco
  `-- Rollback:` da migration). Lugar novo não aciona o inventário (check-test-inventory só varre
  `supabase/functions/**/*.test.ts` e `scripts/db-audit/*.test.sh`).
- Teste que prova: VERDE `psql -v ON_ERROR_STOP=1 -v mig=... < supabase/tests/rate-limit-alerts-limiares.sql`
  → exit 0, notices G1-G15 + "TODAS as assercoes passaram"; VERMELHO com `-v sem_migration=1` (sem a migration)
  → exit 3 com "RED OK: sem a migration o avaliador nao existe (42883) e 60 bloqueios nao geram alerta".
  `node scripts/ci/check-test-inventory.mjs` não lista mais este teste (restam 4 órfãos pré-existentes de
  outros cartões, fora do meu escopo). O "REGISTRO PENDENTE" do relato anterior está resolvido pela mudança
  de lugar, não por registro no workflow (que eu não posso tocar).

Ponto 3 — relato atualizado
- Este arquivo: uma seção por ponto da recusa, com arquivo, prova e saídas reais.

Arquivos (git diff --name-only 8630ecee82..HEAD):
- src/integrations/supabase/types.ts
- supabase/tests/rate-limit-alerts-limiares.sql
- scripts/db-audit/rate-limit-alerts-limiares.test.sh (excluído)
- .tmp/relato.md

Verificações (comandos reais, nesta ordem):
- GREEN suite SQL em Postgres 17 descartável (docker): exit 0
- RED suite SQL sem a migration: exit 3, "RED OK: ... (42883) ..."
- tsc do types.ts: exit 0
- check-test-inventory: exit 1 só pelos 4 órfãos pré-existentes de outros cartões (nenhum deste cartão)
