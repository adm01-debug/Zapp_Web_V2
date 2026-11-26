import { describe, expect, it } from 'vitest';
import {
  TRUSTED_DOMAINS_FALLBACK,
  dominiosEfetivos,
  normalizarDominio,
  parseTrustedDomains,
  serializeTrustedDomains,
  validarDominio,
} from '@/pages/admin/trustedDomains';

describe('domínios confiáveis (regras)', () => {
  it('normaliza o que vem colado: @, https://, caminho, maiúsculas e espaços', () => {
    expect(normalizarDominio('  @Empresa.COM.br ')).toBe('empresa.com.br');
    expect(normalizarDominio('https://outra.com/sso?x=1')).toBe('outra.com');
    expect(normalizarDominio('.empresa.com.br.')).toBe('empresa.com.br');
  });

  it('lê o valor do banco descartando vazio e repetido sem perder a ordem', () => {
    const valor = ' empresa.com.br , ,@EMPRESA.com.br, outra.com.br ';
    expect(parseTrustedDomains(valor)).toEqual(['empresa.com.br', 'outra.com.br']);
    expect(parseTrustedDomains(null)).toEqual([]);
    expect(parseTrustedDomains('   ')).toEqual([]);
  });

  it('serializa no formato que handle_new_user_role lê: vírgula, sem espaço', () => {
    const salvos = serializeTrustedDomains(['Empresa.com.br', ' @outra.com ', 'empresa.com.br']);
    expect(salvos).toBe('empresa.com.br,outra.com');
    // o parser do banco usa split(',') exato: espaço sobrando viraria domínio com espaço
    expect(salvos.split(',')).toEqual(['empresa.com.br', 'outra.com']);
  });

  it('recusa entrada inválida com motivo acionável', () => {
    expect(validarDominio('', [])).toMatch(/Informe um domínio/);
    expect(validarDominio('joao@empresa.com', [])).toMatch(/sem o e-mail/);
    expect(validarDominio('empresa', [])).toMatch(/Domínio inválido/);
    expect(validarDominio('empresa..com', [])).toMatch(/Domínio inválido/);
    expect(validarDominio('-empresa.com', [])).toMatch(/Domínio inválido/);
    expect(validarDominio('empresa.com.', ['empresa.com'])).toMatch(/já está na lista/);
  });

  it('aceita domínio e subdomínio — a comparação do banco é exata, sem curinga', () => {
    expect(validarDominio('empresa.com.br', [])).toBeNull();
    expect(validarDominio('mail.empresa.com.br', ['empresa.com.br'])).toBeNull();
  });

  it('lista vazia NÃO fecha o cadastro: cai no padrão do banco', () => {
    expect(dominiosEfetivos([])).toEqual([TRUSTED_DOMAINS_FALLBACK]);
    expect(dominiosEfetivos(['outra.com'])).toEqual(['outra.com']);
  });
});