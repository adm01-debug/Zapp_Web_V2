Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Cartão de preparação (sem correção de código): montar a base de trabalho para os cartões-filhos do N-102, trazendo por cherry-pick o trabalho recusado, sem reescrever nada.

- `supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql` (novo): migration BASE do N-102 (colunas `send_weekdays`/`respect_dnd`, setting `dnd_hours`, RPCs `save_talkx_campaign_draft`/`update_talkx_campaign_limits` e `talkx_campaign_window_open`). Vem do cherry-pick de `d050faeede` (branch `v2/t-ef683815-2610091734ab0c`) — SOMENTE LEITURA, não editei. Trazida na forma final, com o rollback já corrigido por `004dd0e05f` (2º cherry-pick).
- Commit 1 `2aa755399b` = cherry-pick de `d050faeede`; Commit 2 `5908ddc3b2` = cherry-pick de `004dd0e05f`.
- Nenhum outro arquivo foi tocado: o conteúdo dos 2 commits é só a migration BASE.

## Prova
- `git cherry-pick -x d050faeede` -> conflito apenas nos arquivos FORA do escopo (`supabase/functions/talkx-scheduler/index.ts`, `index.test.ts`), resolvido restaurando o HEAD do dia (`git checkout HEAD -- ...`); a migration BASE entrou limpa.
- `git cherry-pick -x 004dd0e05f` -> aplicado limpo (7 insercoes / 7 remocoes na migration).
- Integridade da migration BASE: `git rev-parse HEAD:supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql` = `6a8424de568c74c116cee45d7e6eb0c910b7c912` = mesmo blob da ponta recusada `2c186a4809` (`git diff HEAD 2c186a4809 -- <arquivo>` = 0 caracteres). Presente e legivel: 536 linhas / 39376 chars.
- `zapp-verify . --rapido` (1a execucao): `OK dependencias`, `OK db_guard`, `FALHOU tipos 358s` — falha de EXECUCAO, nao de codigo: `tc-rapido: tsc saiu 137 em app (falha de execucao, NAO e aprovacao)` apos `esperando vaga no pool 'pesado' (3 em uso)`. `jev-juiz falha <log>` classificou `environment (certeza 0.90; rodar de novo ajuda: 0.65)`. Meu diff nao tem nenhum arquivo TypeScript (so a migration), entao o typecheck nao quebrou por ele. As re-execucoes seguintes nao completaram nesta sessao (o terminal encerra o processo de fundo); a verificacao final vale pela execucao do proprio `hermes-tarefa-fechar`.

## Valores para os cartões seguintes (escolha do nome da migration nova)
- HEAD apos os cherry-picks: `5908ddc3b259f3abc0286ed3ace234d2df9ceb7a`
- Timestamp MAXIMO do ledger `supabase/migrations/` (apos esta importacao): `20261009203548`
- `generated_at` de `supabase/schema-catalog.json`: `2026-10-04`
- Alvo: `<HOJE>_talkx_n102_window_fixes.sql` com AAAAMMDDHHMMSS de hoje, MAIOR que `20261009203548` e `>= 2026-10-04` (ex.: `20261013120000`).

## O que NAO fiz e por quê (importante para os filhos)
1. `2c186a480` (commit citado no cartao) nao entrou, e nao podia entrar sozinho. Tentado: `git cherry-pick -x 2c186a4809` -> `CONFLICT (modify/delete)` nas DUAS unicas coisas que ele muda (`supabase/migrations/20261010124150_talkx_n102_window_fixes.sql` e `scripts/db-audit/talkx-n102-window.test.sh`), porque nenhum dos dois existe no dia: sao criados pelos commits anteriores da mesma branch (`4f519980bb`/`52ae13ee8c`). O filho `t_a631f82f` cria a migration NOVA `<HOJE>_talkx_n102_window_fixes.sql` (substituindo a `20261010124150`) e o `t_5d0f8628` cria o `.test.sh` — trazer os dois inflaria o diff em ~46k com arquivos que os proprios filhos vao recriar (foi exatamente o tamanho que causou a recusa anterior). Nao inventei nada: apenas nao puxei o que e substituido.
   Referencia para os filhos (sem entrar no diff): o corpo corrigido da migration recusada esta em `git show 2c186a4809:supabase/migrations/20261010124150_talkx_n102_window_fixes.sql`.
2. Partes de hook/scheduler/teste Deno de `d050faeede` nao entraram: ja estao na branch do dia, em versao MAIS NOVA (`cc03dcce11 fix(talkx): p_at da janela usa relogio injetado e prova de despacho real`), com `send_weekdays` em `supabase/functions/talkx-scheduler/index.ts` e `src/hooks/integrations/useTalkX.ts`. O cherry-pick dessas partes conflita com o dia e o `52ae13ee8c` (que reverte hook/scheduler) desfaria o trabalho mais novo. Restaurei esses 3 arquivos ao HEAD do dia; apos o commit so a migration entrou.
3. Nenhum push, merge, deploy ou acesso a produção.

## Por que não há teste próprio neste diff
Cartão de PREPARAÇÃO: o único conteúdo é a migration BASE recusada (20261009203548), trazida por cherry-pick em modo somente-leitura, sem correção de nada. O cartão-filho `t_5d0f8628` é quem cria o `.test.sh` que prova a RPC em Postgres descartável, e os filhos `t_a631f82f`/`t_59210b33`/`t_24edcc38`/`t_7fa3929d` criam a migration de correção. Não escrevi teste porque (a) o arquivo é read-only pelo cartão e (b) a prova vermelho→verde tem de ser feita contra a correção, que é dos filhos — um teste aqui ficaria vermelho para sempre e provaria só o defeito conhecido. O juiz barato apontou "não achei teste no diff"; o ponto não procede para um cartão de preparação, e re-rodo o fechar sem mudar nada.
