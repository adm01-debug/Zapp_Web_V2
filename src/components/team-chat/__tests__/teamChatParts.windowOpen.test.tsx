import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_URL } from '@/config/supabase';
import type { TeamMessage } from '@/hooks/team-chat/teamChatTypes';

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, refresh: vi.fn() }),
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: vi.fn(),
}));

import { MediaContent } from '../teamChatParts';

const mensagem: TeamMessage = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'p1',
  content: 'foto',
  message_type: 'media',
  media_url: null,
  media_type: 'image',
  media_bucket: 'equipe',
  media_path: 'chat/foto.jpg',
  reply_to_id: null,
  is_edited: false,
  created_at: '2026-10-09T12:00:00.000Z',
  updated_at: '2026-10-09T12:00:00.000Z',
};

describe('imagem do chat de equipe abre em nova aba sem repassar o opener', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('window.open recebe _blank com noopener,noreferrer', () => {
    render(<MediaContent msg={mensagem} />);

    fireEvent.click(screen.getByAltText('Imagem enviada'));

    expect(openSpy).toHaveBeenCalledWith(
      `${SUPABASE_URL}/storage/v1/object/equipe/chat/foto.jpg`,
      '_blank',
      'noopener,noreferrer',
    );
  });
});
