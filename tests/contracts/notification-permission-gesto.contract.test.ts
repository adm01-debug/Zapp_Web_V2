import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato do "gesto do usuário" na permissão de notificação.
 *
 * O pedido de permissão do navegador tem UMA porta no front: o botão do painel de notificações.
 * Sem gesto o navegador nega o pedido (e penaliza o site), então nenhum hook de alerta pode
 * pedir por conta própria — nem na montagem, nem no meio de um alerta. Estes arquivos pediam:
 * `useRealtimeNotifications` e `useTranscriptionNotifications` na montagem, `useSentimentAlerts`
 * e `useRealtimeSentimentAlerts` a cada alerta de sentimento.
 *
 * Antes da correção este arquivo falha nos quatro hooks.
 */
const HOOKS_DE_ALERTA = [
  'src/hooks/realtime/useRealtimeNotifications.ts',
  'src/hooks/communication/useTranscriptionNotifications.ts',
  'src/hooks/inbox/useSentimentAlerts.ts',
  'src/hooks/inbox/useRealtimeSentimentAlerts.ts',
  'src/hooks/inbox/useRealtimeInbox.ts',
  'src/hooks/sla/useSLANotifications.ts',
  'src/hooks/analytics/useGoalNotifications.ts',
];

describe('permissão de notificação — só com clique', () => {
  it.each(HOOKS_DE_ALERTA)('%s não pede a permissão por conta própria', (arquivo) => {
    expect(read(arquivo)).not.toMatch(/requestNotificationPermission/);
  });

  it('a porta do pedido continua sendo o clique do painel de notificações', () => {
    const painel = read('src/components/notifications/NotificationSettingsPanel.tsx');
    expect(painel).toMatch(/requestNotificationPermission/);
    expect(painel).toMatch(/onClick=\{handleRequestPermission\}/);
  });
});
