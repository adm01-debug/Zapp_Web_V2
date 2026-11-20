# IA-020 — Invalidar caches/acesso

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Invalidar caches/acesso.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Limpar resultados ao trocar usuário/papel
- **Existe hoje** (evidência da auditoria): queryClient.clear() no logout (src/hooks/auth/useAuth.tsx:145); chaves sem usuário (useRecentAnalyses.ts:22), nada ao perder papel
- **Falta**: Revalidar na troca de papel
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dado de outra identidade pode reaparecer na sessão

## Dependências

Nenhuma registrada.

## Critério de aceite

- Limpar resultados ao trocar usuário/papel
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).