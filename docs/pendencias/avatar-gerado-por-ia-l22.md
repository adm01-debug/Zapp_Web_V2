# L-22 — Avatar gerado por IA

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.6 Contatos, CRM e Catálogo

## Descrição e origem

Avatar gerado por IA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.6 Contatos, CRM e Catálogo).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: IMPROVEMENT P3.9 ✅, CSF 5.12
- **Existe hoje** (evidência da auditoria): AIAvatarGenerator.tsx removido; nada equivalente no código
- **Falta**: corrigir doc
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

Nenhuma registrada.

## Critério de aceite

- IMPROVEMENT P3.9 ✅, CSF 5.12
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).