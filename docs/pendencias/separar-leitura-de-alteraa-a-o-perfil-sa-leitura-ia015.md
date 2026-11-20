# IA-015 — Separar leitura de alteração (perfil só leitura)

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Separar leitura de alteração (perfil só leitura).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Perfil leitor que só recebe sugestões
- **Existe hoje** (evidência da auditoria): user_roles com 3 papéis (achado B10)
- **Falta**: Decidir/criar papel somente-leitura
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem perfil auditor/consulta

## Dependências

Decisão do dono

## Critério de aceite

- Perfil leitor que só recebe sugestões
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).