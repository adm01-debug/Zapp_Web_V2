Especialista: worker (sql) (area-sql-banco)

# [retomar] fix(ci): baseline do usage-guard cobre favoritar, fixar, reportar e lembrar mensagem

## Conclusão
CONCLUÍ: o defeito do pedido NÃO existe no código atual; nada a corrigir no baseline, logo
nenhuma mudança de código é necessária (é o caso que o cartão manda fechar sem commit de
código). O único arquivo no commit deste cartão é o próprio relato `.tmp/relato.md`, que
está versionado por engano na ponta de dia/2026-10-13 e por isso precisa ser commitado
(o fechar exige árvore limpa + um commit novo em relação a BASE_DIA). Nenhuma linha de
produção ou de CI mudou.

## Por que não existe defeito
O pedido era acrescentar ao baseline (`scripts/db-audit/known-violations.json`) 8 chaves
temporárias dos consumidores de chat (favoritar/fixar/reportar/lembrar mensagem), porque a
guarda `scripts/db-audit/supabase-usage-guard.mjs` acusaria violação nova. Na ponta atual
esses consumidores não existem: `src/hooks/chat/` não tem useMessageFavorites.ts,
useMessagePins.ts, useReportMessage.ts nem useRemindMessage.ts, e nenhum arquivo de `src/`
ou `supabase/functions/` chama as tabelas/RPCs envolvidas. Sem call-site a guarda não acusa
nada para cobrir — e as 8 chaves de 973786c8a, por não terem call-site, seriam entradas
OBSOLETAS e fariam a própria guarda FALHAR. Por isso não as aplico: aplicá-las criaria
vermelho em vez de tirar.

## Prova
- verde: `timeout 120 node scripts/db-audit/supabase-usage-guard.mjs` — é o comando exato
  que o espelho de CI (~/arquitetura-v2/integrador/ci_espelho.sh, laço
  `for g in ... supabase-usage-guard.mjs`) roda para este item. Saída integral, exit 0,
  zero falhas e zero pulados:
  ```
  Catalogo: 166 tabelas, 12 views, 251 funcoes, 64 trigger functions (excluidas do guard .rpc()) (gerado em 2026-10-04); projecao forward-only: 181 relacoes, 277 funcoes
  Violacoes totais: 2 | no baseline: 2 | novas: 0
  OK: nenhuma violacao nova.
  ```
  Sem nenhuma linha "NOVAS violacoes" e sem nenhuma linha "Entradas obsoletas".
- `git grep -n 'message_favorites|toggle_message_favorite|message_pins|remind_me_about_message|message_reports|useMessageFavorites|useRemindMessage' -- .`:
  casa só em `docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md` e
  `docs/reconciliation/tasks/P041.json` (documentos de plano/auditoria). Em `src/**` e
  `supabase/functions/**`: zero.
- `scripts/db-audit/known-violations.json` na ponta: baseline `known` com 2 chaves
  (`rpc:set_default_whatsapp_connection:...` e `rpc:talkx_campaign_window_open:...`),
  nenhuma das 8 de chat — estado consistente com a ausência de consumidores.

Nada fora do escopo foi tocado; nenhum arquivo de outro cartão.
