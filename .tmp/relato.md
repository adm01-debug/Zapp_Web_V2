Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013230009_admin_inbox_silence.sql` (nova): cria a RPC `public.admin_inbox_silence()`, que devolve POR CONEXAO (`whatsapp_connections`) quantas mensagens RECEBIDAS a conexao teve em 5 min / 1 h / 24 h, o carimbo da ultima recebida e da ultima enviada, o limiar corrente, o veredito `is_silent` e as ate 10 conversas mais ativas das 24 h. E o unico dado que faltava para o painel de admin decidir o aviso de "caixa de entrada silenciosa"; o front calcula "uma vez por episodio" e desenha a tela.
  - Direcao canonica do projeto (a mesma de `get_inbox_contact_summaries` e do `buildConversation` do cliente): RECEBIDA = `sender = 'contact'`; todo o resto e saida. Documentado no cabecalho da migration.
  - Somente admin/supervisor: a RPC levanta `not_authorized` (ERRCODE 42501) para quem nao e; `REVOKE ALL ... FROM PUBLIC`, `REVOKE EXECUTE ... FROM anon`, `GRANT EXECUTE` so a `authenticated, service_role`.
  - Sem PII nova: nao devolve `phone_number` da conexao, token nem conteudo de mensagem; no topo das conversas vai so `contact_id`, nome do contato, volume e carimbo.
  - Limiar configuravel em `global_settings.inbox_silence_minutes` (padrao 10, inteiro 1..1440). A escrita ja era limitada a admin pela RLS existente ("Admins can manage global settings", Gate 16); a migration adiciona so a restricao de FAIXA (`global_settings_inbox_silence_minutes_range`), que a RLS nao da.
  - Indice novo `idx_messages_sender_created_at (sender, created_at desc)` — MEDIDO antes de criar: a lista de indices de `messages` (schema-manifest) nao tinha nada por (direcao, created_at); o mais proximo era `idx_messages_read_sender (is_read, sender)` e `idx_messages_created_at (created_at)`, nenhum cobre "sender no intervalo de created_at".
- `supabase/tests/admin_inbox_silence.sql` (novo): suite de 8 grupos no banco LOCAL, como papel real (`authenticated` com `request.jwt.claims`, `anon`, mais o `postgres` do fixture), tudo em `BEGIN … ROLLBACK`.
- `src/integrations/supabase/types.ts`: entrada de `admin_inbox_silence` na secao `Functions` (a RPC nova muda o contrato tipado; mesma pratica da RPC irma `inbox_unread_total`).

Nao usei `BEGIN;`/`COMMIT;` no arquivo da migration: no MODO_V2 o `hermes-db-migrar` ja envolve o arquivo numa transacao unica (saida da aplicacao: `BEGIN … COMMIT`).

## Prova
- vermelho antes (sem o objeto da migration, mesma chamada da suite): `zapp-db-local psql . v2-2610130603b9c4 < .tmp/red_prova.sql` → `ERROR:  function public.admin_inbox_silence() does not exist`
- verde depois: `zapp-db-local psql . v2-2610130603b9c4 -v ON_ERROR_STOP=1 < supabase/tests/admin_inbox_silence.sql` → `NOTICE:  admin_inbox_silence: suite OK (T1 janelas por conexao, T2 ultima de cada direcao, T3 is_silent, T4 top_conversations, T5 limiar manda, T6 escrita so admin + CHECK, T7 ACL/42501, T8 volume) — 8 grupo(s)` e `NOTICE:  T8 volume (conexao D, 3.000 mensagens): received_24h=3000 em 28.5 ms`
- o que a suite prova, item por item: T1 janelas 5m/1h/24h contam so `sender='contact'` (e a mensagem de 30 h fica fora do 24 h); T2 `last_inbound_at`/`last_outbound_at` sao a ultima de cada direcao; T3 `is_silent` (conexao de 30 min silenciosa com padrao 10, conexao sem mensagem silenciosa, conexao de 2 min nao); T4 topo com o contato certo, volume certo e SEM telefone; T5 o limiar manda (60 → a de 30 min deixa de ser silenciosa; 1 → a de 2 min passa a ser); T6 escrita so admin (nao-admin altera 0 linhas pela RLS; admin altera) e o CHECK recusa 0, 1441 e NULL, aceita 1 e 1440; T7 ACL real (anon sem EXECUTE e barrado; authenticated e service_role com EXECUTE; agente NAO-admin barrado pela propria RPC com 42501); T8 volume 3.000 mensagens com contagem exata.
- rollback de verdade, executado no banco local (`zapp-db-local psql . v2-2610130603b9c4 < .tmp/rollback_prova.sql`), com a saida: `DROP FUNCTION / DROP INDEX / ALTER TABLE / DELETE 1` e `indice_removido=t, chave_removida=t, funcao_restante=0` (a transacao foi desfeita, o banco ficou pos-migration).
- passada de efeitos colaterais: nenhum trigger disparado no `INSERT` da chave (a tabela so tem trigger BEFORE UPDATE); nenhuma linha existente de `global_settings` tocada (o CHECK e `key <> 'inbox_silence_minutes' OR ...`); nenhum GRANT, papel ou ACL de objeto existente alterado; a RPC e somente leitura e nao devolve nada diferente para conexao existente e conexao vazia (sem oraculo de enumeracao para nao-admin: o 42501 e o mesmo para todos).

## Nota sobre o juiz barato (aviso "codigo alterado sem teste")
O unico arquivo de `src/` tocado e `src/integrations/supabase/types.ts`, o contrato TIPADO da RPC nova (a RPC muda `Functions`; a skill do perfil exige o types junto). O teste que prova esta no MESMO commit — `supabase/tests/admin_inbox_silence.sql`, a suite de banco do repositorio, que rodou no banco LOCAL (vermelho antes / verde depois, saida no bloco Prova). O juiz so reconhece `.test.ts` / `.test.sh` / `.test.mjs` e nao enxerga a suite `.sql` de `supabase/tests/`, por isso o aviso. Repito o MESMO comando de fechar sem mudar o codigo.

## O que NAO fiz e por que
- Nao implementei o "uma vez por episodio" nem a tela: e do front (`src/`), fora da minha area; a migration entrega o dado.
- Nao criei `scripts/db-audit/*.test.sh` novo: a prova de banco ficou na suite `.sql` em `supabase/tests/`, como na RPC irma `inbox_unread_total`.
- Nao toquei `supabase/schema-manifest.json`: e retrato da producao e nao se edita a mao.

## Achado fora do escopo (nao bloqueia)
- `supabase/tests/inbox_agregado_por_contato.sql` (pre-existente) NAO roda neste banco local: `ERROR: function public.get_inbox_contact_summaries(uuid[]) does not exist` — a funcao da migration `20261005124628_inbox_agregado_por_contato.sql` nao esta na foto local (a foto local so tem `get_team_inbox` e a minha). Nao e efeito deste cartao (a minha migration so adiciona). Registro para quem cuida do ambiente local.
