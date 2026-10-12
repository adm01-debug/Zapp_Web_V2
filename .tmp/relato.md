Especialista: worker (auth) (area-auth-seguranca) + worker (edge) (area-edge-api)

## Números do diff (4 arquivos, 1 de teste, 12 casos Deno.test novos)
.tmp/relato.md (este relato), supabase/config.toml, supabase/functions/invite-user/index.ts, supabase/functions/invite-user/index.test.ts.

## O que mudou e por quê
- `supabase/functions/invite-user/index.ts` (novo): handler `handleInviteUserRequest` que convida por e-mail (`auth.admin.inviteUserByEmail`) com papel definido, em paridade com o V3. Autorização fechada: 401 sem JWT / JWT inválido; o papel do chamador é lido de `user_roles` com o cliente de escopo do próprio usuário (nunca com a service role) e consulta com erro FECHA (403); quem não é `admin` nem `supervisor` recebe 403; supervisor só convida `agent`, qualquer outro papel exige admin. O papel do convidado é **garantido pelo caminho de serviço** (update/insert em `user_roles` com service_role), sem depender de `handle_new_user_role` — que só cria `agent` para domínio confiável. Se a atribuição de papel falhar, a conta recém-criada é desfeita (`auth.admin.deleteUser`) e a resposta é erro. A auditoria registra quem convidou (`audit_logs`, `invited_by: caller.id`). A resposta não carrega link de convite.
- `supabase/functions/invite-user/index.test.ts` (novo): prova os caminhos padrão e os NEGADOS — sem Authorization, JWT inválido, usuário sem papel, consulta de papel com erro, supervisor pedindo papel privilegiado, corpo com campo extra (schema `.strict()`); e os caminhos de sucesso: supervisor→agent, admin→supervisor, domínio fora da empresa com papel ainda garantido, resposta sem link, falha do GoTrue (400 sem escrita de papel) e falha na atribuição (conta desfeita + 500).
- `supabase/config.toml`: declara `[functions.invite-user]` com `verify_jwt = true` (o front chama via `supabase.functions.invoke`, que já manda o JWT da sessão).

## Prova
- vermelho antes: `git cat-file -e HEAD~1:supabase/functions/invite-user/index.ts` → `fatal: path ... exists on disk, but not in 'HEAD~1'` (a função não existia na base; o teste importa `./index.ts`, que não resolvia).
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/invite-user/index.test.ts` → `ok | 12 passed | 0 failed`.

## O que NÃO fiz e por quê
- Não regenerei `supabase/functions/deployment-manifest.json` (arquivo derivado; o cartão diz que o integrador cuida).
- Não toquei `handle_new_user_role`, RLS, migrations nem o front (o cartão pede só o handler e o teste).
- Não implementei mensagem customizada no convite: `inviteUserByEmail` do GoTrue não aceita corpo de mensagem (o e-mail é do próprio GoTrue).
