import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerComposerInsert, requestComposerInsert } from '../composerInsert';

/**
 * Ponte painel -> compositor: o rascunho tem um dono (o ChatPanel registra o
 * escritor) e o painel só pede. Sem dono, a inserção é recusada em vez de
 * silenciosamente perdida.
 */

afterEach(() => {
  registerComposerInsert(null);
});

describe('composerInsert', () => {
  it('entrega o trecho ao compositor registrado', () => {
    const escrever = vi.fn();
    registerComposerInsert(escrever);

    expect(requestComposerInsert('Prazo de entrega: 7 dias úteis.')).toBe(true);
    expect(escrever).toHaveBeenCalledWith('Prazo de entrega: 7 dias úteis.');
  });

  it('sem compositor registrado recusa e não explode', () => {
    expect(requestComposerInsert('Prazo de entrega: 7 dias úteis.')).toBe(false);
  });

  it('registrar null desliga o compositor anterior', () => {
    const escrever = vi.fn();
    registerComposerInsert(escrever);
    registerComposerInsert(null);

    expect(requestComposerInsert('Prazo de entrega: 7 dias úteis.')).toBe(false);
    expect(escrever).not.toHaveBeenCalled();
  });

  it('trecho vazio não chega ao compositor', () => {
    const escrever = vi.fn();
    registerComposerInsert(escrever);

    expect(requestComposerInsert('   ')).toBe(false);
    expect(escrever).not.toHaveBeenCalled();
  });
});
