# L-38 — Whitelist de IP, IP bloqueado, bloqueio por país

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.8 Segurança, LGPD e IA

## Descrição e origem

Whitelist de IP, IP bloqueado, bloqueio por país.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.8 Segurança, LGPD e IA).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 24.6–24.8 ✅, README "Geo-blocking"
- **Existe hoje** (evidência da auditoria): RPC resolve_network_policy (migration 20261004182245) consumida só por auth-login (supabase/functions/_shared/request-policy.ts:132); requireAuth das Edges não aplica (cartão 27.3 da própria migration)
- **Falta**: aplicar no requireAuth
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Bloqueio vale só no momento do login

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 24.6–24.8 ✅, README "Geo-blocking"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).