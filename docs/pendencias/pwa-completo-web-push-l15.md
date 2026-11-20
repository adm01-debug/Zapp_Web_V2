# L-15 — PWA completo + Web Push

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.4 Notificações, PWA e idioma

## Descrição e origem

PWA completo + Web Push.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.4 Notificações, PWA e idioma).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: IMPROVEMENT P1.14 ✅; CSF 20.3/20.4/20.12/20.13 (public/sw.js) ✅
- **Existe hoje** (evidência da auditoria): SERVICE_WORKER_ENABLED = false e push derivado (src/config/service_worker.ts:7-8); useServiceWorker desregistra workers; public/sw.js não existe; inscrição push com VAPID fixo no cliente (src/hooks/system/usePushNotifications.ts:25,116) e nenhuma tabela/Edge guarda ou envia push
- **Falta**: decidir: reativar (SW + armazenamento de inscrição + envio) ou retirar dos docs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agente não recebe alerta com a aba fechada

## Dependências

decisão registrada no código (desligado de propósito)

## Critério de aceite

- IMPROVEMENT P1.14 ✅; CSF 20.3/20.4/20.12/20.13 (public/sw.js) ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).