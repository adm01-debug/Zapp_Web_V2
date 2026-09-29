-- 20260929850000_multiplix_revoke_recipient_writes
-- (versao reservada via supabase_migrations.reserve_migration_version; as anteriores
--  colidiram com outro chat: 20260929800000 virou user_settings_sound_volume e
--  20260929840000 virou talkx_campaign_events_xor_and_grants_v11_1.)
-- Bloco A (F08, segunda metade) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- Com a criacao passando pela RPC multiplix_create_draft (20260929630000) e pela
-- edge multiplix-audience (action=create_draft, neste PR), o caminho de escrita
-- direta do navegador em multiplix_recipients deixa de existir. Enquanto ele
-- existir, o ganho de F08 e so de fachada: um staff autenticado pode continuar
-- chamando o PostgREST direto e inserir qualquer destino_e164 — o buraco que a
-- auditoria de 2026-09-29 marcou como achado 7.
--
-- O que sai: policy de INSERT e de UPDATE de recipients para authenticated (nao
-- ha caso de uso legitimo de UPDATE: o estado de entrega e do worker) e os
-- grants INSERT/UPDATE correspondentes. Fica SELECT (monitor) e DELETE em
-- rascunho (a policy "Users can delete recipients of own draft dispatches"
-- continua valendo para limpar a selecao antes do disparo).
--
-- ORDEM DE APLICACAO (importante): nao aplicar antes do deploy das edges. A
-- partir do merge, o front cria disparo por POST em multiplix-audience
-- (action=create_draft) e essa action so existe na edge DEPLOYADA — edge
-- function so sobe por workflow_dispatch do deploy-functions.yml + aprovacao no
-- environment producao-edge-functions (CLAUDE.md, secao 3). Se o REVOKE entrar
-- antes do deploy da edge, a criacao de disparo fica indisponivel (o modulo tem
-- 0 linhas e nunca foi usado; a indisponibilidade e de escrita, nao ha perda de
-- dado nem efeito em producao para terceiros).
--
-- Por isso este arquivo esta classificado como contrato pelo hermes-db-migrar
-- (REVOKE/DROP POLICY): ele fica registrado como pendente pos-merge e e aplicado
-- depois do merge + deploy — nunca na tarefa.

DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients;
DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients;

REVOKE INSERT, UPDATE ON TABLE public.multiplix_recipients FROM authenticated;

-- Delecao segue permitida, mas so em rascunho: a policy de DELETE continua
-- exigindo dispatch 'draft' do proprio staff (e a guarda de mutabilidade
-- 20260929590000 reforca).
GRANT DELETE ON TABLE public.multiplix_recipients TO authenticated;
