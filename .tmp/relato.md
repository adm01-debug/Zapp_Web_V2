Especialista: senior (area-sql-banco)
## O que mudou e por quê
- supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql: varredor decide o motivo por linha com a mesma regra do fail_outbound_unclaimed (migration:152-168) e pula linha com POST iniciado (migration:172); claim soma a recusa PD-79 de POST iniciado + lease vencido ao lookup de papel (migration:400-407); guard soma delivery_post_started_at aos campos internos nos dois ramos (migration:466,477); rollback recria claim/guard com os corpos de 20261013210004 e é extraível por `grep '^--   '` (migration:4-14, só SQL executável).
- supabase/tests/outbound_sweeper_e_claim_por_papel.sql: fixtures de linha presa por motivo (ea/eb) e ambíguas (ec/ed); T3 com motivo por linha + ambígua preservada; T4 resolve a ambígua ec pela fail RPC; T5 recusa ambígua ed a dono e admin; T6 barra carimbo de POST forjado; T7 novo (defaults + bandas).

## Prova
- verde depois: `psql -f /tmp/t.sql` (Postgres 17 descartável, migration aplicada verbatim) → `OK: outbound_sweeper_e_claim_por_papel — T1..T7 verdes`
- vermelho antes (sem a migration, `-v sem_migration=1`) → `psql:/tmp/t.sql:171: ERROR: function public.guard_message_delivery_internal_fields() does not exist` (aborta antes de T1)
- vermelho do teste novo contra o código antigo: com o claim sem a cláusula PD-79 → `FALHA: T5 o dono NAO deveria reivindicar linha ambigua (POST iniciado)` (o T5 novo pegou a regressão que eu mesmo tinha introduzido; corrigi e ficou verde)
- rollback executado de verdade: extraí `grep '^--   '` → rb.sql (11 linhas), apliquei após o teste commitado → `RB-OK` em sweep sumiu, fail_ sumiu, eventos sumiram, coluna motivo sumiu, cron removido, claim sem papel (admin não reivindica), ambígua ainda recusada, post_started ainda protegido (10/10, sendo o último via NOTICE)
- `zapp-verify <cópia> --rapido` → `VERIFY: VERDE SEM BANCO (6s)` (db_guard, tipos, lint, migrations OK; banco coberto pelo Postgres descartável acima)

## Pontos do revisor
- Ponto 1: resolvido sem mudar código — o contrato que a Edge chama no claim vazio é `public.fail_outbound_unclaimed(p_message_id uuid, p_agent_id uuid) RETURNS public.messages` (só service_role), documentado no cabeçalho da migration (migration:53-58); consumidora é o cartão t_ea8decbb, já concluído, cujo corpo diz "no claim vazio ... via RPC do PD-78" e cujo comentário traz a assinatura copiada pelo workersql. Nenhum código aqui muda por P1.
- Ponto 2: resolvido documentando + testando — cadência `*/5` e defaults (900 s, lote 200) foram decididos NESTE cartão sob o pedido t_bc890f8a ("faça o varredor"), sem cartão dono de número (migration:59-63); o teste T7 chama `sweep_stale_outbound_sending()` sem argumentos e prova que executa (teste:552).
- Ponto 3: resolvido documentando + testando — bandas 60..86400 s e lote 1..1000 decididas neste cartão (migration:59-63); T7 prova rejeição 22023 fora da banda (59, 86401, lote 0, 1001) e execução nos limites (teste:556-577).
- Ponto 4: resolvido no código — o varredor decide o motivo por linha com a MESMA regra do fail_outbound_unclaimed (migration:152-168; contato ausente = nao_despachada, igual ao fail_); linha com POST iniciado NÃO é varrida, dona da Edge via fail_outbound_unclaimed (migration:172; teste T3/T4/T5: teste:330-395,449-454,485-494).
- Ponto 5: resolvido executando — o teste roda apontando a MESMA migration aplicada (verbatim, `\i :mig`) e o rollback do cabeçalho foi extraído e executado num banco descartável com 10/10 RB-OK (comandos no COMO RODA do teste, teste:36-48).

## O que NÃO fiz e por quê
- Não trouxe a Edge para este cartão: a consumidora (t_ea8decbb) existe e está concluída; P1 pedia contrato citável ou comentário+devolução — citei o contrato, sem mudar escopo.
- Não removi o schedule `*/5`: sem ele o varredor nunca roda e o DEFEITO 1 do pedido ("faça o varredor") ficaria sem efeito; a decisão está documentada e testada (P2).
- Não reenviei nem restaurei linhas no rollback: linha marcada `failed` não volta a `sending` por desenho (sem reenvio), declarado no cabeçalho da migration.

## 2ª passada (defeito novo do meu diff)
- Achei um de verdade: meu claim tinha só o comentário PD-79 sem o predicado e o T5 novo falhou; corrigi (migration:402-407) e o verde final cobre.
- Merge PD-79: claim e guard desta migration agora são superconjuntos dos corpos de 20261013210004 (cláusula de ambígua + carimbo), então aplicar depois do 10004 não regride; o rollback restaura os corpos do 10004 (antes restaurava os de 202609092x, o que regrediria).
- Chamadores: sweep/fail_ são novos (sem chamador); claim/fail_ são chamados pela Edge message-delivery — comportamento para linha não-ambígua inalterado (T5 dono/admin verdes); linha ambígua agora recusa no claim como no 10004.
- Nenhum arquivo de guarda/manifesto/CI tocado; nenhum identificador de produção no diff ou relato.
