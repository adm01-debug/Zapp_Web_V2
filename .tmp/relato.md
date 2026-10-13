Especialista: Edgar (area-edge-api)

Sensibilidade
- Padrões tocados: `service_role` (novo client na Edge para ler o Vault e gravar a trilha) e o
  rate limit que já existia (`rateLimit` injetável no handler).
- Nenhuma proteção afrouxada. Antes, um JWT válido com perfil ativo recebia a **mesma** senha
  para todo mundo (segredo global `SIP_PASSWORD`); agora recebe a credencial do PRÓPRIO perfil e,
  sem credencial, recebe 409 sem senha. Prova do caso NEGADO: 401 sem `Bearer`, 429 no rate
  limit, 403 token inválido/perfil inativo, 409 sem credencial, 500 sem senha quando a leitura
  ou a auditoria falham (todos com teste no handler REAL).
- Nenhuma referência ao banco/endpoint de produção; nada de deploy/push. O único `project_ref`
  que aparece nos testes é o host stub `stub.supabase.co`.
- O que muda para quem chama (front `src/lib/calls/sipProvisioning.ts`): o corpo de sucesso tem
  os MESMOS 5 campos (`server`, `user`, `wsPort`, `password`, `profileId`) — o front não muda.
  O erro deixou de ser 503 `SIP_NOT_CONFIGURED` e passou a 409 `VOIP_NOT_PROVISIONED` quando o
  atendente não tem ramal; o front trata qualquer erro como toast genérico, então não quebra.

O que fiz (1 defeito: a senha era global)
1. `handleGetSipPassword` deixou de ler `SIP_PASSWORD` do env. Passa a chamar a RPC do cartão pai
   `get_voip_profile_credentials(p_profile_id)` (SECURITY DEFINER, só `service_role`) com o
   `profile.id` — que vem do token (`auth.getClaims` → `profiles.user_id`), NUNCA do corpo.
2. `user` (ramal) saiu do `provisionamentoSip`: era o `phone1` compartilhado. Hoje o ramal vem da
   credencial do atendente; `server`/`wsPort` continuam vindo do servidor (defaults T15 intactos).
3. Sem credencial (RPC devolve 0 linhas) → 409 `VOIP_NOT_PROVISIONED`, sem senha no corpo.
4. RPC que falha → 500 "Falha ao ler a credencial SIP", sem fallback e sem senha.
5. Auditoria da leitura em `audit_logs` (service role; a policy `Block authenticated inserts` tem
   `WITH CHECK (false)`): `action='sip_credentials_read'`, `entity_id=profile.id`, `details={ramal}`
   — **sem a senha** — e `ip_address`. Se a auditoria falhar, a senha NÃO sai (500): leitura de
   segredo sem rastro é justamente o que a função existe para não permitir (falha fechada).

Sobre os 2 apontamentos do juiz barato (medidos por mim agora, não de cabeça)
1. Números: o diff tem 5 arquivos e 2 deles são de teste (`supabase/functions/get-sip-password/index.test.ts`
   e `supabase/tests/voip_profile_credentials_vault.sql`) — a lista exata está no bloco "Arquivos" acima.
   A prova dos testes é a saída literal do runner (`ok | 16 passed | 0 failed`), com o comando no bloco
   "Prova" abaixo. Não uso contagem de cabeça em nenhum número deste relato.
