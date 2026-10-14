Especialista: workersql

Refazer 1 do cartao de previsao de demanda e heatmap (skill de area usada: area-sql-banco). Trouxe so o trabalho deste cartao com `git cherry-pick -n c2a98309a0` (migration + suite de contrato + tipos); os commits c9ff78efc0 (relato) e e41482dcc (registro no db-guard.yml) ficaram de fora — corrigi so o que foi apontado.

## O que mudou e por quê
- `supabase/migrations/20261012115458_demand_forecast.sql`: `demand_forecast` calcula a media por dia da semana sobre a CTE `janela` (serie completa dos `v_hist` dias, `LEFT JOIN` com o diario, `avg(coalesce(base.n, 0))`); dow sem nenhuma demanda no periodo tem media 0 e previsao 0 real (nunca NULL); regra de arredondamento decidida e documentada: round, 0 casas. `dashboard_heatmap`, gate, `search_path`, ACL, clamps, reais e cabecalho de rollback: inalterados.
- `scripts/db-audit/demand-forecast-heatmap-contract.test.sh`: GREEN 2 reescrito com os valores corretos — previsao 1 no dow de ontem (media 1.25 arredondada), 0 no dow de hoje (media 0.25 arredondada), 0 real nos outros 5 dows e nenhum NULL em forecast; semente documentada como ~26 dias zerados implicitos na janela de 28.
- `src/integrations/supabase/types.ts`: inalterado funcionalmente (bloco `demand_forecast` veio no cherry-pick; `value: number` segue correto porque previsao nunca e NULL).
- `.github/workflows/db-guard.yml`: passo novo que roda a suite no CI (`Provar o contrato das RPCs de demanda (heatmap + previsao)`, com `SKIP_DOCKER_SHIM=1` porque a suite cria as roles globais); `node scripts/ci/check-test-inventory.mjs` nao lista mais a suite como orfa (restam 6 orfaos de outros cartoes, pre-existentes na base, fora do escopo).
- `COMMENT ON FUNCTION`, cabecalho da migration e este relato: ajustados para a nova regra (antes diziam 'NULL quando nao ha historico daquele dow').

## Prova
- Comando: `bash scripts/db-audit/demand-forecast-heatmap-contract.test.sh` (PostgreSQL 17 descartavel, dados reais, sem mock do cliente).
- Vermelho (suite nova x migration com media antiga): `FAIL: previsao do dow de ontem (2) deveria ser 1 (media 1.25 arredondada)` (EXIT=1; o codigo antigo previa 5 e 1 e NULLs, ignorando os zeros).
- Verde depois (EXIT=0): `[OK] dashboard_heatmap: bucket local (dow=2, hora=23)=2 e (dow=3, hora=10)=1`, `[OK] demand_forecast: 7 reais (ontem=5, hoje=1, 5 zeros), previsao por dow (1, 0 e 0s reais), sem NULL`, `[OK] permissao`, `[OK] search_path fixado`, `[OK] rollback do cabecalho remove as duas funcoes`.

## Pontos do revisor
- Ponto 1 (media so sobre dias com mensagem; janela completa com `coalesce(n,0)`): resolvido — `supabase/migrations/20261012115458_demand_forecast.sql` (CTE `janela`, `avg(coalesce(base.n, 0))`); prova: vermelho/verde acima.
- Ponto 2 (assercoes `forecast.*|5$` e 5 NULLs validavam o errado; valores corretos 1.25→1, 0.25→0, demais 0 real): resolvido — `scripts/db-audit/demand-forecast-heatmap-contract.test.sh` (GREEN 2 reescrito, sem nenhum NULL em forecast); prova: vermelho/verde acima.
- Ponto 3 (COMMENT/cabecalho/relato diziam NULL; documentar arredondamento): resolvido — cabecalho e `COMMENT ON FUNCTION public.demand_forecast` dizem agora media sobre todos os dias, round 0 casas, dow sem demanda = 0 real nunca NULL; a suite verde aplica a migration (inclui os COMMENTs) duas vezes.

## O que NAO fiz e por quê
- Nao mexi em front (o consumo das RPCs nos componentes do Dashboard e outro trabalho, PD-24/PD-25), nao afrouxei guarda/CI/manifesto, nao registrei os 6 orfaos de outros cartoes no inventario (pre-existentes na base), e nao inclui identificador de producao em nada.
