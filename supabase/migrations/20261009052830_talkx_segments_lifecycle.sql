-- talkx_segments_lifecycle
-- Rollback: drop trigger if exists talkx_segments_usage_guard on public.talkx_segments; drop function if exists public.talkx_segment_block_in_use(); drop table if exists public.talkx_segment_versions; drop function if exists public.talkx_segment_versions_trim(); drop index if exists public.idx_talkx_segments_tags; alter table public.talkx_segments drop constraint if exists talkx_segments_status_check; update public.talkx_segments set status = 'inactive' where status = 'draft'; alter table public.talkx_segments add constraint talkx_segments_status_check check (status in ('active','inactive')); alter table public.talkx_segments drop column if exists tags, drop column if exists icon, drop column if exists color, drop column if exists details, drop column if exists revision, drop column if exists draft_rules, drop column if exists draft_saved_at, drop column if exists published_at, drop column if exists published_by, drop column if exists archived_at;
--
-- TL-129 / X101 (Talk X, F09 Segmentos) — FATIA DE BANCO: a ESTRUTURA do ciclo de vida
-- do segmento (rascunho -> publicado -> arquivado).
--
--   1. Colunas de ciclo de vida em talkx_segments: tags (com indice GIN), icon, color,
--      details, revision, draft_rules, draft_saved_at, published_at, published_by,
--      archived_at. status passa a aceitar 'draft' (etapa 1 do aceite de X101).
--   2. talkx_segment_versions: historico das revisoes PUBLICADAS (rules + contagem +
--      nota + autor), com gatilho que mantem as 20 ultimas. Escrita so pelo caminho de
--      servico (RPC SECURITY DEFINER da etapa de publicacao, que ainda nao existe nesta
--      fatia); cliente autenticado so LE, e so o que a policy de leitura do segmento deixa.
--   3. Guarda de uso: o segmento usado por campanha em 'scheduled', 'sending' ou 'paused'
--      nao pode ser arquivado, inativado nem excluido — o erro devolve o nome da campanha.
--      E o "arquivar em vez de excluir" da decisao N22 (docs/talkx/v4/DECISOES.md).
--
-- O QUE ESTA MIGRATION DELIBERADAMENTE NAO FAZ (fica nas etapas seguintes, por dependencia):
--   * as RPCs save_talkx_segment_draft / publish_talkx_segment / restore / duplicate /
--     archive_talkx_segment: publish_talkx_segment valida com talkx_compile_segment_rules,
--     que ainda NAO existe em supabase/migrations/ (conferido: 0 arquivos). Sem ela a
--     publicacao nao tem como validar as regras, entao as RPCs vao junto com a etapa que
--     cria o compilador (X100). Esta fatia entrega o schema que os tipos do front precisam.
--   * reescrever as policies de escrita de talkx_segments (papel admin/supervisor) e tirar
--     o DELETE do authenticated: aqui a remocao destrutiva de segmento EM USO ja e barrada
--     pelo gatilho, sem retirar acesso de ninguem. A troca do DELETE fisico por arquivar
--     entra na etapa que troca o botao da tela (X110).
--   * publicar talkx_segments na publicacao realtime: ja e membro (migration
--     20260927570000_talkx_e27_realtime_campaign_events.sql). Coluna nova nao exige
--     republicar (a publicacao manda a linha inteira).
--
-- Nao ha DML aqui: nenhuma linha existente de talkx_segments e alterada (todas as colunas
-- novas nascem com default ou nulas), entao o rollback nao precisa devolver dado perdido —
-- exceto os status 'draft' criados DEPOIS, que o passo 8 do rollback reduz a 'inactive'
-- porque o CHECK antigo nao aceitava 'draft'.

-- 1. Colunas do ciclo de vida ----------------------------------------------------
alter table public.talkx_segments
  add column if not exists tags          text[]      not null default '{}'::text[],
  add column if not exists icon          text,
  add column if not exists color         text,
  add column if not exists details       text,
  add column if not exists revision      integer     not null default 0,
  add column if not exists draft_rules   jsonb,
  add column if not exists draft_saved_at timestamptz,
  add column if not exists published_at  timestamptz,
  add column if not exists published_by  uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at   timestamptz;

