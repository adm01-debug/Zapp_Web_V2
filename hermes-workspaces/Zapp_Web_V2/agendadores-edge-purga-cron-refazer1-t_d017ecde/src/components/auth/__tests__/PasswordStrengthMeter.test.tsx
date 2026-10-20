import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import React from 'react';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';

/**
 * S4790 / protocolo HIBP: o SHA-1 usado aqui NAO e escolha de seguranca.
 * A API Pwned Passwords (HaveIBeenPwned) define o k-anonimato em termos de
 * SHA-1 e o que viaja na URL e o prefixo de 5 caracteres do hash (a senha e o
 * restante do hash nunca saem do navegador). Trocar para SHA-256 muda o
 * prefixo e o servidor deixa de casar as faixas -> a checagem de senha vazada
 * quebra. Estes testes travam o protocolo: se alguem trocar o algoritmo,
 * o valor da URL muda e o teste falha.
 */
function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

function sha256Upper(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
}

const PASSWORD = 'Zapp!Senha123';

function mockFetch(body: string) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => ({
    ok: true,
    text: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PasswordStrengthMeter — k-anonimato HIBP em SHA-1 (S4790)', () => {
  it('consulta /range com o prefixo SHA-1 de 5 caracteres, nunca o prefixo SHA-256', async () => {
    const fetchMock = mockFetch('0000000000000000000000000000000000:1\n');
    render(<PasswordStrengthMeter password={PASSWORD} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 4000 });

    const sha1 = sha1Upper(PASSWORD);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);

    const prefix = url.split('/range/')[1];
    expect(prefix).toHaveLength(5);
    expect(sha1.slice(0, 5)).toBe(prefix);
    // Guarda anti-regressao real: SHA-256 produziria outro prefixo.
    expect(prefix).not.toBe(sha256Upper(PASSWORD).slice(0, 5));
  });

  it('preserva o prefixo de 5 caracteres mesmo em senha com acento (UTF-8)', async () => {
    const fetchMock = mockFetch('0000000000000000000000000000000000:1\n');
    const accented = 'Senhã@Forte1';
    render(<PasswordStrengthMeter password={accented} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 4000 });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1Upper(accented).slice(0, 5)}`);
  });

  it('envia o header Add-Padding exigido pelo protocolo', async () => {
    const fetchMock = mockFetch('0000000000000000000000000000000000:1\n');
    render(<PasswordStrengthMeter password={PASSWORD} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 4000 });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ 'Add-Padding': 'true' });
  });

  it('marca como comprometida quando o sufixo SHA-1 aparece na resposta', async () => {
    const sha1 = sha1Upper(PASSWORD);
    mockFetch(`0000000000000000000000000000000000:3\n${sha1.slice(5)}:42\n`);
    render(<PasswordStrengthMeter password={PASSWORD} />);

    expect(await screen.findByText('Senha comprometida!', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/42 vazamentos/)).toBeInTheDocument();
  });

  it('marca como segura quando o sufixo SHA-1 nao aparece na resposta', async () => {
    mockFetch('0000000000000000000000000000000000:7\n');
    render(<PasswordStrengthMeter password={PASSWORD} />);

    expect(
      await screen.findByText('Senha não encontrada em vazamentos conhecidos', undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
