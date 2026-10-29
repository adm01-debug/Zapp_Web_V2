-- passkey_credentials_hardening
-- Rollback: devolve ao cliente o INSERT e o UPDATE de tabela que a migration tirou — a policy "Users can insert own passkeys" volta a valer (INSERT TO authenticated com WITH CHECK user_id = auth.uid()) e o UPDATE volta a valer em TODAS as colunas, reabrindo o plantio de chave sem attestation e o zeramento do counter.
-- Rollback (SQL executável, na ordem):
--   create policy "Users can insert own passkeys" on public.passkey_credentials for insert to authenticated with check (user_id = auth.uid());
--   revoke update (friendly_name) on public.passkey_credentials from authenticated;
--   grant update on public.passkey_credentials to authenticated;
--
-- PROBLEMA (cartão t_c26fd639; achados HZ4-06 e HZ5-12 da auditoria de paridade
-- V3->V2 do doc docs/estado/26-hooks-raiz-4.md)
-- A RLS de public.passkey_credentials, como ficou em 20260317222728 (linhas 84-101),
-- dava ao usuário autenticado INSERT e UPDATE de QUALQUER coluna da PRÓPRIA linha.
-- O registro legítimo de passkey passa pela Edge Function webauthn, que roda com
-- service_role e só grava depois de conferir a attestation e o desafio emitido.
-- Com a policy de INSERT viva, o navegador (ou uma sessão sequestrada) planta a
-- PRÓPRIA chave direto na tabela, sem attestation e sem desafio — a passkey deixa
-- de ser prova de posse do autenticador. Com o UPDATE de tabela livre, o dono da
-- linha reescreve counter, public_key e credential_id: zerar o counter anula a
-- detecção de clone (o sinal de que a credencial foi copiada).
--
-- ESTADO ANTERIOR (conferido no código da cópia viva em 13/10/2026)
--   * nada no navegador faz INSERT em passkey_credentials — src/hooks/auth/useWebAuthn.ts
--     só usa select (linha 37), delete (linha 155) e update de friendly_name (linha 170);
--   * o INSERT e o UPDATE legítimos são da Edge webauthn, com service_role:
--     supabase/functions/webauthn/index.ts linhas 305 (insert) e 480 (update do counter).
--
-- CORREÇÃO (aditiva; não toca dado, coluna, função, trigger nem outro papel)
--   1) DROP da policy "Users can insert own passkeys" (TO authenticated): sem policy
--      de INSERT, a RLS nega o INSERT direto do cliente — o caminho de registro segue
--      sendo a Edge webauthn (service_role);
--   2) o UPDATE de TABELA do papel authenticated é REVOGADO e devolvido SÓ na coluna
--      friendly_name, que é o único UPDATE do cliente (renomear a passkey,
--      useWebAuthn.ts:170). counter / public_key / credential_id / device_type /
--      backed_up / transports param de ser graváveis pelo cliente;
--   3) SELECT e DELETE do dono ficam EXATAMENTE como estavam: as policies
--      "Users can view own passkeys" e "Users can delete own passkeys" seguem vivas e
--      as ACLs de SELECT/DELETE não são tocadas;
--   4) service_role (a Edge) não é afetado: é BYPASSRLS e mantém os GRANTs de tabela,
--      então o registro e a atualização do counter continuam funcionando.
--
-- Sem função nova nesta migration, então não há search_path a fixar.

-- 1) Sem policy de INSERT do cliente: a RLS passa a negar o INSERT direto.
drop policy if exists "Users can insert own passkeys" on public.passkey_credentials;

-- 2) UPDATE do cliente só na coluna do rename (friendly_name).
revoke update on public.passkey_credentials from authenticated;
grant update (friendly_name) on public.passkey_credentials to authenticated;
