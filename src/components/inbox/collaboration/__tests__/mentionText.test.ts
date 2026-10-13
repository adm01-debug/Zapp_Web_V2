import { describe, it, expect } from 'vitest';
import { normalizeMentionNames, splitMentionText } from '../mentionText';

/**
 * PK-17, item 2: o selo da nota era desenhado com `/(@\w+)/g`. `\w` não cobre
 * espaço, então `@Ana Maria` (nome composto escolhido no autocomplete) só
 * marcava `@Ana` e deixava ` Maria` solto como texto. O reconhecimento agora é
 * ancorado na lista de nomes ativos.
 */
describe('splitMentionText — selo da menção cobre o nome inteiro', () => {
  it('nome composto vira UM selo, inclusive a segunda palavra', () => {
    expect(splitMentionText('@Ana Maria veja isso', ['Ana Maria'])).toEqual([
      { text: '@Ana Maria', isMention: true },
      { text: ' veja isso', isMention: false },
    ]);
  });

  it('cobre partícula minúscula no meio do nome', () => {
    expect(splitMentionText('@Ana da Silva, tudo bem?', ['Ana da Silva'])).toEqual([
      { text: '@Ana da Silva', isMention: true },
      { text: ', tudo bem?', isMention: false },
    ]);
  });

  it('o nome mais longo vence quando um é prefixo do outro', () => {
    expect(splitMentionText('@Ana Maria', ['Ana', 'Ana Maria'])).toEqual([
      { text: '@Ana Maria', isMention: true },
    ]);
  });

  it('nome simples continua funcionando entre pontuação', () => {
    expect(splitMentionText('oi @Ana, tudo?', ['Ana'])).toEqual([
      { text: 'oi ', isMention: false },
      { text: '@Ana', isMention: true },
      { text: ', tudo?', isMention: false },
    ]);
  });

  it('não marca quando o nome conhecido é só um pedaço de uma palavra maior', () => {
    expect(splitMentionText('@Ana MariaSilva', ['Ana Maria'])).toEqual([
      { text: '@Ana MariaSilva', isMention: false },
    ]);
  });

  it('não trata e-mail nem @ colado a outra palavra como menção', () => {
    expect(splitMentionText('contato a@ana.com', ['ana'])).toEqual([
      { text: 'contato a@ana.com', isMention: false },
    ]);
  });

  it('sem nomes conhecidos (lista ainda vazia) nada vira selo', () => {
    expect(splitMentionText('@Ana Maria', [])).toEqual([
      { text: '@Ana Maria', isMention: false },
    ]);
  });

  it('duas menções na mesma nota, em ordem', () => {
    expect(splitMentionText('@Ana Maria e @Bruno', ['Ana Maria', 'Bruno'])).toEqual([
      { text: '@Ana Maria', isMention: true },
      { text: ' e ', isMention: false },
      { text: '@Bruno', isMention: true },
    ]);
  });
});

describe('normalizeMentionNames', () => {
  it('apara, remove vazios e repetidos e ordena do mais longo ao mais curto', () => {
    expect(normalizeMentionNames([' Ana ', 'Ana', null, '', 'Ana Maria', undefined])).toEqual([
      'Ana Maria',
      'Ana',
    ]);
  });
});
