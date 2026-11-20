# L-18 — Exportação automática

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.5 Relatórios e exportação

## Descrição e origem

Exportação automática.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.5 Relatórios e exportação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: FORGOTTEN 3.18, CSF
- **Existe hoje** (evidência da auditoria): Tela fixa "Exportação Automática — Bloqueada… política de proteção de dados (LGPD)" (src/components/reports/AutoExportManager.tsx:1-27), ainda no menu (navigation.service.ts:150)
- **Falta**: decisão do dono
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Joaquim (LGPD)

## Critério de aceite

- FORGOTTEN 3.18, CSF
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).