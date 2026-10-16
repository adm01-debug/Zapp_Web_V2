-- contacts_scores_nullable
-- Rollback: devolve o DEFAULT 0 as duas colunas e reconverte para 0 toda pontuacao nula (o estado anterior gravava 0).
-- Rollback (SQL executável, na ordem):
--   ALTER TABLE public.contacts ALTER COLUMN lead_score SET DEFAULT 0;
--   ALTER TABLE public.contacts ALTER COLUMN risk_score SET DEFAULT 0;
--   ALTER TABLE public.contacts DISABLE TRIGGER "update_contacts_updated_at";
--   UPDATE public.contacts SET lead_score = 0 WHERE lead_score IS NULL;
--   UPDATE public.contacts SET risk_score = 0 WHERE risk_score IS NULL;
--   ALTER TABLE public.contacts ENABLE TRIGGER "update_contacts_updated_at";
--
-- PROBLEMA (cartao t_c18cd308)
-- public.contacts.lead_score e risk_score nasceram com DEFAULT 0 (20260409014536_...sql:136-137)
-- e NENHUM escritor de pontuacao existe: fora do Talk X (que so FILTRA por essas colunas em
-- talkx_audience_query/talkx_resolve_audience) nao ha INSERT/UPDATE de lead_score nem de
-- risk_score em supabase/migrations/** nem em supabase/functions/**. Logo o 0 gravado por
-- omissao nao e medicao — e ausencia de score. Como 0 e um valor VALIDO ("risco/lead muito
-- baixo"), a linha sem pontuacao ficou indistinguivel da linha pontuada com 0: a tela mostra
-- 'Lead score 0 / Baixo' (Crm360Tab) e 'Risk score 0' (AiTab) para todo mundo, e um
-- INSERT/UPDATE parcial que regrava defaults (achado lead_score_failed_load_writes_defaults)
-- passa a gravar 0 como se fosse medicao.
--
-- CORRECAO (aditiva: sem coluna nova, sem policy/GRANT/funcao/trigger/indice; as duas colunas
-- ja eram NULLABLE — o DEFAULT era o unico produtor do 0)
--   1) Tira o DEFAULT 0: contato novo sem pontuacao nasce NULL ('Sem score').
--   2) Converte para NULL os 0 que nao sao medicao. Prova de que nenhum 0 e medicao: nao
--      existe escritor (grep acima) e o banco local nao tem nenhum valor != 0 nas colunas
--      (o teste T0 mede isso ANTES de converter). O gatilho de updated_at fica desligado em
--      volta do UPDATE, senao as milhares de linhas convertidas teriam updated_at reescrito
--      e a data de atualizacao do contato (usada em ordenacao/relatorios) seria perdida.
--   3) Nada mais: nao ha calculo automatico de pontuacao (decisao separada do dono) e
--      supervisorPriority segue tratando nulo como 'sem sinal' (risk_score ?? 0).
--
-- UNICA CONDICAO DE CONTORNO: as duas colunas vem de 20260409014536_...sql, que FALHA no
-- replay local desta fabrica ("function public.is_admin_or_supervisor(uuid) does not exist" —
-- falha pre-existente, registrada em <stack>/estado/falhas.tsv antes desta migration existir),
-- entao o banco local nao tem as colunas. O bloco abaixo so age onde elas existem, que e o
-- caso de producao (supabase/schema-manifest.json lista contacts.lead_score e contacts.risk_score),
-- e avisa por NOTICE quando nao ha o que fazer — em vez de virar mais uma falha de replay.
-- A suite supabase/tests/contacts_scores_nullable.sql recria esse pre-estado (DEFAULT 0) e
-- entao aplica esta migration VERBATIM, provando o efeito real.
--
-- ACL: nada muda (nenhum GRANT/REVOKE) e `search_path` nao se aplica (nenhuma funcao nova).

SET search_path = public, pg_temp;

DO $$
DECLARE
  v_faltando text;
BEGIN
  SELECT string_agg(c.nome, ', ' ORDER BY c.nome)
    INTO v_faltando
    FROM (VALUES ('lead_score'), ('risk_score')) AS c(nome)
   WHERE NOT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'contacts'
              AND column_name = c.nome
         );

  IF v_faltando IS NOT NULL THEN
    RAISE NOTICE 'contacts.% ausente neste banco: migration sem efeito aqui (a 20260409014536 nao aplicou; em producao as duas colunas existem)', v_faltando;
    RETURN;
  END IF;

  -- 1) Sem DEFAULT: ausencia de pontuacao vira NULL ---------------------------------
  ALTER TABLE public.contacts ALTER COLUMN lead_score DROP DEFAULT;
  ALTER TABLE public.contacts ALTER COLUMN risk_score DROP DEFAULT;

  -- 2) Converte os 0 herdados do DEFAULT (updated_at preservado) ---------------------
  ALTER TABLE public.contacts
    DISABLE TRIGGER "update_contacts_updated_at";

  UPDATE public.contacts SET lead_score = NULL WHERE lead_score = 0;
  UPDATE public.contacts SET risk_score = NULL WHERE risk_score = 0;

  ALTER TABLE public.contacts
    ENABLE TRIGGER "update_contacts_updated_at";
END $$;