comment on column public.talkx_segments.tags is
  'Talk X (X101): etiquetas do segmento, buscaveis (indice GIN idx_talkx_segments_tags).';
comment on column public.talkx_segments.icon is
  'Talk X (X101): icone do cartao do segmento (lista do kit validada no front).';
comment on column public.talkx_segments.color is
  'Talk X (X101): cor do cartao do segmento (lista do kit validada no front).';
comment on column public.talkx_segments.details is
  'Talk X (X101): descricao longa do segmento (a "description" segue sendo a curta).';
comment on column public.talkx_segments.revision is
  'Talk X (X101): revisao publicada do segmento. Sobe a cada publicacao; o cliente manda a revisao que leu e a publicacao recusa revisao divergente (conflito entre abas).';
comment on column public.talkx_segments.draft_rules is
  'Talk X (X101): rascunho das regras AINDA NAO publicadas. Nao altera "rules" (a revisao publicada) enquanto nao for publicada.';
comment on column public.talkx_segments.draft_saved_at is
  'Talk X (X101): quando o rascunho foi gravado pela ultima vez (salvamento automatico).';
comment on column public.talkx_segments.published_at is
  'Talk X (X101): quando a revisao atual de "rules" foi publicada.';
comment on column public.talkx_segments.published_by is
  'Talk X (X101): quem publicou a revisao atual de "rules".';
comment on column public.talkx_segments.archived_at is
  'Talk X (X101): arquivado nesta data (decisao N22: sair de cena e ARQUIVAR, e o segmento some do filtro archived_at is null).';

-- 2. Indice GIN das tags ---------------------------------------------------------
create index if not exists idx_talkx_segments_tags
  on public.talkx_segments using gin (tags);

-- 3. status passa a aceitar o rascunho -------------------------------------------
-- O CHECK antigo (talkx_segments_status_check, da migration 20260908120000) nao aceitava
-- 'draft'. As linhas que ja existem so podem ser 'active' ou 'inactive' (as duas continuam
-- na lista nova), entao a validacao nao encontra linha legada invalida.
alter table public.talkx_segments drop constraint if exists talkx_segments_status_check;
alter table public.talkx_segments
  add constraint talkx_segments_status_check
  check (status in ('draft','active','inactive'));

-- 4. Historico das revisoes publicadas -------------------------------------------
create table if not exists public.talkx_segment_versions (
  id              uuid        primary key default gen_random_uuid(),
  segment_id      uuid        not null references public.talkx_segments(id) on delete cascade,
  version_no      integer     not null check (version_no > 0),
  rules           jsonb       not null,
  estimated_count integer     not null default 0,
  note            text,
  created_by      uuid        references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint talkx_segment_versions_segment_version_key unique (segment_id, version_no)
);
comment on table public.talkx_segment_versions is
  'Talk X (X101): revisoes PUBLICADAS de um segmento (uma linha por publicacao). O gatilho talkx_segment_versions_trim mantem as 20 ultimas; reconstruir uma revisao antiga e o restore da etapa de publicacao.';
comment on column public.talkx_segment_versions.estimated_count is
  'Talk X (X101): publico estimado NO MOMENTO da publicacao (o numero de entao, nao o de hoje).';

alter table public.talkx_segment_versions enable row level security;

-- Leitura espelha a policy de leitura de talkx_segments (dono da linha ou admin/supervisor).
-- ESCRITA: nenhuma policy — o cliente autenticado nao insere/edita/apaga versao; quem grava
-- e o caminho de servico (RPC SECURITY DEFINER da publicacao, dono da tabela).
create policy talkx_segment_versions_select
  on public.talkx_segment_versions for select to authenticated
  using (
    exists (
      select 1 from public.talkx_segments s
       where s.id = talkx_segment_versions.segment_id
         and (
           s.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
           or public.is_admin_or_supervisor(auth.uid())
         )
    )
  );

