# T90 — Trava para text-[Npx] < 12px

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.9 Correção de layout (30) e tipografia (100)

## Descrição e origem

Trava para text-[Npx] < 12px.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.9 Correção de layout (30) e tipografia (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: regra no guard
- **Existe hoje** (evidência da auditoria): 101 usos de text-[9px] em .tsx; sem trava
- **Falta**: Adicionar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Legibilidade

## Dependências

E37

## Critério de aceite

- regra no guard
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).