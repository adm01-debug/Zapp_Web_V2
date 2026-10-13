Especialista: workersql
(area-sql-banco)

## Diff (números reais)
3 arquivos contra a base: 1 migration (`supabase/migrations/20261013230011_voip_profile_credentials.sql`), 1 teste (`supabase/tests/voip_profile_credentials_vault.sql`) e este próprio relato (`.tmp/relato.md`). Nenhum outro arquivo foi tocado.

## O que mudou e por quê
- supabase/migrations/20261013230011_voip_profile_credentials.sql (novo, aditivo): tabela `public.voip_profile_credentials` com UMA credencial por atendente (`profile_id` UNIQUE) e ramal único (`UNIQUE (lower(ramal))`, que é a trava contra "duas sessões com o mesmo ramal se derrubam"). A senha SIP **não** mora em coluna comum: a tabela guarda só o `ramal` e o `vault_secret_id` (segredo cifrado no Supabase Vault). RLS LIGADA + `REVOKE ALL` de PUBLIC/anon/authenticated/service_role: **não há caminho de tabela pelo PostgREST**. Duas RPC `SECURITY DEFINER` com `search_path = public, vault, pg_temp`: `get_voip_profile_credentials(profile_id)` (leitura, só `service_role` — o caminho da Edge) e `set_voip_profile_credentials(profile_id, ramal, senha)` (RPC administrativa: admin/supervisor autenticado ou `service_role`). A senha é criada/rotacionada no Vault e a linha é gravada em upsert na MESMA operação (atomicidade real, com trava de aviso por perfil). `-- Rollback:` completo e executável no topo do arquivo. Nenhum objeto existente é criado, alterado ou tem ACL tocada.
- supabase/tests/voip_profile_credentials_vault.sql (novo): prova no banco LOCAL com os papéis reais (postgres para assumir `SET ROLE`, `authenticated` admin, `authenticated` agente comum, `anon`, `service_role`). Cobre: RLS ligada; zero GRANT de tabela; RPCs SECURITY DEFINER com search_path fixo; EXECUTE só para quem deve; admin provisiona; agente comum e anon são NEGADOS; leitura pela RPC só com `service_role`; sem oráculo (perfil sem credencial e perfil inexistente devolvem o mesmo — 0 linhas); ramal já em uso é recusado e nada parcial aplicado; entrada inválida (ramal, senha vazia, perfil inexistente) falha sem deixar linha; a senha em claro não aparece em nenhuma coluna; rotação reaproveita o MESMO segredo do Vault sem duplicar linha; e no fim executa o bloco `-- Rollback` da migration e confere que o estado volta. Roda dentro de `BEGIN ... ROLLBACK` — não deixa dado sintético.

## Prova
- vermelho antes: `zapp-db-local psql . v2-2610130612b99d < supabase/tests/voip_profile_credentials_vault.sql` → `ERROR: relation "public.voip_profile_credentials" does not exist`
- migration aplicada (banco LOCAL): `hermes-db-migrar supabase/migrations/20261013230011_voip_profile_credentials.sql` → `APLICADA no banco LOCAL 'v2-2610130612b99d' (produção não foi tocada)`
- verde depois: `zapp-db-local psql . v2-2610130612b99d < supabase/tests/voip_profile_credentials_vault.sql` →
```
PROVA OK: voip_profile_credentials — credencial por atendente, senha no Vault, sem GRANT ao PostgREST
PROVA OK (rollback): o bloco -- Rollback da migration roda e desfaz tudo
```
- rollback: as 3 linhas do bloco `-- Rollback (SQL executável, na ordem):` são idênticas entre a migration e a prova executada (`diff` → `IDENTICAS`); executadas, removem tabela e RPCs, e o ROLLBACK devolve o estado.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (227s)`.

## Contrato para os cartões que dependem deste
- `get_voip_profile_credentials(p_profile_id uuid) returns table(ramal text, sip_password text)` — chamar com a chave `service_role`; devolve 0 linhas quando o atendente não tem credencial (é o sinal do fallback legado, sem distinguir perfil inexistente).
- `set_voip_profile_credentials(p_profile_id uuid, p_ramal text, p_sip_password text) returns uuid` — admin/supervisor autenticado (ou `service_role`); rotacionar é chamar de novo.
- A tabela continua fechada ao PostgREST por desenho: não trocar a leitura por `select` direto na tabela.

## O que NÃO fiz e por quê
- não toquei a Edge `get-sip-password` nem o front (arquivos de outros cartões; aqui é a trilha de banco).
- não atualizei `supabase/schema-manifest.json` (ele é gerado do banco oficial pelo job confiável; editar à mão é proibido).
- não criei `.test.sh` novo em `scripts/db-audit/` para não gerar órfão (o cartão pede a prova no banco LOCAL, em `supabase/tests/`).
- se o fechar acusar contradição de "sem DDL/migration" no rodapé: o rodapé vem do template e não se aplica a um cartão de banco.
