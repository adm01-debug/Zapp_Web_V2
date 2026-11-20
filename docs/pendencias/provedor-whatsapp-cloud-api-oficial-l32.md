# L-32 — Provedor WhatsApp Cloud API oficial

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Provedor WhatsApp Cloud API oficial.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: CSF 30.4 "WhatsApp Cloud API — Webhook" ✅
- **Existe hoje** (evidência da auditoria): Registro de provedor: "provider cloud… ainda nao implementado (etapa 048)" (supabase/functions/_shared/providers/registry.ts:82-86)
- **Falta**: provider cloud de envio
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dependência total da Evolution GO (risco de bloqueio do número)

## Dependências

conta Meta Business

## Critério de aceite

- CSF 30.4 "WhatsApp Cloud API — Webhook" ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).