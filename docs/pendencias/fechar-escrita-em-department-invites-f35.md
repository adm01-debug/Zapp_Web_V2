# F35 — Fechar escrita em department_invites

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Fechar escrita em department_invites.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: REVOKE + SELECT só admin
- **Existe hoje** (evidência da auditoria): Só TRUNCATE/anon revogados (20260928450000:20, 460000:20)
- **Falta**: Revogar após migrar front
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agente pode listar/criar códigos

## Dependências

F62

## Critério de aceite

- REVOKE + SELECT só admin
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).