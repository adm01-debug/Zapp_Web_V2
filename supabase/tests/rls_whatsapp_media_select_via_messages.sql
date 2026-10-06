-- Teste de regressão da ACL de LEITURA dos buckets privados de mídia do WhatsApp.
-- R2-DB-022 B1 — contrato VIGENTE: a leitura de storage.objects nos buckets
-- `whatsapp-media` e `audio-messages` é autorizada SÓ pela propriedade canônica do
-- objeto (primeiro segmento do path = contact_id visível via
-- public.is_contact_visible_to_user) ou por admin/supervisor
-- (public.is_admin_or_supervisor). NENHUMA policy pode autorizar por
-- `public.messages.media_url` nem por join em `public.messages`.
--
-- HISTÓRICO. A policy "whatsapp media readable via visible message"
-- (20261003142707_whatsapp_media_recebida_select_via_messages.sql) autorizava por
-- `media_url` (right/position, inclusive variantes com '?' e '%20'); como as policies
-- permissivas se combinam por OR — e a policy de INSERT de public.messages não
-- restringe sender/external_id/media_url —, um agente autenticado podia forjar uma
-- mensagem visível apontando para o objeto privado de outro contato e passar a lê-lo.
-- A migration `20261006175251_r2_db_022_storage_acl.sql` (R2-DB-022 B1) removeu essa
-- policy e o ramo por `media_url` das duas "assigned" (fail-closed).
--
-- ESCOPO E LIMITAÇÃO (importante, ler antes de confiar no resultado):
-- Rodando pela wrapper `db_query` do MCP a sessão é service_role, que tem BYPASSRLS:
-- os SELECTs daqui NÃO passam pelo enforcement real das policies (mesma limitação
-- declarada em rls_dashboard.sql). O que este arquivo prova é a ESTRUTURA vigente —
-- existência/ausência, cmd, roles e predicado —, que é exatamente o que fica
-- contraditório quando alguém recria a policy removida (combinação por OR volta).
-- O ENFORCEMENT real, com papel real e SEM BYPASSRLS, é provado em
-- `scripts/db-audit/rls-whatsapp-media-storage-acl.test.sh` (PostgreSQL 17
-- descartável, migrations reais): vermelho sem a migration da ACL, verde com ela.
--
-- Este arquivo substitui a prova anterior, que exigia a policy removida e que o
-- predicado consultasse `messages` (contrato revogado — não deixar teste
-- contradizendo o contrato vigente).
-- Read-only, sem side effects (transação implícita do db_query).

DO $$
DECLARE
  v_pred        text;
  v_extra       text;
  v_n           integer;
  v_buckets     text[] := ARRAY['whatsapp-media', 'audio-messages'];
  v_policies    text[] := ARRAY['Users can read assigned whatsapp media',
                                'Users can read assigned audio messages'];
BEGIN
  -- T0 a policy baseada em media_url foi REMOVIDA de propósito (o vetor é
  --    forjável por authenticated enquanto a fronteira de escrita de messages
  --    estiver aberta). Se ela voltar, esta suíte tem de ficar vermelha.
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'whatsapp media readable via visible message';
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'rls_whatsapp_media T0 FALHOU: policy "whatsapp media readable via visible message" existe (contrato revogado por R2-DB-022 B1)';
  END IF;

  -- T1 as DUAS policies de locator canônico existem, são SELECT e valem para
  --    authenticated (o papel do PostgREST com sessão de usuário).
  SELECT string_agg(esperado.nome, ', ') INTO v_extra
    FROM unnest(v_policies) AS esperado(nome)
    LEFT JOIN pg_policies p
      ON p.schemaname = 'storage' AND p.tablename = 'objects'
     AND p.policyname = esperado.nome
     AND p.cmd = 'SELECT'
     AND p.roles = ARRAY['authenticated']::name[]
   WHERE p.policyname IS NULL;
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'rls_whatsapp_media T1 FALHOU: policy de locator canônico ausente/incorreta (cmd=SELECT TO authenticated): %', v_extra;
  END IF;

  -- T2 VETOR FORJÁVEL FECHADO: nenhuma policy SELECT de storage.objects que cubra
  --    estes buckets pode autorizar por `media_url`, por comparação de padrão
  --    (~~/LIKE, position, substring, replace, right) nem por join em public.messages.
  SELECT string_agg(p.policyname || ' [' || coalesce(p.qual, '') || ']', ' | ')
    INTO v_extra
    FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
     AND p.cmd = 'SELECT'
     AND (
       p.qual ~* 'media_url'
       OR p.qual ~ '~~'
       OR p.qual ~* 'position\('
       OR p.qual ~* 'substring\('
       OR p.qual ~* 'replace\('
       OR p.qual ~* 'right\('
       OR p.qual ~ 'public\.messages'
       OR p.qual ~* '\mfrom\s+public\.messages\M'
     )
     AND (
       p.qual ~ 'whatsapp-media'
       OR p.qual ~ 'audio-messages'
       OR p.policyname = ANY (v_policies)
     );
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'rls_whatsapp_media T2 FALHOU: policy SELECT com referência forjável (media_url/pattern-match/public.messages): %', v_extra;
  END IF;

  -- T3 soma por OR: exatamente UMA policy SELECT por bucket (qualquer policy
  --    permissiva residual nos mesmos buckets apareceria aqui).
  SELECT string_agg(b.bucket, ', ') INTO v_extra
    FROM unnest(v_buckets) AS b(bucket)
   WHERE (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
             AND p.cmd = 'SELECT' AND p.qual ~ b.bucket) <> 1;
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'rls_whatsapp_media T3 FALHOU: esperava exatamente 1 policy SELECT por bucket; divergente em: %', v_extra;
  END IF;

  -- T4 PREDICADO CANÔNICO: as duas policies usam o bucket + o locator
  --    (storage.foldername(name))[1] resolvido por is_contact_visible_to_user, e
  --    mantêm is_admin_or_supervisor; nada de media_url, LIKE, curinga ou auth.uid().
  FOR v_pred IN
    SELECT p.qual FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
       AND p.cmd = 'SELECT' AND p.policyname = ANY (v_policies)
  LOOP
    IF position('foldername' IN v_pred) = 0
       OR position('is_contact_visible_to_user' IN v_pred) = 0
       OR position('is_admin_or_supervisor' IN v_pred) = 0 THEN
      RAISE EXCEPTION
        'rls_whatsapp_media T4 FALHOU: policy de locator sem o predicado canônico (foldername + is_contact_visible_to_user + is_admin_or_supervisor): %', v_pred;
    END IF;
    IF position('media_url' IN v_pred) > 0 THEN
      RAISE EXCEPTION
        'rls_whatsapp_media T4 FALHOU: policy de locator voltou a citar media_url: %', v_pred;
    END IF;
  END LOOP;

  RAISE NOTICE
    'rls_whatsapp_media: estrutura ok — policy por media_url ausente, 2 policies de locator canônico (contact_id visível ou admin/supervisor), nenhuma policy residual por OR. Enforcement real: scripts/db-audit/rls-whatsapp-media-storage-acl.test.sh';
END $$;
