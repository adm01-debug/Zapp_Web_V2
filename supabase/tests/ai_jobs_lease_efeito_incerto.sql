-- Teste determinístico da correção IA-202 / R2-API-026 (P2):
-- worker de IA não devolve para a fila job com efeito externo incerto.
--
-- Cenário: dois workers, chamada lenta e reaper — job 'running' com lease
-- vencido e efeito JÁ marcado vai ao terminal 'outcome_unknown' (decisão
-- explícita sobre efeito incerto) e o worker B NÃO o arranca (sem retry cego,
-- sem 2ª cobrança). Contraste: job 'running' com lease vencido SEM marca volta
-- para 'queued' (comportamento anterior preservado) e é arrancado normalmente.
--
-- Roda como service_role via GUC (mesmo idioma das demais suítes de
-- supabase/tests): auth.role() lê request.jwt.claims -> 'role'.
-- Sem exceção = suite verde. Limpa as próprias linhas ao final.
--
-- A suíte inteira roda numa transação que termina em ROLLBACK: o claim dos
-- workers A e C usa limite 100 e poderia arrendar jobs ALHEIOS no banco local;
-- o rollback devolve qualquer lease estranho e remove as linhas do teste.
--
-- Rodar: zapp-db-local psql <cópia> v2-<id-da-tarefa> < este arquivo

BEGIN;

