# C-12 — Multiplix: vozes, retornos e fila de falhas

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Multiplix: vozes, retornos e fila de falhas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Plano Multiplix (área 01)
- **Existe hoje** (evidência da auditoria): Edge multiplix-voices sem chamador; useMultiplixReplies.ts só em teste; list/count_multiplix_dead_letters sem tela; tabelas multiplix_audiences/_members sem uso
- **Falta**: telas
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Operador não vê respostas nem falhas do disparo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Plano Multiplix (área 01)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).