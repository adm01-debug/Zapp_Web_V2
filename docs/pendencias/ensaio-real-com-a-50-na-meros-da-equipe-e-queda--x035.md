# X035 — Ensaio real com ≥ 50 números da equipe e queda proposital

- **Estado**: BLOQUEADO
- **Prioridade**: P0
- **Anexo**: 01 · **Seção**: 3.4 Talk X — Fase 3 · Integridade e ensaio real (X024–X035: 11 concluídos, 1 bloqueado)

## Descrição e origem

Ensaio real com ≥ 50 números da equipe e queda proposital.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.4 Talk X — Fase 3 · Integridade e ensaio real (X024–X035: 11 concluídos, 1 bloqueado)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Campanha interna real antes de qualquer cliente
- **Existe hoje** (evidência da auditoria): Nada: sem docs/talkx/recovery/ENSAIO_MOTOR.md; docs/talkx/recovery/evidence/ só tem X023
- **Falta**: Executar o ensaio
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não há registro de envio do motor em produção; se nada foi testado fora do repositório, o primeiro envio real seria para cliente

## Dependências

N04 (números e chip do ensaio)

## Critério de aceite

- Campanha interna real antes de qualquer cliente
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).