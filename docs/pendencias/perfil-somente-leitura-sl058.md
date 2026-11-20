# SL-058 — Perfil somente-leitura

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Perfil somente-leitura.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Novo papel + RLS
- **Existe hoje** (evidência da auditoria): app_role = admin, supervisor, agent, special_agent (20251215025014…sql:2, 20260329175853…sql:2)
- **Falta**: Papel + policies
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Auditor/diretoria não tem acesso só de leitura; ou recebe acesso de escrita

## Dependências

trilha de banco

## Critério de aceite

- Novo papel + RLS
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).