Especialista: worker (sql) (area-sql-banco)

# fix(db-auth): update_own_profile nao aceita mais e-mail e volta a funcionar no schema real

## O que estava errado
`public.update_own_profile(...)` (criada em `20260404170153`) expunha o parametro
`p_email` e gravava `profiles.email` direto — o e-mail de LOGIN (usado pelo Auth para
redefinir senha) podia ser trocado por qualquer usuario autenticado, sem confirmacao.
Ao subir o schema REAL no banco local descobri que a funcao estava pior do que
parecia: o corpo referenciava `profiles.display_name`, coluna que NAO existe neste
projeto (o catalogo oficial confirma: `profiles.name`), e passava `p_birthday TEXT`
para a coluna `profiles.birthday DATE`. Ou seja: qualquer chamada estourava com
`42703 column "display_name" does not exist`. A funcao estava morta e, junto com ela,
o hook `useSecureProfileUpdate` (exportado, sem uso em tela).

## O que fiz
- Migration nova `20261014023945_update_own_profile_sem_email.sql`:
  derruba a assinatura de 6 parametros e recria `update_own_profile` com 5
  (`p_display_name, p_avatar_url, p_phone, p_signature, p_birthday`) — o caminho do
  e-mail deixa de existir (42883 para quem tentar). De proposito NAO "conserto" o
  e-mail por outro caminho: e-mail de login so muda pelo fluxo do Auth.
- No mesmo corpo, alinho a funcao ao schema real: `p_display_name -> profiles.name`
  (mesmo mapeamento que `get_identity_matrix` ja usa: `p.name AS display_name`) e
  `p_birthday` convertido para DATE (`NULLIF(...,'')::date`). Sem isso eu nao teria
  como PROVAR nada num schema real — a funcao continuaria morta.
- Grants explicitos: `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE` para
  `authenticated` e `service_role`. Antes o EXECUTE herdado de PUBLIC deixava o
  `anon` chamar o RPC.
- Front ja estava ajustado no rascunho do cartao: `useSecureProfile.ts` parou de
  mandar `p_email`, e `types.ts` reflete a assinatura nova.
- Prova nova `supabase/tests/update_own_profile_sem_email.sql` (banco descartavel,
  migrations REAIS aplicadas por `\i`, sempre como papel real `SET LOCAL ROLE`):
  BLOCO A mostra o estado anterior (assinatura com `p_email` + corpo quebrado);
  BLOCO B mostra a correcao (assinatura morta, `anon` 42501, e-mail intacto apos
  update legitimo, birthday invalido estoura 22007 sem efeito parcial, guarda de
  privilegio de `profiles` continua armada, `role/access_level` intactos).
- `-- Rollback:` com o inverso executavel (recria a versao de 6 parametros com o
  corpo anterior e devolve os grants). Rodei os statements do rollback num Postgres
  descartavel: volta a assinatura de 6 e o EXECUTE de `authenticated`.

## Efeitos colaterais verificados (passada obrigatoria)
- A migration e so DDL: nao escreve dado, nao dispara gatilho de `updated_at`.
- O UPDATE do RPC continua sendo UMA instrucao (falha = nada aplicado) e nao toca
  `role`, `permissions` nem `access_level` (a guarda de privilegio nao bloqueia).
- A resposta/erro nao diferencia quem existe de quem nao existe (nao ha lookup de
  e-mail; a assinatura simplesmente nao aceita o parametro).
- Nenhum GRANT/papel/ACL alem dos grants do proprio RPC.

## Fora do escopo (registro)
- `supabase/schema-manifest.json` e `schema-catalog.json` ainda mostram a assinatura
  antiga: sao gerados a partir da base oficial pelo fluxo `types-sync`, nao editados
  a mao aqui (o cartao pede para nao mexer).
- O hook `useSecureProfileUpdate` nao e usado em nenhuma tela; deixei funcionando,
  mas nao inventei consumidor.

## Prova (saida real)

banco descartavel (migrations reais, como papel real):
```
PASS [A1 a assinatura de 6 parametros (com p_email) existe no estado anterior] -> true
PASS [A2 o RPC herdado estoura em qualquer chamada (coluna display_name inexistente)] -> ERRO 42703 column "display_name" does not exist
PASS [B1 a assinatura de 6 parametros (com p_email) NAO existe mais] -> false
PASS [B2 a assinatura viva tem 5 parametros e nenhum p_email] -> true
PASS [T1 authenticated nao consegue mais passar e-mail ao RPC] -> ERRO 42883 function public.update_own_profile(unknown, unknown, unknown, unknown, unknown, unknown) does not exist
PASS [T2 authenticated atualiza os campos nao sensiveis (true)] -> OK true
PASS [T2b profiles.name mudou] -> Nome Legitimo
PASS [T2e o e-mail continua o mesmo depois do update legitimo] -> original@example.com
PASS [T3 birthday invalido estoura 22007] -> ERRO 22007 invalid input syntax for type date: "ontem"
PASS [T5 anon nao executa o RPC (42501)] -> ERRO 42501 permission denied for function update_own_profile
PASS [T5c anon NAO tem EXECUTE] -> false
PASS [T6 o UPDATE do RPC nao escalou papel/permissao/access_level] -> agent|{}|basic
R2-DB-030 OK
EXIT=0
```
sem a correcao (`-v sem_correcao=1`), o teste FALHA:
```
ERROR: R2-DB-030 FALHOU [B1 a assinatura de 6 parametros (com p_email) NAO existe mais]: esperado false, obtido true
EXIT=3
```
banco LOCAL da tarefa (schema real, migration aplicada por `hermes-db-migrar`):
```
PASS [L2 authenticated nao passa mais e-mail ao RPC] -> ERRO 42883 ...
PASS [L3 authenticated atualiza campos nao sensiveis (true)] -> OK true
PASS [L3b name/phone/birthday mudaram no schema real] -> Nome Legitimo|11988887777|2026-10-14
PASS [L4 anon nao executa o RPC (42501)] -> ERRO 42501 permission denied for function update_own_profile
PASS [L6 o UPDATE do RPC nao escalou papel/access_level] -> agent|basic
R2-DB-030-LOCAL OK
EXIT=0
```
rollback do migration (statements `-- Rollback:` executados de verdade):
```
apos_migration assinatura_6=false
apos_rollback assinatura_6=true
apos_rollback assinatura_5=false
apos_rollback authenticated_exec=true
ROLLBACK_TEST_OK
EXIT=0
```

commit: 767a80dd01

## Sobre o alarme "código alterado sem teste"
O teste NASCEU neste cartão e está no commit 767a80dd01:
`supabase/tests/update_own_profile_sem_email.sql` (banco descartável, migrations
reais, papel real; vermelho com `-v sem_correcao=1`, verde sem ele), mais a prova
no banco LOCAL da tarefa em `.tmp/db_local_update_own_profile.sql`. As duas mudanças
em `src/**` são a ponta de cliente do MESMO contrato (tirar `p_email` do hook e da
tipagem gerada) — não há lógica de app a testar ali; o que prova o defeito é a suíte
de banco. Rodando o MESMO comando de fechar de novo.