2. Arquivos fora de "ARQUIVOS QUE PODE TOCAR": já explicado na seção "Dependência trazida" — são a
   faixa do cartão PAI (t_c0087e07), trazida por ordem explícita do body deste cartão como
   pré-requisito de build, sem alterar um byte. Não é para revertê-lo nem virar comentário: sem a RPC
   do pai a minha função não compila o critério. Pelo próprio recado do juiz ("rode o MESMO comando de
   novo sem mudar nada"), repito o fechar sem mudar o código.

Verificação do fechar — falha de AMBIENTE (não é o meu código)
`hermes-tarefa-fechar` rodou 2× e as duas foram VERMELHO no passo `tipos`, sempre por execução, não por
erro de tipo: `tsc saiu 137 ... (falha de execução, NÃO é aprovação)` — 137 é SIGKILL por falta de
memória. No momento, a máquina está com `load average 44` (30 usuários) e `Mem: 48171 total, 43458
usados, swap 8192/8192` — o tsc do `app` é morto pelo OOM killer antes de concluir. O `jev-juiz falha`
classifica o log como **environment** ("rode de novo uma vez; se repetir, registre no relato e siga sem
mexer no código"). Os passos `dependencias` e `db_guard` passam OK. O meu diff é Deno (supabase/functions)
e o `tsc` do `app` não cobre estes arquivos: a prova da minha parte é o `deno test` (16 passed) e o
`deno check` (os 2 arquivos OK), que rodam em segundos e não tocam o tsc do front. Nada no meu diff muda
o front, então não vejo caminho em que esta falha seja minha.

Ramo de erro — antes vs. depois (comparação pedida pela skill)
- Antes: sem `SIP_PASSWORD` no env → 503 `SIP_NOT_CONFIGURED`. Agora: não existe mais segredo
  global, então esse ramo não existe; o equivalente virou 409 `VOIP_NOT_PROVISIONED` (perfil sem
  ramal), que é o caso de dependência externa (o admin não provisionou), não erro de runtime.
- Antes: JWT inválido → 401; perfil ausente/inativo → 403; rate limit → 429. Depois: IGUAL.
- Novos: RPC falha → 500; auditoria falha → 500. Ambos fecham, não entregam senha.
- `catch` geral: inalterado (500 genérico) — e a mensagem passa pelo `errorResponse`, que mascara.

Dependência trazida — INDISPENSÁVEL e ORDENADA PELO PRÓPRIO CARTÃO
O body deste cartão diz literalmente: "se o que eles fazem não estiver no seu workspace, traga a FAIXA
inteira (`git cherry-pick ...`)" — os cartões "ARQUIVOS QUE PODE TOCAR" são os 2 de
`supabase/functions/get-sip-password/`, e os outros 2 arquivos do diff são a faixa do cartão PAI
(t_c0087e07), que não estava em `dia/2026-10-13`. Eu os trouxe sem alterar um byte (commit
`49bf622c25`), como pré-requisito de build: é a migration que cria a tabela `voip_profile_credentials`
no Vault e a RPC `get_voip_profile_credentials` que a minha função chama — sem ela a Edge não tem de
onde ler a credencial. Não é trabalho de outro cartão trazido por conta própria, não é achado de
escopo e não devo revertê-lo: revertido, a entrega não fecha o critério (a RPC não existiria).

Prova (vermelho → verde)
- Comando: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/get-sip-password/index.test.ts`
- VERDE (código novo): `ok | 16 passed | 0 failed (29ms)` — os 16 incluem os 4 antigos do T15.
- VERMELHO (mesmo teste contra o `index.ts` da base): `Found 15 errors` no type-check (a API nova
  não existe) e, com `--no-check`, `SyntaxError: The requested module './index.ts' does not
  provide an export named 'credencialSipPorAtendente'` → `FAILED | 0 passed | 1 failed`.
- `deno check --config scripts/ci/deno.json --frozen supabase/functions/get-sip-password/{index,index.test}.ts` → os dois OK.

O que o teste cobre (chama o handler real, com clientes dublês injetados por `deps`)
- Atendente A e atendente B na MESMA função: cada um recebe só o próprio ramal/senha, e a RPC é
  chamada com o `p_profile_id` do token de cada um (A não lê B).
- Sem credencial → 409 + `code=VOIP_NOT_PROVISIONED` + corpo SEM `password`.
- RPC falha → 500 e corpo sem senha (sem fallback).
- A leitura grava `audit_logs` com `action=sip_credentials_read` e `details` sem a senha; a
  auditoria que falha → 500 e a senha não sai.
- 401 sem `Bearer`, 403 token inválido e perfil inativo, 429 no rate limit.
- Regressão: o código da Edge não contém mais `SIP_PASSWORD` (não há segredo global de fallback).

Arquivos (`git diff --name-only dia/2026-10-13...HEAD`)
.tmp/relato.md
supabase/functions/get-sip-password/index.test.ts
supabase/functions/get-sip-password/index.ts
supabase/migrations/20261013230011_voip_profile_credentials.sql
supabase/tests/voip_profile_credentials_vault.sql

Anotações da lista: `.tmp/relato.md` é este relato; `index.ts` e `index.test.ts` são o meu trabalho
(16 casos `Deno.test` no arquivo, 4 do T15 pré-existente); a migration e o `supabase/tests/...vault.sql`
são a faixa do cartão pai, sem alteração de um byte (ver "Dependência trazida").

NÃO FEITO (fora da minha área, vira comentário no cartão)
- `docs/telefonia/CAPACIDADES.md` linha 26 ainda diz "um único segredo `SIP_PASSWORD` para todos
  os agentes" e a linha 25 diz ramal `phone1` — texto ficou velho com esta entrega. Não é meu
  arquivo (área de docs) e não é exigido pelo CRITÉRIO DE PRONTO.
- `src/lib/calls/sipProvisioning.ts`: o toast para o novo 409 cai no genérico "Erro ao conectar ao
  servidor SIP"; mensagem específica ("fale com o administrador") é cartão de front.
- Manifesto de deploy NÃO regenerado (o integrador regenera — skill `afinar-edge` §6).
