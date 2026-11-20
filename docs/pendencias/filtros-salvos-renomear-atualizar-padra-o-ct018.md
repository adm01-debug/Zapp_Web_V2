# CT-018 — Filtros salvos (renomear/atualizar/padrão)

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Filtros salvos (renomear/atualizar/padrão).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Gestão completa de presets
- **Existe hoje** (evidência da auditoria): FilterPresets.tsx:46-54 só localStorage, salvar/aplicar/excluir
- **Falta**: Renomear, atualizar, padrão, persistência no servidor
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Preset some ao trocar de máquina

## Dependências

Nenhuma registrada.

## Critério de aceite

- Gestão completa de presets
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).