# A2 — Quem pode inscrever terceiros em grupo

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Quem pode inscrever terceiros em grupo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Só admin/supervisor inscreve outro perfil
- **Existe hoje** (evidência da auditoria): 20261004185228:20 exige member_role='member' mas qualquer membro inscreve qualquer perfil
- **Falta**: Restringir
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Membro adiciona pessoas sem controle

## Dependências

Nenhuma registrada.

## Critério de aceite

- Só admin/supervisor inscreve outro perfil
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).