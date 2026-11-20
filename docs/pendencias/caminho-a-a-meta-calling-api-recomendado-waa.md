# WA-A — Caminho A — Meta Calling API (recomendado)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P0
- **Anexo**: 03 · **Seção**: 3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)

## Descrição e origem

Caminho A — Meta Calling API (recomendado).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Recomendação da análise (:41): número na Cloud API, limite ≥ 2.000, tarifa BRL
- **Existe hoje** (evidência da auditoria): Não existe plano para o caminho recomendado; nenhum código de Cloud API
- **Falta**: Dono confirmar no Business Manager (limite, migração do número, tarifa) e escrever plano
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Caminho seguro (sem risco de banimento) parado

## Dependências

Dono (Business Manager)

## Critério de aceite

- Recomendação da análise (:41): número na Cloud API, limite ≥ 2.000, tarifa BRL
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).