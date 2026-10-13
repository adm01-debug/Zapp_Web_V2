Especialista: worker (sql) (area-sql-banco)

# [retomar] fix(ci): baseline do usage-guard cobre favoritar, fixar, reportar e lembrar mensagem

## O que encontrei (defeito NÃO existe no código atual → fecho sem commit de código)
O cartão manda: antes de mexer, conferir no código ATUAL se o defeito do pedido ainda
existe; se já foi corrigido, escrever isso no relato com a prova e fechar sem commit de
código. É exatamente o caso.

O pedido era acrescentar ao baseline (`scripts/db-audit/known-violations.json`) as 8
chaves temporárias dos consumidores de chat (favoritar/fixar/reportar/lembrar mensagem),
porque a guarda `scripts/db-audit/supabase-usage-guard.mjs` acusaria violação nova.

Na branch dia/2026-10-13 esses consumidores NÃO existem: `src/hooks/chat/` não tem
useMessageFavorites.ts, useMessagePins.ts, useReportMessage.ts nem useRemindMessage.ts, e
nenhum arquivo de `src/` ou `supabase/functions/` chama as tabelas/RPCs envolvidas. Sem
call-site, a guarda não acusa nada para cobrir — as 8 chaves seriam entradas OBSOLETAS e,
por serem obsoletas, fariam a própria guarda FALHAR. Então aplicar o commit-filho
(973786c8a) seria introduzir vermelho, não tirar.

## Prova
- `node scripts/db-audit/supabase-usage-guard.mjs` (o item exato que o espelho de CI roda
  em `~/arquitetura-v2/integrador/ci_espelho.sh`, laço `for g in ... supabase-usage-guard.mjs`):
  saída completa, exit 0:
  ```
  Catalogo: 166 tabelas, 12 views, 251 funcoes, 64 trigger functions ... (gerado em 2026-10-04); projecao forward-only: 181 relacoes, 277 funcoes
  Violacoes totais: 2 | no baseline: 2 | novas: 0
  OK: nenhuma violacao nova.
  ```
  Nenhuma linha "NOVAS violacoes" e nenhuma linha "Entradas obsoletas" → verde.
- `git grep -n 'message_favorites|toggle_message_favorite|message_pins|remind_me_about_message|message_reports|useMessageFavorites|useRemindMessage' -- .` :
  só casou em `docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md` e
  `docs/reconciliation/tasks/P041.json` (documentos de plano/auditoria, não consumidores).
  Em `src/**` e `supabase/functions/**`: zero.
- `scripts/db-audit/known-violations.json` no topo da dia: baseline `known` com 2 chaves
  (`rpc:set_default_whatsapp_connection:...` e `rpc:talkx_campaign_window_open:...`),
  nenhuma das 8 de chat. É o estado atual e ele está consistente com a ausência de
  consumidores.

## O que NÃO fiz e por quê
- Não commitei o baseline (cartão manda fechar sem commit de código quando já resolvido).
  O ÚNICO arquivo no commit deste cartão é o próprio relato `.tmp/relato.md`, que está
  versionado (por engano) na ponta de dia/2026-10-13 — o fechar exige árvore limpa e um
  commit novo em relação a BASE_DIA, então o commit do relato (não-código) é o mínimo
  necessário. Nenhuma linha de produção/CI mudou.
- Não cherry-piquei 973786c8a: as chaves apontam para arquivos que não existem na dia →
  virariam obsoletas e reprovariam a guarda (diff vazio).
- Não rodei `ci_espelho.sh` por inteiro: a guarda do Hermes bloqueia a execução de script
  em `~/arquitetura-v2/**` (o espelho também escreve `registro-pendente.txt` nessa pasta,
  proibida a escrita de agente). Reproduzi o comando EXATO que ele usa para este item —
  `timeout 120 node scripts/db-audit/supabase-usage-guard.mjs` — com o mesmo resultado
  (exit 0, verde).
- Nada fora do meu escopo foi tocado; nenhum arquivo de outro cartão.

Concluí.
