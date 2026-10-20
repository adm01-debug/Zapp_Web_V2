import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_URL } from '@/config/supabase';
import type { TeamMessage } from '@/hooks/team-chat/teamChatTypes';

const { capturado } = vi.hoisted(() => ({ capturado: { source: '' } }));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => {
    capturado.source = source;
    return { url: source, isLoading: false, refresh: vi.fn() };
  },
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: vi.fn(),
}));

import { MediaContent } from '../teamChatParts';

const HOST_INTRUSO = 'https://projeto-interno.supabase.co';

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

describe('SEC-FE-01 — mídia do chat de equipe aponta para o host canônico', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', HOST_INTRUSO);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('a URL do objeto de storage continua sendo a de SUPABASE_URL (@/config/supabase)', () => {
    render(<MediaContent msg={mensagem} />);

    expect(capturado.source).toBe(`${SUPABASE_URL}/storage/v1/object/equipe/chat/foto.jpg`);
    expect(capturado.source).not.toContain('projeto-interno');
  });
});
