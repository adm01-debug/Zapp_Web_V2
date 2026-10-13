import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXServerResumePrecheck } from '../tracking/TalkXServerResumePrecheck';
import { parseServerResumePrecheck } from '@/hooks/integrations/useTalkXServerResumePrecheck';

describe('parseServerResumePrecheck', () => {
  it('lê o jsonb da RPC', () => {
    expect(
      parseServerResumePrecheck({
        can_resume: false,
        blockers: ['outside_send_window'],
        connection_status: 'connected',
        window_open: false,
        suppressed_pending_recipients: 0,
      }),
    ).toEqual({
      canResume: false,
      blockers: ['outside_send_window'],
      connectionStatus: 'connected',
      windowOpen: false,
      suppressedPendingRecipients: 0,
    });
  });

  it('forma inesperada vira null', () => {
    expect(parseServerResumePrecheck(false)).toBeNull();
    expect(parseServerResumePrecheck(null)).toBeNull();
    expect(parseServerResumePrecheck({ blockers: [] })).toBeNull();
  });
});

describe('TalkXServerResumePrecheck', () => {
  it('sem resultado não renderiza nada', () => {
    const { container } = render(<TalkXServerResumePrecheck precheck={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('can_resume mostra o estado pronto', () => {
    render(
      <TalkXServerResumePrecheck
        precheck={{ canResume: true, blockers: [], connectionStatus: 'connected', windowOpen: true, suppressedPendingRecipients: 0 }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('pronta para retomar');
  });

  it('lista os blockers com rótulo e contagem de suprimidos', () => {
    render(
      <TalkXServerResumePrecheck
        precheck={{
          canResume: false,
          blockers: ['connection_not_connected', 'recipients_suppressed'],
          connectionStatus: 'disconnected',
          windowOpen: true,
          suppressedPendingRecipients: 3,
        }}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('WhatsApp desconectado');
    expect(alert).toHaveTextContent('lista de supressão (3)');
  });
});
