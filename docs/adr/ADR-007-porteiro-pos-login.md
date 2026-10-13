# ADR-007: Porteiro pós-login — política de rede e conta ativa para sessões que não passam pelo `auth-login`

- **Status:** Accepted (proposta) — implementado localmente em 2026-10-13; **sujeita a veto do Joaquim**
- **Data:** 2026-10-13
- **Contexto:** auditoria de paridade V3 → V2 (docs 10–40), achado de segurança em
  autenticação/RLS; cartão `t_5f904bf8`

## Contexto

O login por senha passa pela Edge `auth-login`, que decide lockout e política de rede
(ADR-006 / R2-AUTH-022) antes de emitir a sessão. **Os demais caminhos de login não passam
por ela**:

- Google / `signInWithOAuth`;
- link por e-mail (magic link) e OTP;
- password grant direto no GoTrue — aceito pela ADR-006 como *limite residual*.

Esses caminhos emitem uma sessão no GoTrue sem qualquer decisão de política de rede. Nas
Edges protegidas, o `requireAuth` (`_shared/validation.ts`) reaplica a política
(`resolve_network_policy`), mas o **PostgREST/RLS — que serve a maior parte do app — não
passa por ali**. Resultado: uma conta de país bloqueado (ou já inativa) que entrou por
Google continuava lendo dados pelo PostgREST com o JWT recém-emitido.

## Decisão

Criar a Edge **`post-login-gate`**, chamada pelo cliente **logo após qualquer login que não
passou pelo `auth-login`**, para o usuário **já autenticado**. O porteiro:

1. valida o bearer e resolve o usuário (`auth.getUser`);
2. decide a política de rede na fronteira canônica `resolve_network_policy`
   (mesma RPC do `auth-login` e do `requireAuth`; endpoint canônico `post-login-gate`);
3. confere `profiles.is_active` do **próprio** chamador (linha ausente = inativa, falha fechada);
4. **permitido** → `200 {allowed:true}`;
5. **negado** (política 403 ou conta inativa) → **encerra a sessão** pela primitiva canônica
   `revoke_auth_sessions` (service_role, self-only) e devolve a **mesma recusa genérica do
   login** (`403 {"error":"Access denied"}`), sem revelar se foi IP, país ou conta inativa.

Encerramento da sessão: com o claim `session_id` do JWT, revoga **só a sessão atual**
(scope `local`, self-only imposto no SQL); sem o claim, cai em `global` do **próprio usuário**
— nunca de terceiro.

**Indecidível (503) não revoga.** Se a RPC de política ou a leitura de perfil falham, o
porteiro responde `503` genérico sem encerrar a sessão: não há prova de negação e revogar em
indisponibilidade derrubaria sessões legítimas. O cliente trata qualquer resposta diferente de
`{allowed:true}` como recusa e encerra a sessão local (fail-closed no front).

## Cobertura e não-cobertura

**Coberto:** todo login que passe pelo porteiro (Google, e-mail/OTP, password grant direto)
deixa de manter sessão quando a política de rede nega ou a conta está inativa.

**Não coberto (risco residual explícito):** um ator que **não** chame o porteiro — cliente
customizado que fala direto com o PostgREST usando o JWT já emitido — continua lendo dados
**até o `exp` do access token**. O porteiro **não é um bloqueio de rede do GoTrue nem do
PostgREST**; é o caminho oficial da aplicação que passa a falhar fechado. Fechar esse vetor
exige decisão separada de arquitetura/infra (hook de senha do Supabase, `custom_access_token`
com hook de autorização, ou RLS que consulte a política por requisição), validada antes de
qualquer mudança no provedor de identidade.

**Janela do JWT:** entre o login e a resposta do porteiro existe uma janela curta em que o
JWT já vale; ela é minimizada chamando o porteiro **imediatamente** após `setSession`. Após
uma negação, o access token revogado deixa de valer por refresh/sessão, mas o token de acesso
**já emitido permanece válido até o `exp`** (mesmo comportamento documentado na ADR-006) — o
`revoke_auth_sessions` remove `auth.sessions` e os refresh tokens, não o JWT em trânsito.

## Coordenação

- **PD-03 (`t_cd4627c5`)** cobre `banned_until`/ban do GoTrue. Este porteiro cobre **apenas**
  política de rede + `profiles.is_active`; o ban entra naquele cartão para não duplicar o
  decisor.
- **PD-01** desliga o cadastro público — eixo independente; coordenar para não sobrepor.
- **Front:** o porteiro precisa ser chamado logo após o login social/OTP. A chamada no cliente
  (`AuthService`/`AuthContext`) está **fora dos arquivos deste cartão** (área de
  telas/services) e deve ser feita em cartão próprio; registrado como achado.

## Consequências

- Positivas: os caminhos de login fora do `auth-login` passam a ter um decisor único de
  política de rede + conta ativa, alinhado à fronteira canônica já existente.
- Negativas: mais um ponto de falha após o login; sessões sociais dependem da disponibilidade
  do porteiro (resolvido com fail-closed no front).

## Referências

- `supabase/functions/post-login-gate/index.ts` e `index.test.ts`
- `supabase/functions/auth-login/index.ts` (ADR-006), `_shared/request-policy.ts`,
  `_shared/validation.ts` (`requireAuth`)
- `supabase/migrations/20261004182245_resolve_network_policy_rpc.sql`,
  `supabase/migrations/20261004181921_revoke_auth_sessions.sql`
- ADR-006: `docs/adr/ADR-006-login-lockout-server-side.md`
