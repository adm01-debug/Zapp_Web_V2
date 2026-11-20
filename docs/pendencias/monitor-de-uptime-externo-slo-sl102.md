# SL-102 — Monitor de uptime externo + SLO

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Monitor de uptime externo + SLO.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Check de /version.json com alerta
- **Existe hoje** (evidência da auditoria): docs/runbooks/slo.md "O que não existe hoje: monitor externo"; nada no repo
- **Falta**: Configurar monitor (UptimeRobot/BetterStack/N8N)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Site fora do ar só é percebido por usuário

## Dependências

dono

## Critério de aceite

- Check de /version.json com alerta
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).