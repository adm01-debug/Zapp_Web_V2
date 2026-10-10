import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXKit } from '../TalkXKit';
import {
  currentTalkXForcedState, isTalkXKitEnabled, isTalkXKitUrl, parseTalkXForcedState,
} from '../../kit/forcedState';
import { TalkXQueryBoundary } from '../../kit/states';

/**
 * X055 — prancha de referência (`TalkXKit`) e estado forçado por URL.
 *
 * Os títulos abaixo são escritos À MÃO (não importados do código de produção):
 * se a prancha parar de traduzir `?talkxState=<valor>` no título certo, o teste
 * falha.
 */
const TITULO_POR_ESTADO: Record<string, string> = {
  empty: 'Nenhuma campanha encontrada',
  loading: 'Carregando (Skeleton)',
  error: 'Não foi possível carregar as campanhas',
  crm: 'CRM 360 indisponível',
  wa: 'Conexão WhatsApp desconectada',
  perm: 'Você não tem permissão para acessar Campanhas',
};

function irPara(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  irPara('?view=talkx-kit');
});

describe('TalkXKit — prancha de referência (X055)', () => {
  it('sem ?talkxState= não mostra a faixa de estado forçado, mas monta as três seções', () => {
    expect(currentTalkXForcedState('?view=talkx-kit', { DEV: true })).toBeNull();
    render(<TalkXKit />);

    expect(screen.queryByTestId('talkx-kit-forcado')).toBeNull();
    expect(screen.getByTestId('talkx-kit-trilha')).toBeTruthy();
    expect(screen.getByTestId('talkx-kit-estados')).toBeTruthy();
    expect(screen.getByTestId('talkx-kit-modais')).toBeTruthy();
    expect(screen.getByTestId('talkx-kit-tabela')).toBeTruthy();
  });

  it('a seção de modais críticos desenha os 5 presets', () => {
    render(<TalkXKit />);
    expect(screen.getAllByTestId('talkx-kit-modal')).toHaveLength(5);
  });

  for (const [estado, titulo] of Object.entries(TITULO_POR_ESTADO)) {
    it(`?talkxState=${estado} força o título "${titulo}"`, () => {
      expect(currentTalkXForcedState(`?view=talkx-kit&talkxState=${estado}`, { DEV: true })).toBe(estado);
      irPara(`?view=talkx-kit&talkxState=${estado}`);
      render(<TalkXKit />);

      const faixa = screen.getByTestId('talkx-kit-forcado');
      expect(faixa.textContent).toContain(`?talkxState=${estado}`);
      expect(screen.getByTestId('talkx-kit-forcado-titulo').textContent).toBe(titulo);
    });
  }

  it('valor de ?talkxState= fora da lista é ignorado (sem faixa)', () => {
    expect(currentTalkXForcedState('?view=talkx-kit&talkxState=qualquer-coisa', { DEV: true })).toBeNull();
    irPara('?view=talkx-kit&talkxState=qualquer-coisa');
    render(<TalkXKit />);
    expect(screen.queryByTestId('talkx-kit-forcado')).toBeNull();
  });
});

describe('estado forçado — leitura da URL (X055)', () => {
  it('reconhece só os 6 valores previstos', () => {
    for (const estado of Object.keys(TITULO_POR_ESTADO)) {
      expect(parseTalkXForcedState(estado)).toBe(estado);
    }
    expect(parseTalkXForcedState('running')).toBeNull();
    expect(parseTalkXForcedState('')).toBeNull();
    expect(parseTalkXForcedState(null)).toBeNull();
  });

  it('?view=talkx-kit é a URL da prancha', () => {
    expect(isTalkXKitUrl('?view=talkx-kit', { DEV: true })).toBe(true);
    expect(isTalkXKitUrl('?view=talkx', { DEV: true })).toBe(false);
  });

  it('sem DEV e sem VITE_TALKX_KIT=1 a trava fecha: nada é forçado', () => {
    expect(isTalkXKitEnabled({ DEV: false })).toBe(false);
    expect(currentTalkXForcedState('?talkxState=error', { DEV: false })).toBeNull();
    expect(currentTalkXForcedState('?talkxState=error', {})).toBeNull();
    expect(isTalkXKitUrl('?view=talkx-kit', { DEV: false })).toBe(false);
  });

  it('VITE_TALKX_KIT=1 reabre a trava em build que não é DEV', () => {
    expect(isTalkXKitEnabled({ DEV: false, VITE_TALKX_KIT: '1' })).toBe(true);
    expect(currentTalkXForcedState('?talkxState=crm', { DEV: false, VITE_TALKX_KIT: '1' })).toBe('crm');
  });
});

describe('boundary respeita o estado forçado (X055)', () => {
  const saudavel = { isLoading: false, isFetching: false, isError: false, error: null };

  function montarBoundary() {
    return render(
      <TalkXQueryBoundary
        query={saudavel}
        entity="campanhas"
        onRetry={vi.fn()}
        skeleton={<div>esqueleto</div>}
        isEmpty={false}
        empty={<div>vazio</div>}
      >
        <div>conteudo</div>
      </TalkXQueryBoundary>,
    );
  }

  it('?talkxState=error mostra o erro mesmo com a consulta saudável', () => {
    expect(currentTalkXForcedState('?view=talkx&talkxState=error', { DEV: true })).toBe('error');
    irPara('?view=talkx&talkxState=error');
    const { container } = montarBoundary();

    expect(screen.getByText('Não foi possível carregar as campanhas')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeNull();
  });

  it('?talkxState=loading mostra o esqueleto e trava no carregamento', () => {
    expect(currentTalkXForcedState('?view=talkx&talkxState=loading', { DEV: true })).toBe('loading');
    irPara('?view=talkx&talkxState=loading');
    const { container } = montarBoundary();

    expect(screen.getByText('esqueleto')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
  });

  it('?talkxState=perm / crm / wa trocam o estado do boundary', () => {
    expect(currentTalkXForcedState('?view=talkx&talkxState=perm', { DEV: true })).toBe('perm');
    irPara('?view=talkx&talkxState=perm');
    const { unmount } = montarBoundary();
    expect(screen.getByText('Você não tem permissão para acessar Campanhas')).toBeTruthy();
    unmount();

    expect(currentTalkXForcedState('?view=talkx&talkxState=crm', { DEV: true })).toBe('crm');
    irPara('?view=talkx&talkxState=crm');
    const crm = montarBoundary();
    expect(screen.getByText('CRM 360 indisponível')).toBeTruthy();
    crm.unmount();

    expect(currentTalkXForcedState('?view=talkx&talkxState=wa', { DEV: true })).toBe('wa');
    irPara('?view=talkx&talkxState=wa');
    montarBoundary();
    expect(screen.getByText('Conexão WhatsApp desconectada')).toBeTruthy();
  });

  it('sem ?talkxState= a precedência do boundary continua a de antes (conteúdo)', () => {
    expect(currentTalkXForcedState('?view=talkx&tab=overview', { DEV: true })).toBeNull();
    irPara('?view=talkx&tab=overview');
    const { container } = montarBoundary();

    expect(screen.getByText('conteudo')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeTruthy();
    expect(screen.queryByText('esqueleto')).toBeNull();
  });
});
