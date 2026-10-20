import { describe, it, expect } from 'vitest';

import {
  CANAIS_ADICIONAIS,
  EXECUCAO_POR_CANAL,
  EXECUCAO_VERSION,
  EXECUTOR_DE_ROTAS,
  canalTemExecutorVersionado,
  descreverCadastroDeCanais,
  descreverCaminhoDoCanal,
  descreverRegrasDeRoteamento,
  executorDoCanal,
  rotasTemExecutorVersionado,
  type Canal,
} from '../execucaoDeCanais';

describe('registro de execução por canal (R2-API-065)', () => {
  it('cobre todos os canais do diálogo "Adicionar Canal"', () => {
    for (const canal of CANAIS_ADICIONAIS) {
      expect(EXECUCAO_POR_CANAL[canal], `canal sem entrada: ${canal}`).toBeDefined();
      expect(EXECUCAO_POR_CANAL[canal].canal).toBe(canal);
    }
  });

  it('canais adicionais não têm executor versionado (só cadastro)', () => {
    for (const canal of ['instagram', 'telegram', 'messenger', 'webchat'] as Canal[]) {
      expect(executorDoCanal(canal), `canal: ${canal}`).toBeNull();
      expect(canalTemExecutorVersionado(canal)).toBe(false);
    }
  });

  it('whatsapp e e-mail declaram executor versionado e ficam fora deste cadastro', () => {
    expect(canalTemExecutorVersionado('whatsapp')).toBe(true);
    expect(canalTemExecutorVersionado('email')).toBe(true);
    expect(executorDoCanal('whatsapp')?.id).toContain('whatsapp-webhook');
    expect(executorDoCanal('email')?.id).toContain('gmail-webhook');
    expect(descreverCaminhoDoCanal('email')).toMatch(/OAuth do Gmail/);
  });

  it('regras de roteamento não têm executor versionado', () => {
    expect(EXECUTOR_DE_ROTAS).toBeNull();
    expect(rotasTemExecutorVersionado()).toBe(false);
  });

  it('canal desconhecido é tratado como só-cadastro, sem inventar executor', () => {
    expect(executorDoCanal('orkut')).toBeNull();
    expect(descreverCaminhoDoCanal('orkut')).toMatch(/Só cadastro/);
  });

  it('textos citam a versão do registro e dizem que não há execução', () => {
    const cadastro = descreverCadastroDeCanais();
    const rotas = descreverRegrasDeRoteamento();
    expect(cadastro).toContain(`v${EXECUCAO_VERSION}`);
    expect(rotas).toContain(`v${EXECUCAO_VERSION}`);
    expect(cadastro).toMatch(/sem executor/i);
    expect(cadastro).toMatch(/não ativa recebimento nem envio/i);
    expect(rotas).toMatch(/sem executor/i);
    expect(rotas).toMatch(/não recebe mensagens/i);
  });

  it('não afirma que a fila escolhida recebe as mensagens', () => {
    expect(descreverRegrasDeRoteamento()).not.toMatch(/direcionar mensagens/i);
  });
});
