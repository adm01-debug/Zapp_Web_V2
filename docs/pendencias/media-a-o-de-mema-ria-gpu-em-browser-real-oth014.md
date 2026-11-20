# OTH-014 — Medição de memória/GPU em browser real

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.7 E-mail NAVY (100 EN / 80 AC)

## Descrição e origem

Medição de memória/GPU em browser real.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.7 E-mail NAVY (100 EN / 80 AC)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Heap e render
- **Existe hoje** (evidência da auditoria): Medido só em jsdom (EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md:115-126)
- **Falta**: Playwright
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Heap e render
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).