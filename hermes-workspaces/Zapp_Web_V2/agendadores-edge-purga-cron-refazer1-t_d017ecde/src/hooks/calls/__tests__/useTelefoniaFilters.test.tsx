import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTelefoniaFilters, FILTROS_PADRAO } from '../useTelefoniaFilters';

/**
 * T36 — aceite: "reload mantem filtros". Provado montando o hook com a URL ja
 * preenchida (que e exatamente o que acontece no reload) e vendo que ele devolve o
 * mesmo estado; e que `setFilter` muda a URL e reseta a pagina.
 */
const montar = (rota = '/telefonia') =>
  renderHook(() => useTelefoniaFilters(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[rota]}>{children}</MemoryRouter>,
  });

describe('useTelefoniaFilters (T36)', () => {
  it('sem nada na URL, entrega os defaults do plano', () => {
    const { result } = montar();
    expect(result.current.filtros).toMatchObject({
      period: '7d', channel: 'all', dir: 'all', result: 'all', q: '', page: 1, scope: 'mine', call: '',
    });
    expect(FILTROS_PADRAO.period).toBe('7d');
  });

  it('reload: URL preenchida devolve os MESMOS filtros', () => {
    const { result } = montar('/telefonia?period=30d&channel=whatsapp&dir=inbound&result=missed&q=maria&page=3&scope=all&call=abc');
    expect(result.current.filtros).toMatchObject({
      period: '30d', channel: 'whatsapp', dir: 'inbound', result: 'missed', q: 'maria', page: 3, scope: 'all', call: 'abc',
    });
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
    act(() => result.current.limpar());
    expect(result.current.filtros).toMatchObject({ period: '7d', channel: 'all', q: '' });
  });
});
