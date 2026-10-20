import { describe, it, expect } from 'vitest';
import {
  deveTocar,
  proximoToque,
  EVENTOS_QUE_PARAM,
  type EstadoDeToque,
  type EventoDeToque,
} from '../toqueDaChamada';

describe('toque da chamada recebida (T27)', () => {
  it('INVITE_RECEIVED inicia o toque', () => {
    const estado = proximoToque('parado', 'INVITE_RECEIVED');
    expect(estado).toBe('tocando');
    expect(deveTocar(estado)).toBe(true);
  });

  it('ACCEPT para o toque', () => {
    const estado = proximoToque('tocando', 'ACCEPT');
    expect(estado).toBe('parado');
    expect(deveTocar(estado)).toBe(false);
  });

  it('REJECT para o toque', () => {
    const estado = proximoToque('tocando', 'REJECT');
    expect(estado).toBe('parado');
    expect(deveTocar(estado)).toBe(false);
  });

  it('TIMEOUT para o toque', () => {
    const estado = proximoToque('tocando', 'TIMEOUT');
    expect(estado).toBe('parado');
    expect(deveTocar(estado)).toBe(false);
  });

  it('HANGUP_REMOTE para o toque', () => {
    const estado = proximoToque('tocando', 'HANGUP_REMOTE');
    expect(estado).toBe('parado');
    expect(deveTocar(estado)).toBe(false);
  });

  it('os quatro eventos do aceite param o toque', () => {
    expect(EVENTOS_QUE_PARAM).toHaveLength(4);
    for (const evento of EVENTOS_QUE_PARAM) {
      expect(deveTocar(proximoToque('tocando', evento))).toBe(false);
    }
  });

  it('depois de parado, um novo INVITE_RECEIVED volta a tocar', () => {
    let estado: EstadoDeToque = proximoToque('parado', 'INVITE_RECEIVED');
    for (const evento of EVENTOS_QUE_PARAM as readonly EventoDeToque[]) {
      estado = proximoToque(estado, evento);
      expect(deveTocar(estado)).toBe(false);
    }
    estado = proximoToque(estado, 'INVITE_RECEIVED');
    expect(deveTocar(estado)).toBe(true);
  });
});
