/**
 * resolverDestinoPosLogin — porte da V3: o usuário volta para a tela pedida,
 * sem redirecionamento aberto. Cobre ?next=, state.from (Location inteiro, como
 * o ProtectedRoute manda ao /2fa), query/hash preservados e os recusados
 * (URL externa, '//', 'javascript:', encode, rotas de autenticação).
 */
import { describe, it, expect } from 'vitest';
import { resolverDestinoPosLogin } from '@/lib/postLoginRedirect';

describe('resolverDestinoPosLogin — destino interno preservado', () => {
  it('usa ?next= e preserva query e hash', () => {
    expect(resolverDestinoPosLogin({ search: '?next=/crm?view=kanban#topo' })).toBe('/crm?view=kanban#topo');
  });

  it('usa state.from como Location inteiro (shape do ProtectedRoute)', () => {
    expect(
      resolverDestinoPosLogin({
        search: '',
        state: { from: { pathname: '/crm', search: '?view=kanban', hash: '#topo' } },
      }),
    ).toBe('/crm?view=kanban#topo');
  });

  it('aceita state.from como string', () => {
    expect(resolverDestinoPosLogin({ state: { from: '/configuracoes/perfil' } })).toBe('/configuracoes/perfil');
  });

  it('?next= tem prioridade sobre state.from', () => {
    expect(
      resolverDestinoPosLogin({
        search: '?next=/filas',
        state: { from: { pathname: '/crm' } },
      }),
    ).toBe('/filas');
  });

  it('sem destino nenhum cai em /', () => {
    expect(resolverDestinoPosLogin({})).toBe('/');
    expect(resolverDestinoPosLogin(null)).toBe('/');
    expect(resolverDestinoPosLogin(undefined)).toBe('/');
  });

  it('preserva o destino quando o path é a própria raiz', () => {
    expect(resolverDestinoPosLogin({ search: '?next=/' })).toBe('/');
  });
});

describe('resolverDestinoPosLogin — redirecionamento aberto recusado', () => {
  it('recusa URL com esquema', () => {
    expect(resolverDestinoPosLogin({ search: '?next=https://evil.example/x' })).toBe('/');
    expect(resolverDestinoPosLogin({ state: { from: 'http://evil.example' } })).toBe('/');
  });

  it("recusa 'javascript:'", () => {
    expect(resolverDestinoPosLogin({ search: '?next=javascript:alert(1)' })).toBe('/');
  });

  it("recusa '//' (protocol-relative)", () => {
    expect(resolverDestinoPosLogin({ search: '?next=//evil.example/x' })).toBe('/');
  });

  it('recusa barra invertida (browser trata como /)', () => {
    expect(resolverDestinoPosLogin({ search: '?next=/\\evil.example' })).toBe('/');
  });

  it('recusa o encode de /%2F%2F', () => {
    expect(resolverDestinoPosLogin({ search: '?next=/%2F%2Fevil.example' })).toBe('/');
  });

  it('recusa caminho relativo sem barra inicial', () => {
    expect(resolverDestinoPosLogin({ search: '?next=crm' })).toBe('/');
  });

  it('recusa destino vazio/whitespace', () => {
    expect(resolverDestinoPosLogin({ search: '?next=' })).toBe('/');
    expect(resolverDestinoPosLogin({ search: '?next=%20%20' })).toBe('/');
  });
});

describe('resolverDestinoPosLogin — rotas de autenticação não criam laço', () => {
  it.each(['/auth', '/2fa', '/access-denied'])('recusa %s', (rota) => {
    expect(resolverDestinoPosLogin({ search: `?next=${rota}` })).toBe('/');
  });

  it('recusa a rota de autenticação com query e com barra final', () => {
    expect(resolverDestinoPosLogin({ search: '?next=/auth?tab=login' })).toBe('/');
    expect(resolverDestinoPosLogin({ search: '?next=/auth/' })).toBe('/');
  });

  it('cai para state.from quando o ?next= é recusado', () => {
    expect(
      resolverDestinoPosLogin({
        search: '?next=https://evil.example',
        state: { from: { pathname: '/filas' } },
      }),
    ).toBe('/filas');
  });
});
