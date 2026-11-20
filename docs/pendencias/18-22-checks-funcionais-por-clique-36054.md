# 360-54 — 18/22 checks funcionais por clique

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.8 Inbox 360, Fidelidade Carvão, Coluna/Header

## Descrição e origem

18/22 checks funcionais por clique.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.8 Inbox 360, Fidelidade Carvão, Coluna/Header).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: E2E
- **Existe hoje** (evidência da auditoria): verificados "por leitura de código"
- **Falta**: E2E
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

idem

## Critério de aceite

- E2E
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).