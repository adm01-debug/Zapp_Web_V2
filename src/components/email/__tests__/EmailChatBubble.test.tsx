import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailChatBubble } from '../EmailChatBubble';
import type { EmailMessage } from '@/hooks/integrations/useGmail';
import { sanitizeEmailHtml, buildBodyPreview } from '@/lib/emailHtml';

// jsdom não aplica CSS real: asserções são sobre classes/atributos renderizados,
// não pixels (honestidade de teste — o layout visual é validado na matriz manual).

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t: unknown, prop: string) => {
      if (prop === 'div') return ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>;
      return ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>;
    },
  }),
}));

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'm1', thread_id: 't1', gmail_message_id: 'g1', gmail_account_id: 'a1',
    from_address: 'cliente@exemplo.com', from_name: 'Cliente Exemplo',
    to_addresses: ['eu@promobrindes.com.br'], cc_addresses: [], bcc_addresses: [],
    reply_to_address: null, subject: 'Orçamento', body_text: '', body_html: '', snippet: '',
    label_ids: [], is_read: true, is_starred: false, has_attachments: false,
    direction: 'inbound', internal_date: '2026-09-04T11:00:00-03:00',
    ...overrides,
  } as EmailMessage;
}

describe('sanitizeEmailHtml (h538172)', () => {
  it('remove width fixo px de table/td mas mantém cores', () => {
    const out = sanitizeEmailHtml('<table style="width:600px;color:#333"><tr><td style="width:300px;color:red">x</td></tr></table>');
    expect(out).not.toContain('width:600px');
    expect(out).not.toContain('width:300px');
    expect(out).toContain('color:#333');
    expect(out).toContain('color:red');
  });

  it('mantém img (antes removida) e adiciona lazy + no-referrer', () => {
    const out = sanitizeEmailHtml('<img src="https://cdn.exemplo.com/logo.png" alt="logo">');
    expect(out).toContain('<img');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('referrerpolicy="no-referrer"');
  });

  it('força target=_blank + rel=noopener em links', () => {
    const out = sanitizeEmailHtml('<a href="https://evil.example">clique</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('noopener');
  });

  it('remove script e onclick', () => {
    const out = sanitizeEmailHtml('<p onclick="alert(1)">a</p><script>alert(2)</script>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
  });

  it('neutraliza style hostil (clickjacking/tracker) mas mantém cores', () => {
    const out = sanitizeEmailHtml('<div style="position:fixed;inset:0;z-index:9999;background:url(//tracker.exemplo/x);color:blue">a</div>');
    expect(out).not.toContain('position:fixed');
    expect(out).not.toContain('z-index');
    expect(out).not.toContain('url(');
    expect(out).toContain('color:blue');
  });

  it('política de style vale para TODOS os elementos (li inclusive)', () => {
    const out = sanitizeEmailHtml('<ul><li style="background:url(//tracker.exemplo/px);color:green">item</li></ul>');
    expect(out).not.toContain('url(');
    expect(out).toContain('color:green');
    expect(out).toContain('item');
  });

  it('img data: URL gigante vira placeholder sem src', () => {
    const bigData = 'data:image/png;base64,' + 'A'.repeat(40000);
    const out = sanitizeEmailHtml(`<img src="${bigData}" alt="foto">`);
    expect(out).not.toContain('data:image/png');
    expect(out).toContain('foto');
  });

  it('mantém largura percentual e descarta px', () => {
    const out = sanitizeEmailHtml('<table><tr><td style="width:50%">ok</td><td style="width:640px">no</td></tr></table>');
    expect(out).toContain('width:50%');
    expect(out).not.toContain('width:640px');
  });
});

describe('buildBodyPreview (h538172)', () => {
  it('corta em palavra e não no meio', () => {
    const text = 'palavra '.repeat(60);
    const out = buildBodyPreview(text, 300);
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('decodifica entities comuns', () => {
    expect(buildBodyPreview('Olá&nbsp;mundo &amp; cia')).toBe('Olá mundo & cia');
  });
});

describe('EmailChatBubble (h538172)', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renderiza HTML sanitizado quando body_html existe (mesmo com body_text)', () => {
    const msg = makeMessage({
      body_html: '<table style="width:600px"><tr><td>Conteúdo tabela</td></tr></table>',
      body_text: 'Conteúdo tabela',
    });
    render(<EmailChatBubble message={msg} isLast />);
    expect(screen.getByText('Conteúdo tabela')).toBeInTheDocument();
    const host = document.querySelector('.email-html-body');
    expect(host).not.toBeNull();
  });

  it('preview textual honesto quando não há HTML', () => {
    const msg = makeMessage({ body_text: 'Frase curta suficiente.' });
    render(<EmailChatBubble message={msg} isLast />);
    expect(screen.getByText('Frase curta suficiente.')).toBeInTheDocument();
  });

  it('colapsa HTML longo com botão "Ver e-mail completo"', () => {
    const msg = makeMessage({
      body_html: `<p>${'linha de conteúdo '.repeat(80)}</p>`,
      body_text: '',
    });
    render(<EmailChatBubble message={msg} isLast />);
    expect(screen.getByRole('button', { name: 'Ver e-mail completo' })).toBeInTheDocument();
    const collapsed = document.querySelector('.email-html-collapsed');
    expect(collapsed).not.toBeNull();
  });

  it('sem HTML: botão alterna expandir/colapsar (B1 fix)', () => {
    const msg = makeMessage({ body_text: 'x'.repeat(500), body_html: '' });
    render(<EmailChatBubble message={msg} isLast={false} />);
    const btn = screen.getByRole('button', { name: 'Ver e-mail completo' });
    fireEvent.click(btn);
    expect(screen.getByText('x'.repeat(500))).toBeInTheDocument();
    const btnMenos = screen.getByRole('button', { name: 'Ver menos' });
    fireEvent.click(btnMenos);
    expect(screen.queryByText('x'.repeat(500))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver e-mail completo' })).toBeInTheDocument();
  });
});
