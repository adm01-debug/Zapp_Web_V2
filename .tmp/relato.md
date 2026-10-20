Especialista: senior (area-sql-banco)
## O que mudou e por quê
- `supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql`: `admin_add_role` ganha bloco `EXCEPTION WHEN unique_violation` que converte a corrida em `role_already_assigned`; piso do `admin_remove_role` vira condicional (só quando a linha-alvo é o último admin); variável `v_admin_count` removida; cabeçalho documenta o piso condicional.
- `supabase/tests/user_roles_add_remove_role.sql`: fixtures normalizadas (apaga/reinsere as 4 linhas + pré-condições que falham rápido); asserção de catálogo do handler `unique_violation`; seção 5b (remover não-admin com 2 admins passa); regressão do piso (`alvo sem admin nao aciona o piso`).
- `src/integrations/supabase/types.ts`: revertido ao estado pré-cartão (saem as 20 linhas manuais de `admin_add_role`/`admin_remove_role`); N-018 é só banco e nada em `src/` referencia as RPCs.
## Prova
- verde: `zapp-db-local psql . v2-rr-t-6e68c7e9 < supabase/tests/user_roles_add_remove_role.sql` → `EXIT=0`, 44 linhas `[OK]`, zero `[FAIL]`, `TODOS OS CASOS PASSARAM`.
- vermelho ponto 1: banco sujo + teste antigo → `EXIT=3`, `[FAIL] alvo comeca com 1 papel`; mesmo banco sujo + teste novo → `EXIT=0`, 44 `[OK]`.
- vermelho ponto 3: funções antigas + teste novo → `EXIT=3`, `[FAIL] admin_add_role trata corrida unique_violation`.
- vermelho ponto 4: funções antigas + teste novo → `EXIT=3`, `[FAIL] alvo sem admin nao aciona o piso — msg="cannot_demote_last_admin" nao contem "role_not_assigned"`.
- corrida real (2 sessões simultâneas em `admin_add_role`): sessão A concede e faz COMMIT; sessão B recebe `ERROR: role_already_assigned` com `CONTEXT: PL/pgSQL function admin_add_role(uuid,app_role) line 31 at RAISE` (o RAISE do handler, não o da verificação prévia).
- rollback: os 2 DROPs do cabeçalho executados → `rpcs_restantes = 0`; migration reaplicada → 2 RPCs de volta com `prosecdef=t`; teste verde de novo (44 `[OK]`).
- subida: `migrations: 809 ok, 21 falha(s) de 832 | seed: ok`, sem `FALHAS NOVAS`, `TRAVAS: conferidas`; `down` executado ao final.
- `zapp-verify . v2-rr-t-6e68c7e9 --rapido` → OK `db_guard`, `tipos`, `lint`, `migrations`, `travas`; FALHOU só `banco_local` (causa ambiental, veredito `jev-juiz`: 190 diffs de estrutura vs retrato da produção sem nenhuma menção a `admin_add_role`/`admin_remove_role`/`user_roles`, e o agente não tem leitura de produção para desempatar).
## Pontos do revisor
- Ponto 1: resolvido — fixtures apagam e reinserem as 4 linhas sob `replica` e as pré-condições conferem 4 linhas/2 admins; prova no par vermelho/verde acima.
- Ponto 2: resolvido — a única contagem-limiar do diff anterior (`v_admin_count <= 1` na migration) foi removida pela reescrita do piso; nenhuma prosa de limiar foi acrescentada em teste, migration ou relato; as contagens do teste são exatas, sem escopo ampliado.
- Ponto 3: resolvido — `EXCEPTION WHEN unique_violation THEN RAISE role_already_assigned` no `admin_add_role`; prova na asserção de catálogo + corrida real acima.
- Ponto 4: resolvido — piso agora exige linha-alvo existente E nenhum outro admin (`IS DISTINCT FROM` protege NULL); documentado no cabeçalho da migration; regressão `alvo sem admin nao aciona o piso` + seção 5b; par vermelho/verde acima.
- Ponto 5: resolvido — `types.ts` revertido (diff do commit mostra só `-20`); zero referências a `admin_add_role`/`admin_remove_role` em `src/`; N-018 é só banco, nenhum gerador foi rodado porque não há o que gerar.
## O que NÃO fiz e por quê
- Não mexi na tela nem no cartão irmão; não dividi o cartão; não toquei fila do integrador, sensor, guardas ou CI.
- O commit `7d9004a3e4` (remoção de `.tmp/relato.md` de outro cartão, já gitignored) estava no branch antes de mim e aparece no `base..HEAD`; meu commit é só o `8e84d4c9ec`.
- Prova rodada no stack `v2-rr-t-6e68c7e9` (mesmas migrations do workspace): o stack `v2-2610130050c2ce` é derrubado pelo cleaner do sensor no meio do `up` (2 tentativas, log 21:06:13 "desligado (rc=0)") porque a fila marca o cartão como `devolvido`; registrado em comentário do cartão. `down` executado ao final.
