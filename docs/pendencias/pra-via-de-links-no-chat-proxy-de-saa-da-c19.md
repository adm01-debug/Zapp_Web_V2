# C-19 — Prévia de links no chat (proxy de saída)

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Prévia de links no chat (proxy de saída).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: runbook preview-egress-proxy.md
- **Existe hoje** (evidência da auditoria): Código do proxy pronto (infrastructure/preview-egress-proxy/), Edge exige PREVIEW_EGRESS_PROXY_URL/SHARED_SECRET (supabase/functions/_shared/secure-egress.ts:97-99); runbook lista pré-requisitos de DNS/TLS/Traefik "não promover enquanto…"
- **Falta**: deploy na VPS + segredos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Links aparecem sem cartão de prévia

## Dependências

infra VPS (Joaquim)

## Critério de aceite

- runbook preview-egress-proxy.md
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).