# Plano — login com bloqueio real de IP/país/cidade (10/10/2026)

> Pedido do Joaquim: "implemente o mesmo padrão do Promo Gifts V4 aqui no Zapp Web V2".
> Antes de desenhar o plano, verifiquei o que já existe no Zapp — e achei um problema maior
> que "falta cidade": **o bloqueio de IP e de país não é aplicado em lugar nenhum**.

## 1. Achado P0 — o bloqueio de IP/país é decorativo hoje

O Zapp já tem painel de IP (`IPWhitelistPanel`, tabela `ip_whitelist`) e de país
(`GeoBlockingPanel`, tabela `geo_blocking_settings`), e já tem as funções de banco prontas:
`is_ip_whitelisted`, `is_ip_blocked`, `is_country_blocked`, `is_country_allowed`
(`supabase/migrations/20251231115910_...sql`, `20251231130733_...sql`, `20251231131019_...sql`).

**Nenhuma delas é chamada em lugar nenhum do app ou das Edge Functions.** Busquei no
repositório inteiro: a função de login real (`supabase/functions/auth-login/index.ts`, 199
linhas) só chama `clear_login_attempts` (limpa tentativas falhas após sucesso). Não existe
hook de Auth do Supabase configurado (`supabase/config.toml` sem `[auth.hook...]`), nem
trigger, nem nenhum outro ponto de chamada. Ou seja: um admin pode ligar "Blacklist" com o
Brasil inteiro bloqueado no painel, e o login continua funcionando normalmente de qualquer
lugar — o painel mente sobre o que está protegido.

(O que JÁ funciona de verdade: bloqueio por força bruta — `login_attempts` +
`is_account_locked`, usado em `src/lib/serverLogin.ts`. Esse pedaço não precisa de correção.)

## 2. Referência — como o Promo Gifts V4 faz (produção, `doufsxqlfjyuvxuezpln`)

- `fn_check_login_allowed(p_email, p_ip_address, p_city, p_user_agent)` — SECURITY DEFINER,
  fail-closed se a config não existir (usa defaults seguros), chamada ANTES do login real.
- IP: `ip_whitelist_enabled` + tabela `ip_whitelist`. País: não tem (só cidade). Cidade:
  `city_whitelist_enabled` + tabela `city_whitelist`.
- Loga todo bloqueio em `access_blocked_log` (email, ip, cidade, motivo).
- Resolve IP do chamador por `x-forwarded-for`; cidade/país por geoip server-side
  (`ip-api.com`, timeout 3s) numa function separada (`get-visitor-info`).
- **Ponto frágil do próprio Promo Gifts, não copiar sem pensar**: se o lookup de geoip falhar
  ou expirar, `p_city` chega `NULL` e o check de cidade é **pulado**, não bloqueado — ou seja,
  uma falha de rede no geoip hoje contorna a whitelist de cidade lá. Decisão a tomar no Zapp
  (ver §4): copiar esse comportamento ou ser mais rígido.

## 3. Plano por onda

### Onda 1 — P0, fecha o buraco real (bloqueio de IP e país que já existe mas não roda)

1. **Orquestrar e CHAMAR de verdade** — nova função `fn_check_login_allowed` (ou nome
   equivalente) que só orquestra as 4 funções que já existem (`is_ip_whitelisted`,
   `is_ip_blocked`, `is_country_blocked`, `is_country_allowed`) — sem reescrever a lógica
   delas. Chamar essa função dentro de `auth-login/index.ts`, **antes** de
   `signInWithPassword`, fail-closed se a consulta ao banco falhar (nega, não libera).
2. **Resolver IP e país do chamador dentro do próprio `auth-login`** — IP por
   `x-forwarded-for`/`x-real-ip` (mesmo padrão do Promo Gifts); país por geoip server-side.
   Decisão explícita a registrar no cartão: o que fazer se o geoip falhar (ver §4).
3. **Log de bloqueio** — tabela nova mínima (ou reaproveitar `audit_logs` se couber:
   confirmar antes de criar tabela nova) para o painel de Segurança mostrar quem foi
   bloqueado, de onde, e por quê.

### Onda 2 — paridade com o Promo Gifts (nível cidade, feature nova)

4. **Bloqueio por cidade** — tabela `city_whitelist` + toggle `city_whitelist_enabled` +
   painel novo (mesmo padrão visual de `IPWhitelistPanel`), plugado na função da onda 1.

## 4. Decisões do Joaquim (confirmadas em 10/10/2026)

1. **Modo de nascimento: DESLIGADO.** A onda 1 nasce com os toggles de IP/país exatamente
   no estado de hoje (desativados) — o Joaquim liga manualmente depois, quando a whitelist
   estiver completa. Não ativar "big bang" dentro deste cartão.
2. **Geoip indisponível: BLOQUEAR por padrão quando a whitelist estiver ATIVA.** Lista
   positiva — ausência de dado é suspeita, nega por segurança. Em Blacklist, não bloquear só
   por falta de dado (pular o check é seguro nesse modo).
3. **Serviço de geoip: `ip-api.com`**, mesmo serviço já em produção no Promo Gifts V4 —
   grátis, sem contrato novo. Ciente de que é um 3º terceiro recebendo o IP de cada login.

## Referências

- `supabase/functions/auth-login/index.ts` (login real, 199 linhas, hoje sem nenhum destes checks)
- `src/components/security/{IPWhitelistPanel,GeoBlockingPanel,BlockedIPDialogs}.tsx`
- `supabase/migrations/20251231115910_..., 20251231130733_..., 20251231131019_...` (funções já existentes)
- Promo_Gifts_V4: `supabase/migrations/20260904110000_audit_r4_sec008_fn_check_login_allowed_canonical.sql`,
  `supabase/functions/get-visitor-info/index.ts`
