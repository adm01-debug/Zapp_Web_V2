Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261015013000_contact_response_stats_janela.sql` (NOVA): `CREATE OR REPLACE` da
  `public.contact_response_stats` sem tocar em assinatura, colunas, visibilidade nem ACL —
  a única mudança de comportamento está no CTE `pares`, que agora cruza `params` e exige a mensagem do
  contato dentro de `[agora - p_days, agora)`. O `lead()` continua sobre o histórico inteiro e o filtro
  vem depois, para não perder a resposta de um par da borda. Comentários da migration atualizados.
- `supabase/tests/contact_response_stats.sql`: fixture T4 com três grupos (50 pares velhos a 90 dias fora
  da janela + 250 pares recentes dentro: 50 externos de 2 min e 200 internos de 6 min, 500 mensagens
  recentes — acima do teto de 200 do código antigo); T4 exige amostra da janela e difere da leitura
  antiga; T7 exige `p_days=20` mudando a amostra do tempo de resposta e `p_days=0`/`NULL` caindo no
  default 30.

## Prova
- vermelho antes (suíte nova contra a função antiga, banco local):
  `zapp-db-local psql . v2-crs-refazer1 -v ON_ERROR_STOP=1 < supabase/tests/contact_response_stats.sql` →
  `ERROR: T4 FALHOU: response_samples esperava 250 (só a janela recente), veio 300 — pares antigos fora da janela estão sendo contados`
- verde depois (mesmo comando, com a migration nova aplicada) →
  `NOTICE: contact_response_stats: suite OK — 7 grupo(s) verificado(s)`
- rollback de verdade: rodei a linha `-- Rollback:` (restaura a v1; único delta para a v1 é o comentário
  interno `-- Portão...`, que não colapsa numa linha sem virar comentário do resto — comportamento
  idêntico) → a suíte voltou a reprovar com `veio 300` (comportamento v1 restaurado) → reapliquei a
  migration nova → suíte verde de novo.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (15s)` (tipos, lint e migrations OK;
  banco_local AVISO sem conjunto, como prevê o fechar). Com conjunto, o `check` lista este cartão só nas
  linhas do objeto novo (função + EXECUTEs, ainda fora do retrato de produção); o restante do diff é
  drift de outros cartões (whatsapp_connections, ai_usage_outbox), sem relação com este diff.

## Pontos do revisor
- Ponto 1: resolvido — `pares` filtra `created_at >= p.agora - p.janela AND created_at < p.agora` com
  `lead()` sobre o histórico inteiro (`supabase/migrations/20261015013000_contact_response_stats_janela.sql`,
  CTE `pares`); prova T4 (amostra da janela) + T7 (janelas 20/0/NULL).
- Ponto 2: resolvido — T4/T7 reescritos (`supabase/tests/contact_response_stats.sql`): 500 mensagens
  recentes (> 200, sem viés), 50 pares velhos fora da janela ignorados, `p_days=20` altera a amostra
  do tempo de resposta.
- Ponto 3: resolvido — T7 tem `p_days=0` e `p_days=NULL` comparados ao default 30 (a afirmação do relato
  anterior agora é verdadeira e executada).
- Ponto 4: resolvido — comentários da migration nova (cabeçalho, SEMÂNTICA, SOLUÇÃO) dizem janela recente;
  `types.ts` não muda porque assinatura e colunas são as mesmas da v1.

## O que NÃO fiz e por quê
- Não mexi em `src/integrations/supabase/types.ts`: assinatura e colunas idênticas às da v1 (conferido no
  diff da v1 e no corpo da v2) — nada para atualizar.
- Não mexi em `fetchStats`/front: é do cartão vizinho; a RPC mantém o contrato, nenhum chamador quebra
  (nenhum `.ts`/`.tsx` fora de `types.ts` referencia a função — grep vazio).
- Não incluí par exato na borda do timestamp (contato em `agora - janela` cravado): a técnica exigida
  (lead integral + filtro posterior) está no código e os dois lados da fronteira estão na fixture com
  dias de margem; borda cravada dependeria de relógio e não foi pedida.
- `hermes-db-migrar` está congelado (aplica no banco canônico): no modo V2 a migration nasceu como arquivo
  no workspace e foi aplicada com `zapp-db-local psql` no conjunto `v2-crs-refazer1` (o conjunto do cartão
  não subiu — estado quebrado; baixei o que restava e segui num conjunto novo). Nada em produção.
