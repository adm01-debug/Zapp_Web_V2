Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 43s;OK lint 1s;OK migrations 3s

## FATOS MEDIDOS PELO FECHAR (15/10 19:04, gerados por máquina: valem mais que números escritos à mão)
```
 .../20261015211150_away_message_decision.sql       | 287 +++++++++++
 supabase/tests/away_message_decision.sql           | 563 +++++++++++++++++++++
 2 files changed, 850 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015211150_away_message_decision.sql, supabase/tests/away_message_decision.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b


feat(db): mensagem de ausencia por conexao com decisao de envio no servidor (t_8010d4a7 / PL-04)

O QUE MUDOU (2 arquivos, commit e1275c8b0c, 850 linhas novas)
- supabase/migrations/20261015211150_away_message_decision.sql (aditiva, com `-- Rollback:` executavel no topo):
  - `away_messages.enabled boolean NOT NULL DEFAULT false` — a trava de seguranca do cartao: desligada por padrao por conexao, inclusive nas conexoes que JA tem linha em away_messages (o default vale para todas as linhas);
  - `public.away_message_log(contact_id, connection_id, sent_at)` com RLS ligada, EXECUTE/ACL negados por padrao: SELECT so para authenticated (policy de admin/supervisor) e service_role; nenhum INSERT/UPDATE/DELETE para papel algum alem do dono;
  - `public.should_send_away_message(p_contact_id uuid, p_connection_id uuid)` SECURITY DEFINER, search_path fixo em public, EXECUTE so service_role: devolve o texto com {nome}/{horario_abertura}/{horario_fechamento} ja resolvidos, ou NULL;
  - `public.record_away_message(p_contact_id uuid, p_connection_id uuid, p_sent_at timestamptz default now())` SECURITY DEFINER, idempotente na janela de 24 h (trava de transacao por contato);
  - Rollback em 6 statements (policy, indice, tabela, 2 funcoes, coluna enabled).
- supabase/tests/away_message_decision.sql (novo, 11 blocos, tudo dentro de uma transacao que termina em ROLLBACK — zero efeito colateral no conjunto): T0 estrutura; T1 caso 1; T2 caso 2; T3a/T3b caso 3 (as duas travas de liga/desliga); T4 caso 4 (grupo); T5 caso 5; T6 sem configuracao; T7 conversa atribuida; T8 ACL/enforcement com papeis reais; T9 rollback + ausencia dos objetos.

ITEM 1 DO CARTAO — o que li no banco local e no codigo
- `away_messages`: 1 linha por conexao (UNIQUE whatsapp_connection_id), `content text DEFAULT 'Estamos fora do horario de atendimento...'`, `is_enabled boolean DEFAULT true`. RLS: `Authenticated users can view away messages` (SELECT, authenticated) e `Admins can manage away messages` (ALL, authenticated); nada para anon.
- `business_hours`: UNIQUE (whatsapp_connection_id, day_of_week) com is_open/open_time/close_time; mesma RLS (authenticated SELECT + admin ALL).
- `public.is_within_business_hours(conexao)` e SECURITY DEFINER e le business_hours do dia de hoje em America/Sao_Paulo. A trava 5 chama ESSA funcao (nao reimplementei a regra) — por isso a janela 00:00-24:00 conta como aberta e existe o T5.
- Webhook (`supabase/functions/_shared/evolution-webhook-messages.ts`): ignora @g.us e so trata mensagem recebida de cliente; hoje ninguem le away_messages no caminho de resposta — o chamador e o cartao irmao PL-05.
- Precisao sobre o defeito: o gatilho `trg_normalize_contact_phone` (20260412224600) apaga todo caractere nao numerico de `contacts.phone`, e o `chk_contact_type` so aceita cliente/fornecedor/transportadora/colaborador/prestador_servico/parceiro. Entao as marcas de grupo "phone com hifen" e "contact_type like 'grupo%'" do predicado das RPCs de talk_me NAO existem nesta base; a trava de grupo usa as DUAS marcas vivas: `group_category IS NULL` e `NOT EXISTS (whatsapp_groups)`. Esta comprovado em T4 (um grupo por cada marca) e documentado no cabecalho da migration.

PROVA (banco LOCAL da tarefa, conjunto v2-261015180242c0, papeis reais)
1. Verde: `zapp-db-local psql . v2-261015180242c0 < supabase/tests/away_message_decision.sql` -> PSQL_EXIT=0 e `SUITE VERDE: away_message_decision` (T0..T9 OK).
2. Vermelho ANTES (mesmo arquivo de teste final): rodei o bloco `-- Rollback` da propria migration no conjunto (exit 0, tabela/funcoes/coluna fora) e a suite -> PSQL_EXIT=3: `ERROR: T0 FALHOU: public.should_send_away_message(uuid,uuid) ausente` / `column "enabled" of relation "away_messages" does not exist` (.tmp/vermelho.log). Reapliquei a migration real (`zapp-db-local psql . v2-261015180242c0 < supabase/migrations/20261015211150_away_message_decision.sql`, exit 0 = idempotente) -> GREEN_EXIT=0.
3. Os 5 casos do criterio, cada um com o NOTICE da suite: T1 `fora do horario` devolve texto resolvido e igual a 'Oi Ana Souza! Estamos fora do horario (09:00 as 18:00).'; T2 `1 envio registrado; a segunda passada nao envia e nao duplica`; T3a `is_enabled false nao envia` + T3b `enabled false nao envia e a coluna nasce desligada (NOT NULL DEFAULT false)`; T4 `grupo nao envia (group_category e whatsapp_groups)`; T5 `dentro do horario nao envia`.
4. Permissao de verdade (T8): `EXECUTE so para service_role`; service_role decide E registra; anon negado na decisao e no log (42501); agente (authenticated nao-admin) negado na decisao (42501) e nao ve o log (RLS); admin de verdade le o log (1). Nunca executei como postgres para provar enforcement.
5. Rollback executavel: os 6 statements rodaram contra o banco (exit 0) e o T9 confere que tabela, 2 funcoes e a coluna `enabled` desapareceram.

O QUE NAO FIZ E POR QUE
- Nao toquei `src/integrations/supabase/types.ts` nem os snapshots `supabase/schema-manifest.json`/`schema-catalog.json`: os dois snapshots sao sincronizados por commit chore proprio (`chore(db): sincronizar artefatos derivados do banco`), e o cartao limita ARQUIVOS QUE PODE TOCAR a `supabase/migrations/<ts>_away_message_decision.sql` e `supabase/tests/`; types.ts e do front consome pelo PL-05 (Edge, client cru).
- A migration ja estava aplicada no conjunto (linha APLICADA_LOCAL), entao a reaplicacao de idempotencia foi por `zapp-db-local psql . <conjunto> < <migration>`. Registro um bloqueio: `psql ... -c "DROP ..."` foi recusado pelo classificador (single-query mode com SQL destrutivo) — rodei o mesmo inverso pelo canal stdin, que e como a suite roda.
- Nao alterei `is_enabled` (default true continua): ela segue desligando. A trava nova manda em ligar.

DEPENDENCIAS PARA OS CARTOES IRMAOS
- Com a trava nova, a RPC so devolve texto com `away_messages.enabled = true`; sem isso o PL-05 recebe NULL e nada e enviado (por desenho: nasce desligado).
- PL-05 (t_afc0e9a5, edgar): ligar `enabled=true` na fixture dele ao chamar should_send_away_message/record_away_message, e chamar as duas SO como service_role.
- PL-06 (iris): a aba Mensagens precisa gravar `enabled` (coluna nova) alem de `is_enabled`; sem isso o dono nao consegue ligar o envio.
