# L-23 — Versionamento de registros (histórico de versões)

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.6 Contatos, CRM e Catálogo

## Descrição e origem

Versionamento de registros (histórico de versões).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.6 Contatos, CRM e Catálogo).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: CSF 6.16 ✅
- **Existe hoje** (evidência da auditoria): useVersions existe (src/hooks/system/useVersions.ts:17) mas nenhuma tela o consome (VersionHistory.tsx removido)
- **Falta**: tela de histórico/restauração
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem trilha visível de alterações de contato

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 6.16 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).