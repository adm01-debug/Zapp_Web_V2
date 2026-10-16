-- G2 da Paridade-11 (achados IA/voz, item 46) — prova ESTRUTURAL e de LÓGICA da
-- policy que decide onde o áudio do Voice Changer pode ser gravado.
--
-- CONTEXTO. O picker subia o mp3 do cliente em
-- `audio-memes/voice-changer/<ts>_<uuid>.mp3`: bucket PÚBLICO com cache de um ano
-- (dado de cliente exposto) e cuja policy de INSERT ("Auth upload audio memes
-- owned") só aceita a pasta `auth.uid()` ou admin/supervisor — então atendente
-- comum recebia "Erro ao enviar áudio". A correção é no front
-- (src/components/inbox/VoiceChangerPicker.tsx): o picker entrega o Blob ao
-- MESMO caminho do áudio gravado, `audio-messages/<contato>/<ts>.webm`, cuja
-- policy de INSERT aceita a pasta do contato atribuído ao atendente.
--
-- LIMITAÇÃO (ler antes de confiar): rodando pela wrapper `db_query` do MCP a
-- sessão é service_role (BYPASSRLS) — os INSERTs daqui não passam pelo
-- enforcement real. O que este arquivo prova: (a) os buckets e as policies REAIS
-- que sustentam o caminho novo, com o predicado esperado; (b) a LÓGICA de
-- autorização avaliada com `auth.uid()` respondendo por JWT real
-- (`set_config('request.jwt.claims', ...)`) — a pasta do contato está no conjunto
-- autorizado e `voice-changer/` não está. O ENFORCEMENT (papel `authenticated`
-- não admin: INSERT aceito em `<contato>/...` e recusado em
-- `audio-memes/voice-changer/...`) foi provado em PG 17 DESCARTÁVEL com os papéis
-- da plataforma emulados e as migrations reais: 9 asserções, todas PASS.
--
-- Read-only, sem side effects (transação implícita do db_query).
DO $$
DECLARE
  v_pred    text;
  v_public  boolean;
  v_faltou  text;
  v_contato uuid;
  v_user    uuid;
  v_pasta1  text;
  v_ok      boolean;
BEGIN
  -- T0: o caminho antigo era bucket público; o novo é privado (assinado na leitura)
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'audio-memes';
  IF v_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'g2_voz T0 FALHOU: audio-memes deixou de ser público (esperado true); public=%', v_public;
  END IF;
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'audio-messages';
  IF v_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'g2_voz T0 FALHOU: audio-messages tem de ser privado; public=%', v_public;
  END IF;
  RAISE NOTICE 'g2_voz: T0 ok (audio-memes público — por isso dado de cliente não pode ir para lá; audio-messages privado)';

  -- T1: a policy de INSERT do caminho novo autoriza pela PASTA DO CONTATO
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_pred
    FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polname = 'Users can upload assigned audio messages';
  IF v_pred IS NULL THEN
    RAISE EXCEPTION 'g2_voz T1 FALHOU: policy de INSERT de audio-messages ausente';
  END IF;
  IF position('audio-messages' IN v_pred) = 0
     OR position('contacts' IN v_pred) = 0
     OR position('profiles' IN v_pred) = 0 THEN
    RAISE EXCEPTION 'g2_voz T1 FALHOU: predicado sem pasta de contato atribuído: %', v_pred;
  END IF;
  RAISE NOTICE 'g2_voz: T1 ok (INSERT de audio-messages autoriza pela pasta do contato atribuído)';

  -- T2: a policy do caminho ANTIGO não autoriza pasta arbitrária (só <uid> ou admin)
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_pred
    FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polname = 'Auth upload audio memes owned';
  IF v_pred IS NULL THEN
    RAISE EXCEPTION 'g2_voz T2 FALHOU: policy de INSERT de audio-memes ausente';
  END IF;
  IF position('auth.uid()' IN v_pred) = 0 THEN
    RAISE EXCEPTION 'g2_voz T2 FALHOU: policy do meme sem pasta do próprio usuário: %', v_pred;
  END IF;
  IF position('contacts' IN v_pred) > 0 THEN
    RAISE EXCEPTION 'g2_voz T2 FALHOU: policy do meme passou a aceitar pasta de contato: %', v_pred;
  END IF;
  RAISE NOTICE 'g2_voz: T2 ok (audio-memes só aceita <auth.uid()> ou admin — voice-changer/ não passa)';

  -- T3: nada removido — as quatro policies de audio-messages seguem existindo
  SELECT string_agg(e.nome, ', ') INTO v_faltou
    FROM (VALUES ('Users can upload assigned audio messages'),
                 ('Users can read assigned audio messages'),
                 ('Users can update own audio messages'),
                 ('Users can delete own audio messages')) AS e(nome)
    LEFT JOIN pg_policy p
      ON p.polrelid = 'storage.objects'::regclass AND p.polname = e.nome
   WHERE p.polname IS NULL;
  IF v_faltou IS NOT NULL THEN
    RAISE EXCEPTION 'g2_voz T3 FALHOU: policy de audio-messages ausente/renomeada: %', v_faltou;
  END IF;
  RAISE NOTICE 'g2_voz: T3 ok (policies de audio-messages intactas)';

  -- T4 (lógica): com auth.uid() do atendente ATRIBUÍDO, a pasta do contato está
  -- no conjunto autorizado; 'voice-changer' não está e não é o uid dele.
  SELECT c.id INTO v_contato
    FROM public.contacts c JOIN public.profiles p ON p.id = c.assigned_to
   WHERE c.assigned_to IS NOT NULL
   LIMIT 1;
  IF v_contato IS NULL THEN
    RAISE NOTICE 'g2_voz: T4/T5 pulados (sem contato atribuído no banco)';
  ELSE
    SELECT p.user_id INTO v_user
      FROM public.contacts c JOIN public.profiles p ON p.id = c.assigned_to
     WHERE c.id = v_contato;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

    v_pasta1 := (storage.foldername(v_contato::text || '/voice-changer_1.webm'))[1];
    SELECT v_pasta1 IN (
             SELECT c2.id::text FROM public.contacts c2
              WHERE c2.assigned_to IN (SELECT p2.id FROM public.profiles p2 WHERE p2.user_id = auth.uid())
           ) INTO v_ok;
    IF v_ok IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'g2_voz T4 FALHOU: pasta do contato atribuído fora do conjunto autorizado (contato=%)', v_contato;
    END IF;

    IF (storage.foldername('voice-changer/1.mp3'))[1] = auth.uid()::text THEN
      RAISE EXCEPTION 'g2_voz T5 FALHOU: pasta voice-changer/ responde como a do próprio usuário';
    END IF;
    IF (storage.foldername('voice-changer/1.mp3'))[1] IN (
         SELECT c2.id::text FROM public.contacts c2
          WHERE c2.assigned_to IN (SELECT p2.id FROM public.profiles p2 WHERE p2.user_id = auth.uid())
       ) THEN
      RAISE EXCEPTION 'g2_voz T5 FALHOU: pasta voice-changer/ caiu no conjunto de contatos';
    END IF;
    RAISE NOTICE 'g2_voz: T4/T5 ok (uid=% pode gravar na pasta %, e voice-changer/ não passa pela policy)', v_user, v_contato;
  END IF;
END $$;
