# L-10 — Distribuição automática por user_settings (round-robin/aleatório/menor carga, timeout)

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Distribuição automática por user_settings (round-robin/aleatório/menor carga, timeout).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: CSF 19.2–19.4 ✅
- **Existe hoje** (evidência da auditoria): Campos só no tipo (src/hooks/system/useUserSettings.ts:27-29); a aba Automação não exibe esses controles (AutomationSettings.tsx só tem transcrição e auto-close) e nenhuma função SQL lê auto_assignment_method
- **Falta**: remover do doc ou implementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Doc promete escolha de método de distribuição inexistente (a distribuição real é por fila/carteira via triggers)

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 19.2–19.4 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).