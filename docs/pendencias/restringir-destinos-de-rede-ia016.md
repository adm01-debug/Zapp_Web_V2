# IA-016 — Restringir destinos de rede

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Restringir destinos de rede.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Política de egress (HTTPS, DNS, redirect, rede privada) em toda chamada
- **Existe hoje** (evidência da auditoria): _shared/media-egress.ts (mídia de webhook); adaptadores de IA fazem fetch(params.endpoint) sem política (_shared/ai-providers.ts:157,201)
- **Falta**: Egress nos adaptadores de provedor
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Config errada de provedor pode enviar dados/chave a host interno

## Dependências

Nenhuma registrada.

## Critério de aceite

- Política de egress (HTTPS, DNS, redirect, rede privada) em toda chamada
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).