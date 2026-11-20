# I-375 — Quebrar god-files do Talk X

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.11 Issues abertas do GitHub (15)

## Descrição e origem

Quebrar god-files do Talk X.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.11 Issues abertas do GitHub (15)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: issue 13/09
- **Existe hoje** (evidência da auditoria): talkxShared.tsx não existe mais; TalkXCampaignRunning.tsx cresceu para 956 linhas
- **Falta**: dividir
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

- issue 13/09
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).