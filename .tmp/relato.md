Especialista: workersql

Refazer 1 do cartão t_8d53f9bd (branch v2/reagcoes-autoria-261013021892a8, commits 905a29f264 + 9a5ed42b17 aproveitados na íntegra; nada fora do escopo).

Ponto 1 — WITH CHECK do UPDATE sem visibilidade da mensagem nova (brecha real)
O que mudei (supabase/migrations/20261013210000_message_reactions_autoria.sql, só o bloco do UPDATE): o ramo do autor do WITH CHECK agora exige, além de user_id próprio + contact_id coerente, o mesmo EXISTS de visibilidade do INSERT (messages JOIN contacts: admin/supervisor OU contact.assigned_to = meu profile OU assigned_to IS NULL) aplicado ao message_id NOVO; o USING recebeu o mesmo EXISTS aplicado ao message_id ANTIGO (mantém a visibilidade que a policy anterior já exigia), preservando o ramo admin/supervisor para moderação. INSERT e DELETE intactos.
Teste que prova: A9/A11 abaixo + vermelho→verde isolado (ponto 2). Prova in-schema verde: 17/17 PASS.

Ponto 2 — prova do UPDATE (A9 negado, A10 legítimo passa) + vermelho→verde
O que mudei (supabase/tests/rls_message_reactions_autoria.sql): A9 (A dá UPDATE na própria reação trocando message_id para a mensagem do contato do B, com contact_id coerente → negado), A10 (upsert legítimo: mesmo message_id, emoji novo → 1 linha), e A11 extra (reação plantada como postgres numa mensagem fora do alcance → UPDATE afeta 0 linhas; guarda a metade USING que a recusa mandou mexer). Fixture e3 incluído na carga e na limpeza.
Vermelho→verde, com uma ressalva honesta que investiguei até o fim: no esquema COMPLETO, a variante prescrita do A9 é negada também ANTES da correção — por efeitos colaterais, não pela policy: (i) o RLS de messages cega a subquery de coerência (SELECT como A na d2 retorna 0 linhas); (ii) o scan do UPDATE é fechado pela policy de SELECT "accessible messages" (o EXPLAIN do UPDATE mostra o qual de SELECT com AND no plano; sem policy de SELECT, UPDATE retorna 0 linhas). Testei 4 variantes de mover (contact coerente, NULL, inalterado, com messages aberto via policy permissiva temporária, depois removida) — todas negadas pré-fix.
Por isso o vermelho→verde foi demonstrado em esquema isolado (iso_test, textos das policies idênticos, SELECT permissivo, sem RLS em messages/contacts — só some a interferência): metade WITH CHECK (mover p/ mensagem alheia): antiga UPDATE 1 (brecha reproduzida) → nova ERROR 42501 (negado); metade USING (mexer em reação de mensagem alheia): antiga UPDATE 1 → nova UPDATE 0; legítimo (trocar emoji da própria): UPDATE 1 → UPDATE 1. Ou seja: os EXISTS adicionados são load-bearing; a correção converte a garantia implícita (efeito colateral) na garantia explícita que a policy pré-migration tinha (sem WITH CHECK explícito, o USING de visibilidade valia para a linha nova). Esquema e policies temporárias do diagnóstico removidos (DROP SCHEMA iso_test CASCADE; fixtures de debug limpos pela própria prova).
Verde final in-schema (banco local v2-reagcoes-ref1, migration corrigida aplicada de verdade): 17/17 [PASS], 0 [FAIL] (única linha ERROR é a esperada e pré-existente do bloco ANON: anon não tem EXECUTE na função de assert — capturada de propósito e a asserção continua validando a negação).

Ponto 3 — correções do relato anterior
(a) Removida a afirmação de "um BEGIN/COMMIT": a migration é só DDL (DROP/CREATE POLICY), transacional por natureza, sem BEGIN/COMMIT no texto. (b) Registro aqui o que a recusa apontou: a policy de UPDATE pré-migration não tinha WITH CHECK explícito, então o USING (visibilidade) valia também para a linha nova — minha correção restaura exatamente essa propriedade, de forma explícita. (c) Rollback: restaura as 5 policies conhecidas (message_reactions_insert/update/delete_policy + "Users can insert reactions for assigned contacts" + "Users can delete their own reactions") e NÃO recria os nomes especulativos dropados por IF EXISTS ("Users can add reactions", "Authenticated users can add reactions", "Authenticated can insert reactions", "Users can insert reactions", "Agents can react to visible messages", "Users can update reactions", "Users can delete reactions"): neste banco local nenhum deles jamais existiu (todos os DROPs retornaram "does not exist, skipping"), as definições deles são desconhecidas e portanto irrestauráveis; nenhum dado é tocado em nenhum caso. Rollback EXECUTADO de verdade (extraído das linhas "-- ..." do cabeçalho): 8 statements ok, 7 policies pós-rollback (5 legadas + 2 SELECT intactas); migration reaplicada em seguida → 5 policies (3 novas + 2 SELECT). Observação da recusa respeitada: mantido contact_id igual ao contato da mensagem (coerência) em vez de IS NULL — sem alteração.

Efeitos colaterais varridos: sem triggers em message_reactions (0 rows em pg_trigger); sem GRANT/REVOKE nem toque em dados; chamadores (useReactionMutations, useBatchReactions, useMessageReactions) operam só nas próprias reações — A10 prova o caminho do upsert intacto; diff servidor só nos 2 arquivos do cartão (+ este relato). Produção intocada (só banco local v2-reagcoes-ref1).

Arquivos (git diff --name-only):
supabase/migrations/20261013210000_message_reactions_autoria.sql
supabase/tests/rls_message_reactions_autoria.sql
.tmp/relato.md

Verificações (banco local v2-reagcoes-ref1):
- prova: zapp-db-local psql . < supabase/tests/rls_message_reactions_autoria.sql → 17 [PASS], 0 [FAIL]
- rollback extraído do cabeçalho → 8 statements (DROP/CREATE POLICY) ok; 7 policies depois; reaplicação → 5 policies
- isolado: antiga UPDATE 1 (mover) / UPDATE 1 (tocar alheia) → nova ERROR 42501 / UPDATE 0; legítimo UPDATE 1 → UPDATE 1
