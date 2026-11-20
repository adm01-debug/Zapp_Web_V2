# C-03 — Convite de departamento (aceite)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Convite de departamento (aceite).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): Convites criados/excluídos (src/hooks/team-chat/useDepartmentManagement.ts:105,141,163); RPC accept_department_invite nunca chamada (só citada em comentário :57-58); tela bloqueada manda "Solicite um convite" (TeamChatPanel.tsx:89-90)
- **Falta**: tela/link de aceite
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Convite emitido não tem como ser usado

## Dependências

Nenhuma registrada.

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).