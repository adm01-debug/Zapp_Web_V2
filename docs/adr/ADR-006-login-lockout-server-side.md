# ADR-006: Lockout de login assistido pelo cliente — risco aceito e caminho server-side

- **Status:** Accepted — implementado (edge `auth-login`, 2026-09-05)
- **Data:** 2026-09-05
- **Contexto:** review do PR #222 (cubic P1 em `supabase/config.toml`, CodeRabbit em
  `record-failed-login`, `useAuthForm.ts`, `20260904380000`)

## Contexto

O login usa `supabase.auth.signInWithPassword` direto do navegador. O contador de tentativas
falhas é alimentado pelo próprio cliente: depois de uma recusa, o front chama a edge
`record-failed-login` (sem JWT — ainda não existe sessão), que executa
`record_failed_login` com `service_role` para o e-mail informado. `check-account-lock`
(também sem JWT) diz ao front se a conta está travada antes de tentar.

Consequências desse desenho, apontadas na review:

1. **Bloqueio remoto de conta (DoS):** quem conhece o endpoint pode chamar
   `record-failed-login` cinco vezes com o e-mail de outra pessoa e travá-la, sem nunca ter
   errado uma senha. Os limites por IP (10/min) e por e-mail (20/min) só limitam a taxa.
2. **Contorno do lockout:** quem chama o endpoint de auth do Supabase diretamente ignora
   `check-account-lock` e nunca registra falha — o lockout protege apenas o fluxo pela UI.

O risco (1) **já existia** antes do #222: até 2026-09-04 o front chamava a RPC
`record_failed_login` como `anon`, com o mesmo efeito. O #222 apenas moveu a chamada para uma
edge com rate limit e validação de e-mail.

## Decisão (proposta) — risco aceito por enquanto, com mitigação e prazo

Aceitar o risco até a próxima onda, porque:

- o sistema é interno (equipe da Promo Brindes), os e-mails de agentes não são públicos e o
  dano de (1) é indisponibilidade temporária (escalonamento `2^(n-5)` min, teto 2^10),
  não acesso indevido;
- (2) não abre brecha nova: sem lockout server-side, o rate limit do GoTrue continua sendo
  a única barreira contra força bruta direta — como era antes.

Mitigações já em vigor: lock vigente não se estende com novas chamadas
(`20260905010000`), e-mail precisa ser sintaticamente válido, limites por IP e por e-mail
persistentes (`edge_rate_limits`).

## Caminho server-side (implementado em 2026-09-05)

Edge `auth-login` (verify_jwt = false, rate limit por IP e por e-mail):

1. recebe `{ email, password }`;
2. consulta `is_account_locked` — se travado, responde 423 sem tocar no GoTrue;
3. chama `signInWithPassword` com o client anon **dentro da edge**;
4. em recusa, chama `record_failed_login` (a falha é comprovada pelo próprio GoTrue) e
   responde 401 com `attempts/lockedUntil`;
5. em sucesso, chama `clear_login_attempts` e devolve `access_token`/`refresh_token`; o
   front faz `supabase.auth.setSession`.

Implementação: `supabase/functions/auth-login/index.ts` (verify_jwt = false, 10/min por IP e
20/min por e-mail em `edge_rate_limits`), `src/lib/serverLogin.ts` (cliente) e
`AuthService.signIn`. O front faz `supabase.auth.setSession({ access_token, refresh_token })`;
a sessão nasce em AAL1 exatamente como no `signInWithPassword` direto, então o desafio TOTP
(`TwoFactorAuth.tsx`) segue igual. Captcha do GoTrue está desligado neste projeto.

**Fallback deliberado:** se a edge não responder (rede, 5xx, 429, corpo sem sessão) o cliente
cai no `signInWithPassword` direto e volta a registrar a falha por `record-failed-login` — o
comportamento anterior, para uma edge fora do ar não derrubar o login. Recusas legítimas
(401/423) nunca caem no fallback.

**Limite do GoTrue:** `/auth/v1/token` aceita 1800 req/h por IP (rajadas de 30). Todo login
passa a sair do IP da edge; para a equipe atual isso é folga de ordens de grandeza, mas é o
teto a lembrar se o volume crescer.

`record-failed-login` e `check-account-lock` continuam publicados enquanto o fallback e o
pré-check do formulário existirem; retirá-los é a etapa seguinte, depois de um ciclo sem
fallback nos logs.

## Consequências

- Positivas: fecha (1) e (2) de vez; um único lugar decide lockout.
- Negativas: login passa a depender de uma edge (latência e mais um ponto de falha); o fluxo
  de MFA precisa ser retestado ponta a ponta.

## Referências

- ADR-004 (gates), `docs/audits/AUDITORIA_TECNICA_22_DIMENSOES_2026-09-05.md` (Autenticação)
- `supabase/functions/record-failed-login/index.ts`, `supabase/functions/check-account-lock/index.ts`
- `supabase/migrations/20260905010000_lockout_hardening.sql`
