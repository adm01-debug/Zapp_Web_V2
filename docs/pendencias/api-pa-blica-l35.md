# L-35 — API pública

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

API pública.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: FORGOTTEN #14, CSF 47
- **Existe hoje** (evidência da auditoria): Edge responde 410 (supabase/functions/public-api/index.ts:7); tela "temporariamente desativada" (src/components/admin/PublicApiDashboard.tsx) ainda mapeada em ViewRouter.tsx:90 mas fora do menu (inalcançável)
- **Falta**: credenciais hashadas por empresa, rotação, auditoria
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Parceiros não integram via API

## Dependências

redesenho de segurança

## Critério de aceite

- FORGOTTEN #14, CSF 47
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).