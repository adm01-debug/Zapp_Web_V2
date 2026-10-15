import { describe, it, expect } from 'vitest';
import { redactPII, redactPIIValue } from '@/lib/redactPII';

// Amostras SINTÉTICAS (nunca dado pessoal real).
const EMAIL = 'maria.souza@example.com';
const JWT =
  'eyJ' + 'hbGciOiJIUzI1NiJ9.cG9zdGxlc3Mtc2VncmVkbw.SflKxwRJSMeKKF2QT4fwpM';

describe('redactPII (string)', () => {
  it('mascara e-mail preservando o restante da mensagem', () => {
    const out = redactPII(`falha ao entregar para ${EMAIL} agora`);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('[EMAIL_REDACTED]');
    expect(out).toContain('falha ao entregar');
    expect(out).toContain('agora');
  });

  it('mascara telefone BR com e sem formatação', () => {
    expect(redactPII('contato +55 (11) 91234-5678')).not.toContain('91234-5678');
    expect(redactPII('contato (11) 91234-5678')).toContain('[TELEFONE_REDACTED]');
    expect(redactPII('contato 1134567890')).toContain('[TELEFONE_REDACTED]');
  });

  it('mascara JWT inteiro', () => {
    const out = redactPII(`PostgREST recusou header Authorization: Bearer ${JWT}`);
    expect(out).not.toContain(JWT);
    expect(out).toContain('[SEGREDO_REDACTED]');
  });

  it('mascara valor em apikey= preservando a chave', () => {
    const out = redactPII('GET /rest/v1/?apikey=abcdef123456&select=*');
    expect(out).not.toContain('abcdef123456');
    expect(out).toContain('apikey=[SEGREDO_REDACTED]');
  });

  it('mascara segredo longo solto (base64/hex)', () => {
    const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const out = redactPII(`token recebido ${secret} fim`);
    expect(out).not.toContain(secret);
    expect(out).toContain('[SEGREDO_REDACTED]');
  });

  it('mascara e-mail dentro de stack trace', () => {
    const stack = `Error: user ${EMAIL} not found\n  at useX (src/hooks/x.ts:10:3)`;
    const out = redactPII(stack);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('src/hooks/x.ts:10:3');
  });

  it('não altera texto sem PII', () => {
    expect(redactPII('timeout ao conectar no servidor')).toBe('timeout ao conectar no servidor');
  });

  it('mascara Authorization: Bearer <jwt> inteiro (ponto 1 da recusa)', () => {
    const out = redactPII(`saiu no log: Authorization: Bearer ${JWT} fim`);
    expect(out).not.toContain(JWT);
    expect(out).not.toContain('eyJ');
    expect(out).toContain('Authorization: [SEGREDO_REDACTED]');
    expect(out).toContain('saiu no log:');
    expect(out).toContain('fim');
  });

  it('mascara bearer=/token=/api-key: preservando a chave', () => {
    const opaque = 'abcdef1234567890';
    const b = redactPII(`query ?bearer=${opaque} fim`);
    expect(b).not.toContain(opaque);
    expect(b).toContain('bearer=[SEGREDO_REDACTED]');
    const t = redactPII('falha com token=abc123def456 fim');
    expect(t).not.toContain('abc123def456');
    expect(t).toContain('token=[SEGREDO_REDACTED]');
    const k = redactPII('header api-key: xyz789qrs012 fim');
    expect(k).not.toContain('xyz789qrs012');
    expect(k).toContain('api-key: [SEGREDO_REDACTED]');
  });
});

describe('redactPIIValue (details aninhados)', () => {
  it('mascara strings aninhadas e chaves sensíveis', () => {
    const out = redactPIIValue({
      source: 'edge',
      message: `falha com ${EMAIL}`,
      nested: { telefone: '27998887766' },
      password: 'senhaSuperSecreta123',
      list: [`token ${JWT}`],
    }) as Record<string, unknown>;

    const flat = JSON.stringify(out);
    expect(flat).not.toContain(EMAIL);
    expect(flat).not.toContain(JWT);
    expect(flat).not.toContain('senhaSuperSecreta123');
    expect(flat).not.toContain('27998887766');
    expect((out.nested as Record<string, unknown>).telefone).toBe('[TELEFONE_REDACTED]');
    expect(out.password).toBe('[SEGREDO_REDACTED]');
    expect(out.source).toBe('edge');
  });

  it('mantém valores não-string e não-objeto', () => {
    expect(redactPIIValue(42)).toBe(42);
    expect(redactPIIValue(null)).toBe(null);
    expect(redactPIIValue(true)).toBe(true);
  });

  it('redige subobjeto { user: { email, password } } (ponto 2 da recusa)', () => {
    const out = redactPIIValue({
      user: { email: EMAIL, password: 'trocar123' },
      ok: true,
    }) as Record<string, unknown>;
    const user = out.user as Record<string, unknown>;
    expect(user.email).toBe('[EMAIL_REDACTED]');
    expect(user.password).toBe('[SEGREDO_REDACTED]');
    expect(out.ok).toBe(true);
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(JSON.stringify(out)).not.toContain('trocar123');
  });

  it.each(['password', 'secret', 'token', 'api_key', 'authorization', 'cookie', 'senha'])(
    'troca o valor inteiro da chave sensível %s (ponto 5 da recusa)',
    (key) => {
      const out = redactPIIValue({ [key]: 'valor-qualquer-sem-pii' }) as Record<string, unknown>;
      expect(out[key]).toBe('[SEGREDO_REDACTED]');
    }
  );
});