DO $$
DECLARE
  v_job_efeito    uuid;
  v_job_sem_marca uuid;
  v_lease_token   uuid;
  v_row           public.ai_jobs%rowtype;
  v_mark1         timestamptz;
  v_mark2         timestamptz;
  v_ok            boolean;
  v_claimed_b     uuid;
  v_claimed_c     uuid;
  v_tentativas    int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ------------------------------------------------------------------------
  -- Preparação: o worker A arrenda os DOIS jobs num único claim; só o primeiro
  -- recebe a marca de efeito (o segundo fica 'running' sem marca, como um job
  -- cujo handler ainda não chegou ao efeito — ex.: manutenção local).
  -- ------------------------------------------------------------------------
  v_job_efeito := public.enqueue_ai_job(
    't202-efeito-' || gen_random_uuid()::text, 'ai.generate', 'ai-proxy',
    null, '{}'::jsonb);
  v_job_sem_marca := public.enqueue_ai_job(
    't202-sem-marca-' || gen_random_uuid()::text, 'ai.generate', 'ai-proxy',
    null, '{}'::jsonb);

  SELECT c.lease_token INTO v_lease_token
    FROM public.claim_ai_jobs('worker-a', 100, 30) AS c
   WHERE c.id = v_job_efeito;
  IF v_lease_token IS NULL THEN
    RAISE EXCEPTION 'T202 FALHOU: worker A não arrancou o job com efeito enfileirado';
  END IF;

  SELECT * INTO v_row FROM public.ai_jobs WHERE id = v_job_sem_marca;
  IF v_row.status <> 'running' OR v_row.lease_token IS NULL THEN
    RAISE EXCEPTION 'T202 FALHOU: worker A não arrendou o job sem marca no mesmo claim (status=%)', v_row.status;
  END IF;

  -- Marca do efeito: true na 1ª chamada, idempotente na 2ª (mesmo instante).
  v_ok := public.mark_ai_job_effect_started(v_job_efeito, v_lease_token);
  IF v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'T202 FALHOU: mark_ai_job_effect_started devolveu % para lease válido', v_ok;
  END IF;
  SELECT effect_started_at INTO v_mark1 FROM public.ai_jobs WHERE id = v_job_efeito;
  v_ok := public.mark_ai_job_effect_started(v_job_efeito, v_lease_token);
  SELECT effect_started_at INTO v_mark2 FROM public.ai_jobs WHERE id = v_job_efeito;
  IF v_ok IS DISTINCT FROM true OR v_mark2 IS DISTINCT FROM v_mark1 THEN
    RAISE EXCEPTION 'T202 FALHOU: marca não é idempotente (ok=%, mark1=%, mark2=%)', v_ok, v_mark1, v_mark2;
  END IF;

  -- ------------------------------------------------------------------------
  -- "Chamada lenta + reaper": o lease dos DOIS jobs vence e o worker B chega.
  -- ------------------------------------------------------------------------
  UPDATE public.ai_jobs
     SET lease_expires_at = now() - interval '1 minute'
   WHERE id IN (v_job_efeito, v_job_sem_marca);

  -- Worker B chama claim_ai_jobs: o reaper embutido roda ANTES do arrendamento.
  -- A fila do teste só tem as duas linhas acima, então este claim prova as duas
  -- decisões de uma vez: efeito marcado NÃO volta à fila; sem marca, volta.
  SELECT c.id INTO v_claimed_b
    FROM public.claim_ai_jobs('worker-b', 1, 30) AS c
   WHERE c.id = v_job_efeito;

  -- (i) Efeito incerto => outcome_unknown terminal, marca preservada.
  SELECT * INTO v_row FROM public.ai_jobs WHERE id = v_job_efeito;
  IF v_row.status <> 'outcome_unknown'
     OR v_row.last_error_code IS DISTINCT FROM 'EFFECT_OUTCOME_UNKNOWN'
     OR v_row.finished_at IS NULL
     OR v_row.lease_token IS NOT NULL
     OR v_row.effect_started_at IS NULL THEN
    RAISE EXCEPTION 'T202 FALHOU (i): job com efeito deveria ser outcome_unknown/EFFECT_OUTCOME_UNKNOWN com marca preservada — veio status=%, erro=%, finished=%, lease=%, marca=%',
      v_row.status, v_row.last_error_code, v_row.finished_at, v_row.lease_token, v_row.effect_started_at;
  END IF;

  -- (ii) Worker B NÃO arrancou o job de efeito incerto: sem retry cego, sem 2ª cobrança.
  IF v_claimed_b IS NOT NULL THEN
    RAISE EXCEPTION 'T202 FALHOU (ii): worker B arrancou o job com efeito incerto (reenvio cego)';
  END IF;

  -- (iii) Contraste: sem marca, o comportamento de hoje é preservado — volta
  -- para 'queued' (com backoff) e depois é arrancado normalmente.
  SELECT * INTO v_row FROM public.ai_jobs WHERE id = v_job_sem_marca;
  IF v_row.status <> 'queued' OR v_row.last_error_code = 'EFFECT_OUTCOME_UNKNOWN' THEN
    RAISE EXCEPTION 'T202 FALHOU (iii): job sem marca deveria voltar para queued, veio status=%, erro=%',
      v_row.status, v_row.last_error_code;
  END IF;

  -- O backoff coloca available_at no futuro; trazemos para o presente só para
  -- provar a arrancabilidade (a decisão do reaper já foi provada acima).
  UPDATE public.ai_jobs
     SET available_at = now() - interval '1 second'
   WHERE id = v_job_sem_marca;

  v_tentativas := v_row.attempt_count;
  SELECT c.id INTO v_claimed_c
    FROM public.claim_ai_jobs('worker-c', 100, 30) AS c
   WHERE c.id = v_job_sem_marca;
  IF v_claimed_c IS NULL THEN
    RAISE EXCEPTION 'T202 FALHOU (iii): job sem marca deveria ser arrancado pelo worker C';
  END IF;

  SELECT * INTO v_row FROM public.ai_jobs WHERE id = v_job_sem_marca;
  IF v_row.status <> 'running'
     OR v_row.effect_started_at IS NOT NULL
     OR v_row.lease_token IS NULL
     OR v_row.attempt_count <> v_tentativas + 1 THEN
    RAISE EXCEPTION 'T202 FALHOU (iii): novo claim deveria zerar a marca, dar novo lease e +1 tentativa — status=%, marca=%, lease=%, tentativas=%',
      v_row.status, v_row.effect_started_at, v_row.lease_token, v_row.attempt_count;
  END IF;

  -- Limpa as linhas do teste (inclusive o outcome_unknown terminal).
  DELETE FROM public.ai_jobs WHERE id IN (v_job_efeito, v_job_sem_marca);

  RAISE NOTICE 'T202 OK: efeito incerto -> outcome_unknown (worker B não arranca), sem marca -> queued e arrancado de novo, marca idempotente e zerada por tentativa';
END $$;

-- Devolve TUDO: as linhas do teste E qualquer lease de job alheio feito pelos
-- claims de limite 100 (ver cabeçalho).
ROLLBACK;
