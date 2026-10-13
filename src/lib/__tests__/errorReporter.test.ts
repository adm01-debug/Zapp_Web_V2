import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import { logAudit } from '@/lib/audit';
import {
  reportClientError,
  resetErrorReporterForTests,
  shouldReport,
} from '@/lib/errorReporter';

const mockedLogAudit = vi.mocked(logAudit);

describe('errorReporter', () => {
  beforeEach(() => {
    resetErrorReporterForTests();
    mockedLogAudit.mockClear();
  });

  describe('shouldReport (throttle/dedupe/teto)', () => {
    it('aceita a primeira ocorrência', () => {
      expect(shouldReport('boom', 'a', 1_000)).toBe(true);
    });

    it('deduplica a mesma mensagem+source', () => {
      expect(shouldReport('boom', 'a', 1_000)).toBe(true);
      expect(shouldReport('boom', 'a', 60_000)).toBe(false);
    });

    it('respeita o intervalo mínimo entre envios distintos', () => {
      expect(shouldReport('boom-1', 'a', 1_000)).toBe(true);
      expect(shouldReport('boom-2', 'a', 2_000)).toBe(false);
      expect(shouldReport('boom-2', 'a', 10_000)).toBe(true);
    });

    it('para no teto por sessão', () => {
      let now = 0;
      let accepted = 0;
      for (let i = 0; i < 50; i++) {
        now += 10_000;
        if (shouldReport(`err-${i}`, 'a', now)) accepted += 1;
      }
      expect(accepted).toBe(10);
    });
  });

  describe('reportClientError', () => {
    it('envia client_error com contexto e campos truncados', () => {
      const err = new Error('falhou '.repeat(800));
      reportClientError(err, { source: 'window.onerror' }, { force: true });
      expect(mockedLogAudit).toHaveBeenCalledTimes(1);
      const arg = mockedLogAudit.mock.calls[0][0];
      expect(arg.action).toBe('client_error');
      const details = arg.details as Record<string, unknown>;
      expect((details.message as string).length).toBeLessThanOrEqual(2_000);
      expect(details.source).toBe('window.onerror');
      expect(typeof details.buildId).toBe('string');
      expect(typeof details.sessionId).toBe('string');
    });

    it('aceita valores não-Error (reason de promise)', () => {
      reportClientError('string-reason', { source: 'unhandledrejection' }, { force: true });
      expect(mockedLogAudit).toHaveBeenCalledTimes(1);
      const details = mockedLogAudit.mock.calls[0][0].details as Record<string, unknown>;
      expect(details.message).toBe('string-reason');
    });

    it('não envia duplicata da mesma mensagem', () => {
      reportClientError(new Error('dup'), { source: 'a' }, { force: true });
      reportClientError(new Error('dup'), { source: 'a' }, { force: true });
      expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    });

    it('redige e-mail, telefone e segredo de message/stack/context antes de gravar', () => {
      const err = new Error(
        'falha para maria.souza@example.com tel (11) 91234-5678 Bearer ' +
          'eyJ' + 'hbGciOiJIUzI1NiJ9.cG9zdGxlc3Mtc2VncmVkbw.SflKxwRJSMeKKF2QT4fwpM'
      );
      err.stack = 'Error: maria.souza@example.com\n  at x (src/hooks/x.ts:1:1)';
      reportClientError(err, { source: 'edge', extra: 'joao@example.org' }, { force: true });

      const details = mockedLogAudit.mock.calls[0][0].details as Record<string, unknown>;
      const flat = JSON.stringify(details);
      expect(flat).not.toContain('maria.souza@example.com');
      expect(flat).not.toContain('joao@example.org');
      expect(flat).not.toContain('91234-5678');
      expect(flat).not.toContain('eyJ' + 'hbGciOiJIUzI1NiJ9.cG9zdGxlc3Mtc2VncmVkbw.SflKxwRJSMeKKF2QT4fwpM');
      expect(details.message).toContain('[EMAIL_REDACTED]');
      expect(details.message).toContain('[TELEFONE_REDACTED]');
      expect(details.extra).toBe('[EMAIL_REDACTED]');
      expect(details.stack).toContain('src/hooks/x.ts:1:1');
    });

    it('mascara o valor de chave sensível no contexto', () => {
      reportClientError(new Error('boom'), { source: 'a', apikey: 'segredo-123' }, { force: true });
      const details = mockedLogAudit.mock.calls[0][0].details as Record<string, unknown>;
      expect(details.apikey).toBe('[SEGREDO_REDACTED]');
    });
  });
});
