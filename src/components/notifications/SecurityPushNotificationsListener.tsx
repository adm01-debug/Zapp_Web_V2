import { useSecurityPushNotifications } from '@/hooks/system/useSecurityPushNotifications';

/**
 * HZ1-10 — aviso de alerta de segurança no app inteiro.
 *
 * Antes o hook `useSecurityPushNotifications` só era montado dentro da Central
 * de Segurança: um alerta criado para o usuário só aparecia (push ou toast) se
 * a tela estivesse aberta. Este listener renderiza `null` (é efeito, não
 * contexto) e vive no slot de overlays do app (`DeferredProviders`, em
 * `src/App.tsx`) — logo, dentro do `AuthProvider` do `AppProviders`, que é quem
 * entrega a sessão para o hook armar o polling.
 *
 * Ele NÃO duplica o aviso quando a Central de Segurança abre em cima dele: o
 * laço de polling é um por usuário, dentro do próprio hook (ver
 * `src/hooks/system/__tests__/useSecurityPushNotifications.test.ts`, caso
 * "dois pontos de montagem NÃO duplicam consulta nem aviso").
 *
 * O import é dinâmico (chunk próprio) de propósito: o hook alcança o `sonner`,
 * e a lib não pode voltar ao grafo estático do entry — é o que trava o caso
 * "sonner (toasts são overlay lazy) não entra no grafo estático do entry" em
 * `src/__tests__/bundle-inicial.bundle.test.ts`. Mesmo padrão do
 * `TeamChatNotificationsListener` (TC-007, `src/App.tsx`).
 */
export function SecurityPushNotificationsListener() {
  useSecurityPushNotifications();
  return null;
}

export default SecurityPushNotificationsListener;
