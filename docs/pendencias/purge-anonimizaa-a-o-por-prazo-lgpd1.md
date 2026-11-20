# LGPD-1 — Purge/anonimização por prazo

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P0
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

Purge/anonimização por prazo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: lgpd-purge semanal; contatos/mensagens 2 anos, logs 90 dias
- **Existe hoje** (evidência da auditoria): catálogo: só purge_talkx_expired_data e ai_rate_limit_purge; 0 funções de anonimização; 0 anonymized_at; nenhum cron de expurgo geral
- **Falta**: Implementar jobs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dados pessoais guardados sem prazo — risco legal (LGPD art. 15/16)

## Dependências

decisão de prazos/DPO

## Critério de aceite

- lgpd-purge semanal; contatos/mensagens 2 anos, logs 90 dias
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).