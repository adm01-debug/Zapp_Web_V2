import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Brain } from 'lucide-react';
import { SinguProfileTile } from '../SinguProfileTile';

describe('SinguProfileTile (etapa 68)', () => {
  it('com barValue renderiza o valor + barra de progresso', () => {
    const { container } = render(
      <SinguProfileTile name="disc" icon={<Brain />} label="DISC" value="D Dominante" bar={80} />,
    );
    expect(screen.getByTestId('singu-tile-disc')).toBeInTheDocument();
    expect(screen.getByText('DISC')).toBeInTheDocument();
    expect(screen.getByText('D Dominante')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(container.querySelector('.h-1')).toBeInTheDocument();
  });

  it('barValue null → sem barra', () => {
    render(<SinguProfileTile name="temperament" icon={<Brain />} label="Temperamento" value="Sanguíneo" bar={null} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('value null → "Não avaliado" e sem barra', () => {
    render(<SinguProfileTile name="mbti" icon={<Brain />} label="MBTI" value={null} bar={null} />);
    expect(screen.getByText('Não avaliado')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('barValue fora de 0-100 é clampeado', () => {
    render(<SinguProfileTile name="vak" icon={<Brain />} label="VAK" value="Visual" bar={120} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label', 'VAK: 100%');
  });
});
