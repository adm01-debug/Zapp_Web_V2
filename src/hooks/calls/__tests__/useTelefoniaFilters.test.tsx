import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useTelefoniaFilters, FILTROS_PADRAO } from '../useTelefoniaFilters';

/**
 * T36 — aceite: "reload mantem filtros". Provado montando o hook com a URL ja
 * preenchida (que e exatamente o que acontece no reload) e vendo que ele devolve o
 * mesmo estado; e que `setFilter` muda a URL e reseta a pagina.
 *
 * SEC-FRONTEND-05: o texto livre da busca (`q`) é a EXCEÇÃO — fica em memória,
 * nunca vai para a URL e o reload não o restaura.
 */
const ultimasUrls: string[] = [];
function EspiaoUrl() {
  ultimasUrls.push(useLocation().search);
  return null;
}
const montar = (rota = '/telefonia') => {
  ultimasUrls.length = 0;
  return renderHook(() => useTelefoniaFilters(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[rota]}><EspiaoUrl />{children}</MemoryRouter>
    ),
  });
};
const urlAtual = () => ultimasUrls[ultimasUrls.length - 1] ?? '';

describe('useTelefoniaFilters (T36)', () => {
  it('sem nada na URL, entrega os defaults do plano', () => {
    const { result } = montar();
    expect(result.current.filtros).toMatchObject({
      period: '7d', channel: 'all', dir: 'all', result: 'all', q: '', page: 1, scope: 'mine', call: '',
    });
    expect(FILTROS_PADRAO.period).toBe('7d');
  });

  it('reload: URL preenchida devolve os MESMOS filtros — menos a busca (PII)', () => {
    const { result } = montar('/telefonia?period=30d&channel=whatsapp&dir=inbound&result=missed&q=maria&page=3&scope=all&call=abc');
    expect(result.current.filtros).toMatchObject({
      period: '30d', channel: 'whatsapp', dir: 'inbound', result: 'missed', page: 3, scope: 'all', call: 'abc',
    });
    // SEC-FRONTEND-05: ?q= de link antigo NÃO restaura a busca.
    expect(result.current.filtros.q).toBe('');
  });

  it('setFilter muda o filtro e reseta a pagina para 1', () => {
    const { result } = montar('/telefonia?page=3&period=30d');
    act(() => result.current.setFilter('channel', 'voip'));
    expect(result.current.filtros.channel).toBe('voip');
    expect(result.current.filtros.page).toBe(1);
    expect(result.current.filtros.period).toBe('30d');
  });

  it('setFilter da propria pagina NAO reseta a pagina', () => {
    const { result } = montar('/telefonia?page=1');
    act(() => result.current.setFilter('page', 2));
    expect(result.current.filtros.page).toBe(2);
  });

  it('voltar ao default limpa o parametro da URL', () => {
    const { result } = montar('/telefonia?channel=voip&page=2');
    act(() => result.current.setFilter('channel', 'all'));
    expect(result.current.filtros.channel).toBe('all');
    expect(result.current.filtros.page).toBe(1);
  });

  it('limpar volta tudo ao default', () => {
    const { result } = montar('/telefonia?period=hoje&channel=voip&q=ana');
    act(() => result.current.setFilter('q', 'ana'));
    expect(result.current.filtros.q).toBe('ana');
    act(() => result.current.limpar());
    expect(result.current.filtros).toMatchObject({ period: '7d', channel: 'all', q: '' });
    // ?q= de link antigo sai da URL ao limpar.
    expect(new URLSearchParams(urlAtual()).get('q')).toBeNull();
  });

  it('SEC-FRONTEND-05: digitar a busca não escreve ?q= na URL', () => {
    const { result } = montar('/telefonia?period=30d');
    const antes = urlAtual();
    act(() => result.current.setFilter('q', '11999998888'));
    expect(result.current.filtros.q).toBe('11999998888');
    // o estado filtra, mas a URL não carrega o texto (PII)...
    expect(new URLSearchParams(urlAtual()).get('q')).toBeNull();
    // ...e nem mudou por causa da digitação (estava na página 1).
    expect(urlAtual()).toBe(antes);
    // os demais filtros seguem espelhados na URL.
    expect(new URLSearchParams(urlAtual()).get('period')).toBe('30d');
  });

  it('SEC-FRONTEND-05: buscar fora da página 1 volta para a 1 sem expor o texto', () => {
    const { result } = montar('/telefonia?page=3');
    act(() => result.current.setFilter('q', 'ana'));
    expect(result.current.filtros.q).toBe('ana');
    expect(result.current.filtros.page).toBe(1);
    expect(new URLSearchParams(urlAtual()).get('q')).toBeNull();
  });
});
