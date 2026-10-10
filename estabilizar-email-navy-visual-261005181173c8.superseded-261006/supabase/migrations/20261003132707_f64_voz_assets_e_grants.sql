-- 20261003132707_f64_voz_assets_e_grants
-- rollback: drop table if exists public.multiplix_voice_grants; drop table if exists public.multiplix_voice_assets; delete from storage.buckets where id = 'multiplix-voice';
--
-- F64 (Bloco H — Voz) — docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- Duas tabelas novas e um bucket novo. Nenhum objeto existente e alterado.
--
-- 1) `multiplix_voice_assets` — o ATIVO de audio gerado pela voz IA.
--    - `hash`: chave de deduplicacao do F65 = sha256(roteiro final, voice_id, modelo, voice_settings).
--      E o que faz "50 contatos com o mesmo roteiro" custarem UMA linha e UMA chamada ao TTS.
--    - `caminho`: caminho do objeto no bucket privado `multiplix-voice/<departamento>/...`; a entrega
--      e sempre por signed URL de TTL do envio, nunca por URL publica.
--    - `caracteres`/`duracao_ms`/`modelo`/`voice_id`: o que a estimativa de consumo do F66 mede e o
--      que a invalidacao do F45/F67 compara quando roteiro, voz ou parametro mudam.
--    - `invalidated_at`: corta o ativo sem apagar historico (a coluna `multiplix_blocks.asset_id`,
--      do F33, aponta para esta linha; o F45 ja zera esse ponteiro quando o roteiro muda).
--    - O ativo e imutavel depois de criado (nao ha `updated_at`): o unico movimento e invalidar.
--
-- 2) `multiplix_voice_grants` — quem pode usar a voz.
--    - `titular`: a pessoa que cedeu a voz. O consentimento fica REGISTRADO na linha, e nao inferido
--      de nome de voz ou de pasta.
--    - `roles`/`perfis`: quem no app pode usar (papel em `public.app_role` e/ou perfil em
--      `public.profiles`). Sem alvo a linha nao autoriza ninguem: o CHECK rejeita a linha em vez de
--      deixar um grant "para todos" por omissao.
--    - `revoked_at`: revoga o uso E a recuperacao do asset (a policy de SELECT do asset respeita).
--
-- 3) Bucket `multiplix-voice` PRIVADO (`public = false`). Sem policy em `storage.objects` para
--    `anon`/`authenticated`: quem assina e a edge, com a service key, por TTL do envio.
--
-- Grants/RLS seguem a convencao que o Bloco A fixou para o modulo (F01/F02/F03, migration
-- 20260929570000): `anon` fora do modulo; `authenticated` so com o que as policies usam; FORCE ROW
-- LEVEL SECURITY (o dono e postgres e tem BYPASSRLS, entao as RPCs/edges pela service key continuam
-- escrevendo); policies declaradas `TO authenticated`.
--
-- O papel do chamador NAO se le de `public.user_roles` dentro da policy: `authenticated` nao tem
-- SELECT nessa tabela (ela existe separada de `profiles` justamente por seguranca). O caminho da casa
-- e `public.has_role(auth.uid(), <role>)`, que e SECURITY DEFINER — mesma escolha que o F35 fez nas
-- policies de leitura compartilhada.
--
-- Classe: CONTRATO (tem `revoke`/`grant` e `force row level security`) — aplicada pelo
-- `hermes-tarefa-mergear` depois do merge e do deploy, como as demais migrations do modulo.

CREATE TABLE public.multiplix_voice_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL,
  caminho text NOT NULL,
  voice_id text NOT NULL,
  modelo text,
  caracteres integer,
  duracao_ms integer,
  created_by uuid,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_voice_assets_hash_key UNIQUE (hash),
  CONSTRAINT multiplix_voice_assets_caracteres_nao_negativo
    CHECK (caracteres IS NULL OR caracteres >= 0),
  CONSTRAINT multiplix_voice_assets_duracao_nao_negativa
    CHECK (duracao_ms IS NULL OR duracao_ms >= 0)
);

CREATE INDEX idx_multiplix_voice_assets_voice_id
  ON public.multiplix_voice_assets(voice_id);

CREATE INDEX idx_multiplix_voice_assets_validos
  ON public.multiplix_voice_assets(created_at DESC)
  WHERE invalidated_at IS NULL;

CREATE TABLE public.multiplix_voice_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text NOT NULL,
  titular text NOT NULL,
  roles public.app_role[],
  perfis uuid[],
  origem text,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_voice_grants_alvo_obrigatorio
    CHECK (roles IS NOT NULL OR perfis IS NOT NULL)
);

CREATE INDEX idx_multiplix_voice_grants_voice_id
  ON public.multiplix_voice_grants(voice_id)
  WHERE revoked_at IS NULL;

-- === F01: anon fora do modulo; authenticated so com o que as policies usam ===
-- As policies de voz so LEEM (nao ha policy de escrita: ativo e grant sao gravados pela edge com a
-- service key), entao o "minimo que as policies usam" aqui e SELECT — diferente de
-- multiplix_dispatches/recipients/blocks, cujas policies de rascunho exigem DML.
REVOKE ALL ON TABLE public.multiplix_voice_assets FROM anon;
REVOKE ALL ON TABLE public.multiplix_voice_grants FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.multiplix_voice_assets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.multiplix_voice_grants FROM authenticated;

GRANT SELECT ON TABLE public.multiplix_voice_assets TO authenticated;
GRANT SELECT ON TABLE public.multiplix_voice_grants TO authenticated;

-- === F02: FORCE RLS (o dono e postgres/BYPASSRLS: as edges pela service key seguem escrevendo) ===
ALTER TABLE public.multiplix_voice_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_voice_grants FORCE ROW LEVEL SECURITY;

-- === F03: policies de leitura ===
ALTER TABLE public.multiplix_voice_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_voice_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Granted callers can read voice assets" ON public.multiplix_voice_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_voice_grants g
      WHERE g.voice_id = multiplix_voice_assets.voice_id
        AND g.revoked_at IS NULL
        AND (
          (g.roles IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(g.roles) AS r WHERE public.has_role(auth.uid(), r)
          ))
          OR (g.perfis IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = ANY (g.perfis)
          ))
        )
    )
    OR created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Admins read every voice grant" ON public.multiplix_voice_grants
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Callers read their own voice grants" ON public.multiplix_voice_grants
  FOR SELECT
  TO authenticated
  USING (
    revoked_at IS NULL
    AND (
      (roles IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(roles) AS r WHERE public.has_role(auth.uid(), r)
      ))
      OR (perfis IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.id = ANY (perfis)
      ))
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('multiplix-voice', 'multiplix-voice', false)
ON CONFLICT (id) DO NOTHING;
