import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SenderAvatar, type SenderAvatarProps } from '../SenderAvatar';
import { getAvatarColor } from '@/lib/avatar-colors';

const FOTO = 'https://cdn.test/fotos/ana.png';

function semear(props: Partial<SenderAvatarProps> = {}) {
  return render(<SenderAvatar name="Ana Souza" {...props} />);
}

describe('SenderAvatar (etapas S14–S21)', () => {
  it('S15: com foto mostra a imagem decorativa, com lazy/async, e nenhuma inicial', () => {
    semear({ avatarUrl: FOTO });

    const img = screen.getByTestId('sender-avatar-photo');
    expect(img).toHaveAttribute('src', FOTO);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(screen.queryByTestId('sender-avatar-initials')).toBeNull();
  });

  it('S15: sem foto (undefined e null) cai nas iniciais', () => {
    const semUrl = semear();
    expect(semUrl.queryByTestId('sender-avatar-photo')).toBeNull();
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('AS');
    semUrl.unmount();

    semear({ avatarUrl: null });
    expect(screen.queryByTestId('sender-avatar-photo')).toBeNull();
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('AS');
  });

  it('S19: imagem quebrada (onError) troca a foto pelo círculo de iniciais', () => {
    semear({ avatarUrl: FOTO });

    fireEvent.error(screen.getByTestId('sender-avatar-photo'));

    expect(screen.queryByTestId('sender-avatar-photo')).toBeNull();
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('AS');
  });

  it('S19: uma foto nova depois da quebrada é tentada (o erro antigo não trava o componente)', () => {
    const { rerender } = semear({ avatarUrl: 'https://cdn.test/fotos/quebrada.png' });
    fireEvent.error(screen.getByTestId('sender-avatar-photo'));
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('AS');

    rerender(<SenderAvatar name="Ana Souza" avatarUrl={FOTO} />);
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S20: recarregar a mesma foto não remonta a imagem (não pisca)', () => {
    const { rerender } = semear({ avatarUrl: FOTO });
    const antes = screen.getByTestId('sender-avatar-photo');

    rerender(<SenderAvatar name="Ana Souza" avatarUrl={FOTO} />);

    expect(screen.getByTestId('sender-avatar-photo')).toBe(antes);
  });

  it('S15: iniciais de nome composto, de um nome só e de nome vazio', () => {
    const composto = semear({ name: 'Joaquim Ataides' });
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('JA');
    composto.unmount();

    const umNome = semear({ name: 'Joaquim' });
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('J');
    umNome.unmount();

    semear({ name: '' });
    expect(screen.getByTestId('sender-avatar-initials')).toHaveTextContent('?');
  });

  it('S16: mesma colorKey = mesma cor; a cor sai do par derivado da chave', () => {
    const esperado = getAvatarColor('perfil-42');

    const primeiro = semear({ colorKey: 'perfil-42' });
    const iniciais = screen.getByTestId('sender-avatar-initials');
    expect(iniciais.className).toContain(esperado.bg);
    expect(iniciais.className).toContain(esperado.text);
    primeiro.unmount();

    const segundo = semear({ colorKey: 'perfil-42' });
    const segundaVez = screen.getByTestId('sender-avatar-initials');
    expect(segundaVez.className).toBe(iniciais.className);
    segundo.unmount();

    // Sem colorKey a cor continua estável, derivada do nome.
    const semChave = getAvatarColor('Ana Souza');
    semear();
    expect(screen.getByTestId('sender-avatar-initials').className).toContain(semChave.bg);
  });

  it('S17: o selo do canal só aparece com channelBadge="whatsapp"', () => {
    const comSelo = semear({ channelBadge: 'whatsapp' });
    expect(screen.getByTestId('sender-avatar-channel-badge')).toBeInTheDocument();
    // O ícone do selo é decorativo: quem nomeia o conjunto é o aria-label do avatar.
    expect(screen.getByTestId('sender-avatar-channel-badge').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    comSelo.unmount();

    semear();
    expect(screen.queryByTestId('sender-avatar-channel-badge')).toBeNull();
  });

  it('S18: title e aria-label dizem quem enviou, com foto e sem foto', () => {
    const comFoto = semear({ name: 'Ana Souza', avatarUrl: FOTO });
    const avatar = screen.getByRole('img', { name: 'Enviado por Ana Souza' });
    expect(avatar).toHaveAttribute('title', 'Enviado por Ana Souza');
    comFoto.unmount();

    semear({ name: 'Ana Souza' });
    expect(screen.getByRole('img', { name: 'Enviado por Ana Souza' })).toHaveAttribute(
      'title',
      'Enviado por Ana Souza',
    );
  });

  it('S14: sm mede 20 px e md mede 28 px, na foto e no círculo de iniciais', () => {
    const sm = semear({ avatarUrl: FOTO, size: 'sm' });
    const imgSm = screen.getByTestId('sender-avatar-photo');
    expect(imgSm).toHaveAttribute('width', '20');
    expect(imgSm).toHaveAttribute('height', '20');
    expect(screen.getByTestId('sender-avatar-circle').className).toContain('w-5');
    sm.unmount();

    const md = semear({ avatarUrl: FOTO, size: 'md' });
    const imgMd = screen.getByTestId('sender-avatar-photo');
    expect(imgMd).toHaveAttribute('width', '28');
    expect(imgMd).toHaveAttribute('height', '28');
    expect(screen.getByTestId('sender-avatar-circle').className).toContain('w-7');
    md.unmount();

    // Sem foto, o círculo de iniciais mantém a medida do md.
    semear({ size: 'md' });
    expect(screen.getByTestId('sender-avatar-circle').className).toContain('w-7');
    expect(screen.getByTestId('sender-avatar-initials').className).toContain('text-2xs');
  });

  it('D03: showName mostra o nome numa linha e sem showName não renderiza texto', () => {
    const comNome = semear({ showName: true });
    const nome = screen.getByTestId('sender-avatar-name');
    expect(nome).toHaveTextContent('Ana Souza');
    expect(nome.className).toContain('truncate');
    comNome.unmount();

    semear();
    expect(screen.queryByTestId('sender-avatar-name')).toBeNull();
  });

  it('S14: nome longo continua só no texto truncado (não estoura o cartão)', () => {
    const longo = 'Ana Carolina de Souza Albuquerque Nascimento';
    semear({ showName: true, name: longo, avatarUrl: FOTO });

    const nome = screen.getByTestId('sender-avatar-name');
    expect(nome).toHaveTextContent(longo);
    // O contêiner flex precisa de min-w-0 para o truncate valer.
    expect(nome.className).toContain('min-w-0');
    expect(nome.className).toContain('truncate');
  });

  it('S14–S21: não há animação no componente (prefers-reduced-motion não tem o que reduzir)', () => {
    const { container } = render(<SenderAvatar name="Ana Souza" avatarUrl={FOTO} channelBadge="whatsapp" showName />);

    expect(container.innerHTML).not.toMatch(/transition|animate-|duration-\d/);
  });
});
