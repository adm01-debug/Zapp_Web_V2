# E37 — Departamento → conexão

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Departamento → conexão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Novo contrato
- **Existe hoje** (evidência da auditoria): Salvar WhatsApp do departamento grava em department_whatsapp_configs, tabela inexistente (src/hooks/team-chat/useDepartmentManagement.ts:245; known-violations.json:6); a RPC set_department_whatsapp_config existe mas não é usada
- **Falta**: Usar a RPC ou criar a tabela
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O botão "Salvar" do WhatsApp do departamento falha sempre

## Dependências

Nenhuma registrada.

## Critério de aceite

- Novo contrato
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).