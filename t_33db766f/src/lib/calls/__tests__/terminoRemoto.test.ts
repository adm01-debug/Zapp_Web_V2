import { describe, it, expect } from 'vitest';
import { ehDesfechoTerminal, terminoRemotoDaChamada } from '../terminoRemoto';

const EM_CURSO = 'chamada-em-curso';

describe('termino remoto da chamada (T28)', () => {
  it('linha da MESMA chamada com status terminal manda encerrar', () => {
    for (const status of ['ended', 'missed', 'busy', 'failed', 'cancelled', 'declined']) {
      expect(terminoRemotoDaChamada({ id: EM_CURSO, status, end_reason: 'hangup_remote' }, EM_CURSO))
        .toBe('HANGUP_REMOTE');
    }
  });

  it('status ainda em andamento NAO encerra nada', () => {
    expect(terminoRemotoDaChamada({ id: EM_CURSO, status: 'ringing' }, EM_CURSO)).toBeNull();
    expect(terminoRemotoDaChamada({ id: EM_CURSO, status: 'answered' }, EM_CURSO)).toBeNull();
    expect(ehDesfechoTerminal('answered')).toBe(false);
    expect(ehDesfechoTerminal('ringing')).toBe(false);
  });

  it('linha de OUTRA chamada nao encerra a sessao em curso', () => {
    expect(terminoRemotoDaChamada({ id: 'outra-chamada', status: 'ended' }, EM_CURSO)).toBeNull();
  });

  it('sem linha ou sem chamada em curso, nao decide (nao encerra por engano)', () => {
    expect(terminoRemotoDaChamada(null, EM_CURSO)).toBeNull();
    expect(terminoRemotoDaChamada({ id: EM_CURSO, status: 'ended' }, null)).toBeNull();
    expect(terminoRemotoDaChamada(undefined, undefined)).toBeNull();
  });

  it('status desconhecido (nulo/vazio) nao e tratado como terminal', () => {
    expect(ehDesfechoTerminal(null)).toBe(false);
    expect(ehDesfechoTerminal('')).toBe(false);
    expect(ehDesfechoTerminal('algum_status_novo')).toBe(false);
  });
});