-- Tabela nova nasce fechada: RLS ligada (acima) + privilégio pelo papel explicito.
revoke all on public.talkx_segment_versions from public, anon, authenticated;
grant select on public.talkx_segment_versions to authenticated;
grant select, insert, update, delete on public.talkx_segment_versions to service_role;

-- Retencao: mantem as 20 ultimas revisoes de cada segmento -----------------------
create or replace function public.talkx_segment_versions_trim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.talkx_segment_versions
   where segment_id = new.segment_id
     and version_no not in (
       select version_no
         from public.talkx_segment_versions
        where segment_id = new.segment_id
        order by version_no desc
        limit 20
     );
  return null;
end;
$$;
comment on function public.talkx_segment_versions_trim() is
  'Talk X (X101): gatilho de retencao — depois de gravar uma revisao, descarta as que passarem das 20 ultimas do segmento.';

revoke execute on function public.talkx_segment_versions_trim() from public, anon, authenticated;

drop trigger if exists talkx_segment_versions_trim on public.talkx_segment_versions;
create trigger talkx_segment_versions_trim
  after insert on public.talkx_segment_versions
  for each row execute function public.talkx_segment_versions_trim();

-- 5. Guarda de uso: arquivar/inativar/excluir segmento em uso --------------------
-- N22: excluir segmento virou ARQUIVAR (reversivel). A guarda protege o caso que doi:
-- o segmento que uma campanha agendada/em envio/pausada ainda vai usar nao sai de cena.
-- Le as DUAS formas de uso da campanha: a coluna talkx_campaigns.segment_id (campanha de
-- um segmento) e a lista talkx_campaign_segments (X057, campanha com varios segmentos).
create or replace function public.talkx_segment_block_in_use()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_segment_id      uuid;
  v_saindo_de_cena  boolean;
  v_campaign_name   text;
  v_campaign_status text;
begin
  if tg_op = 'DELETE' then
    v_segment_id     := old.id;
    v_saindo_de_cena := true;
  else
    v_segment_id := new.id;
    -- so barrar o ATO de sair de cena: arquivar agora ou inativar agora. Renomear,
    -- marcar favorito ou gravar rascunho de um segmento ja arquivado seguem livres.
    v_saindo_de_cena := (new.archived_at is not null and old.archived_at is null)
                     or (new.status = 'inactive' and old.status is distinct from 'inactive');
    if not v_saindo_de_cena then
      return new;
    end if;
  end if;

  select c.name, c.status
    into v_campaign_name, v_campaign_status
    from public.talkx_campaigns c
   where c.status in ('scheduled','sending','paused')
     and (
       c.segment_id = v_segment_id
       or exists (
         select 1 from public.talkx_campaign_segments cs
          where cs.campaign_id = c.id
            and cs.segment_id  = v_segment_id
       )
     )
   order by c.created_at
   limit 1;

  if v_campaign_name is not null then
    raise exception
      'talkx_segment_in_use: o segmento % esta em uso pela campanha "%" (%) e nao pode ser arquivado, inativado nem excluido',
      v_segment_id, v_campaign_name, v_campaign_status
      using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
comment on function public.talkx_segment_block_in_use() is
  'Talk X (X101): guarda de uso — recusa arquivar, inativar ou excluir segmento usado por campanha scheduled/sending/paused, devolvendo o nome da campanha (decisao N22).';

-- funcao de gatilho: quem dispara e o proprio DML (o EXECUTE nao e concedido a ninguem)
revoke execute on function public.talkx_segment_block_in_use() from public, anon, authenticated;

drop trigger if exists talkx_segments_usage_guard on public.talkx_segments;
create trigger talkx_segments_usage_guard
  before update or delete on public.talkx_segments
  for each row execute function public.talkx_segment_block_in_use();
