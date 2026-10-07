import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { navigateToView } from './useNavigationHistory';

/**
 * C03 — navigateToView(view, params?): parâmetros extras permitidos são gravados
 * na MESMA entrada de histórico (um único pushState/replaceState), com chave fora
 * da lista ignorada e valor inválido descartado:
 *  - emailContact: só UUID
 *  - emailTo: só e-mail válido de até 254 caracteres
 * Chamadas antigas navigateToView('x') ficam idênticas (não-regressão).
 */

const UUID = '123e4567-e89b-42d3-a456-426614174000';

const search = () => window.location.search;
const param = (name: string) => new URLSearchParams(window.location.search).get(name);

let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, '', '/?view=inbox');
  pushSpy = vi.spyOn(window.history, 'pushState');
  replaceSpy = vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
  pushSpy.mockRestore();
  replaceSpy.mockRestore();
});

describe('navigateToView — parâmetros extras', () => {
  it('sem params mantém o comportamento anterior: um pushState e só ?view= na URL', () => {
    navigateToView('contacts');

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(param('view')).toBe('contacts');
    expect(search()).toBe('?view=contacts');
  });

  it('com params grava emailContact e emailTo na MESMA entrada (um único pushState)', () => {
    navigateToView('email-chat', { emailContact: UUID, emailTo: 'maria@test.com' });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(param('view')).toBe('email-chat');
    expect(param('emailContact')).toBe(UUID);
    expect(param('emailTo')).toBe('maria@test.com');
  });

  it('descarta emailContact que não é UUID e chave fora da lista', () => {
    navigateToView('email-chat', {
      emailContact: 'nao-e-uuid',
      emailTo: 'maria@test.com',
      // chave desconhecida tem de ser ignorada
      ...({ view: 'hacked', admin: 'true' } as Record<string, string>),
    });

    expect(param('view')).toBe('email-chat');
    expect(param('emailContact')).toBeNull();
    expect(param('emailTo')).toBe('maria@test.com');
    expect(param('admin')).toBeNull();
  });

  it('descarta emailTo inválido e emailTo acima de 254 caracteres', () => {
    navigateToView('email-chat', { emailTo: 'isso-nao-e-email' });
    expect(param('emailTo')).toBeNull();

    navigateToView('contacts');
    const longo = `${'a'.repeat(250)}@x.co`; // 256 chars
    navigateToView('email-chat', { emailTo: longo });
    expect(param('emailTo')).toBeNull();
  });

  it('na view já ativa usa replaceState (não empilha) e ainda aplica os params', () => {
    window.history.replaceState(null, '', '/?view=email-chat');
    pushSpy.mockClear();
    replaceSpy.mockClear();
    navigateToView('email-chat', { emailContact: UUID, emailTo: 'a@b.co' });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(param('emailContact')).toBe(UUID);
    expect(param('emailTo')).toBe('a@b.co');
  });

  it('remove emailThread remanescente quando a navegação carrega intenção de contato', () => {
    // Cenário real: usuário saiu de uma conversa (?emailThread=t1) para a Inbox —
    // o parâmetro sobrevive na URL — e clica no e-mail de outro contato. A intenção
    // nova não pode ser barrada pela conversa velha.
    window.history.replaceState(null, '', '/?view=inbox&emailThread=thread-velha');
    navigateToView('email-chat', { emailContact: UUID, emailTo: 'maria@test.com' });

    expect(param('emailThread')).toBeNull();
    expect(param('emailContact')).toBe(UUID);
  });

  it('continua emitindo zapp:navigate com a view', () => {
    const seen: string[] = [];
    window.addEventListener('zapp:navigate', (e) => seen.push((e as CustomEvent).detail?.view));
    navigateToView('email-chat', { emailContact: UUID, emailTo: 'a@b.co' });
    expect(seen).toEqual(['email-chat']);
  });
});
