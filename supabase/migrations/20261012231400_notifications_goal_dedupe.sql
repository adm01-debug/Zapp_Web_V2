-- notifications_goal_dedupe
-- Rollback: dropa a trigger e a função do contrato; a coluna dedupe_key e o índice ux_notifications_user_dedupe_key (IA-047) ficam intactos.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists notifications_goal_dedupe on public.notifications;
--   drop function if exists public.notifications_goal_dedupe_key();
--
-- Defeito: o aviso de meta era gravado pelo menos uma vez por render do card
-- (o hook deduplica só no useRef — recarregar, 2ª aba ou remontar o card
-- reenvia), e não havia trava nenhuma no banco. A coluna notifications.dedupe_key
-- e o índice parcial ux_notifications_user_dedupe_key (IA-047) já existem, mas
-- nenhum escritor preenchia a chave — então o índice nunca pegava nada.
--
-- Correção (aditiva, sem tocar GRANT, policy ou tabela): uma trigger BEFORE
-- INSERT calcula a chave estável do aviso de meta
-- ('goal:v1:<goal_id>:<period>:<dia em America/Sao_Paulo>') quando o escritor
-- não a informa, e PULA a inserção quando o mesmo aviso já existe. Duas
-- gravações iguais do mesmo usuário/meta/período/dia => 1 linha, sem erro. O
-- índice único continua sendo o backstop da corrida entre duas inserções
-- simultâneas (o escritor trata 23505 como sucesso).
--
-- Só o tipo 'goal' com o contrato metadata.goal_id + metadata.period entra no
-- contrato; qualquer outro aviso ou um dedupe_key já informado passam intactos.

-- Fail-closed: o contrato depende do índice parcial criado pela IA-047. Se ele
-- não existir (drive da base diferente), aborta em vez de deixar o dedupe pela
-- metade.
do $$
begin
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and indexname = 'ux_notifications_user_dedupe_key'
  ) then
    raise exception 'notifications_goal_dedupe: indice ux_notifications_user_dedupe_key ausente';
  end if;
end;
$$;

create or replace function public.notifications_goal_dedupe_key()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_goal   text;
  v_period text;
  v_key    text;
begin
  -- Quem já escreve a chave manda (escritor explícito / futura RPC).
  if new.dedupe_key is not null then
    return new;
  end if;

  -- Só o aviso de meta entra no contrato; os demais tipos seguem como antes.
  if new.type is distinct from 'goal' then
    return new;
  end if;

  v_goal   := nullif(btrim(coalesce(new.metadata ->> 'goal_id', '')), '');
  v_period := nullif(btrim(coalesce(new.metadata ->> 'period', '')), '');

  -- Sem o contrato completo não se inventa chave: grava como hoje (fail-open).
  if v_goal is null or v_period is null then
    return new;
  end if;

  -- 1 aviso por usuário/meta/período/dia; o dia é o dia local do produto
  -- (America/Sao_Paulo é o fuso padrão do repositório para "hoje").
  v_key := 'goal:v1:' || v_goal || ':' || v_period || ':' ||
           to_char((coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
  new.dedupe_key := v_key;

  -- O mesmo aviso já existe? Não grava de novo (nenhum erro chega ao cliente).
  if exists (
    select 1
      from public.notifications as n
     where n.user_id = new.user_id
       and n.dedupe_key = v_key
  ) then
    return null;
  end if;

  return new;
end;
$fn$;

comment on function public.notifications_goal_dedupe_key() is
  'Preenche notifications.dedupe_key do aviso de meta (goal_id+period+dia America/Sao_Paulo) e pula a insercao repetida do mesmo aviso (1 por usuario/meta/periodo/dia).';

drop trigger if exists notifications_goal_dedupe on public.notifications;
create trigger notifications_goal_dedupe
  before insert on public.notifications
  for each row
  execute function public.notifications_goal_dedupe_key();

-- A trigger roda sob o dono (SECURITY DEFINER); o cliente não chama a função.
revoke all on function public.notifications_goal_dedupe_key() from public, anon, authenticated;
