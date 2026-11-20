# DIST-CFG — Preferência "método de distribuição" do usuário

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Preferência "método de distribuição" do usuário.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: round-robin/aleatório/menor carga (COMPLETE_SYSTEM_FEATURES.md:435 diz ✅)
- **Existe hoje** (evidência da auditoria): Coluna user_settings.auto_assignment_method com default 'roundrobin' (src/hooks/system/useUserSettings.ts:60), sem UI e sem consumidor no banco
- **Falta**: Ligar ou remover
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Configuração que não faz nada

## Dependências

Nenhuma registrada.

## Critério de aceite

- round-robin/aleatório/menor carga (COMPLETE_SYSTEM_FEATURES.md:435 diz ✅)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).