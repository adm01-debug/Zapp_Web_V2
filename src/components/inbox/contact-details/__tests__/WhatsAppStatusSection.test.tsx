import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WhatsAppStatusSection } from '../WhatsAppStatusSection';

// Mock useWhatsAppStatus
const mockRefresh = vi.fn();
let mockData = {
  statusMessages: [] as any[],
  presence: { isOnline: false, lastSeen: null, loading: false },
  loading: false,
  error: null as string | null,
  refresh: mockRefresh,
};

vi.mock('@/hooks/integrations/useWhatsAppStatus', () => ({
  useWhatsAppStatus: () => mockData,
}));

// Mock useEvolutionApi.
// IMPORTANT: getMediaBase64 must keep a STABLE identity across renders. In
// production it is memoized via useCallback, so StoryViewer's media effect
// (deps include getMediaBase64) runs only when index/messages change. If the
// mock returned a fresh fn each render, that effect would re-run every render
// and its setResolvedMedia({...}) call would create a new object each time —
// an infinite render loop that synchronously hangs the whole test suite.
const mockGetMediaBase64 = vi.fn().mockResolvedValue({ base64: '', mimetype: 'image/jpeg' });
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    getMediaBase64: mockGetMediaBase64,
  }),
}));

// Mock formatRelativeTime
vi.mock('@/lib/formatters', () => ({
  formatRelativeTime: () => 'há 1h',
}));

describe('WhatsAppStatusSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = {
      statusMessages: [],
      presence: { isOnline: false, lastSeen: null, loading: false },
      loading: false,
      error: null,
      refresh: mockRefresh,
    };
  });

  // ========== LOADING STATE ==========
  it('shows loading spinner when loading', () => {
    mockData.loading = true;
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Carregando status...')).toBeInTheDocument();
  });

  // ========== ERROR STATE ==========
  it('shows error message', () => {
    mockData.error = 'Sem conexão WhatsApp disponível';
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Sem conexão WhatsApp disponível')).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    mockData.error = 'Erro genérico';
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('calls refresh on retry click', () => {
    mockData.error = 'Erro';
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  // ========== EMPTY STATE ==========
  it('shows empty message when no statuses', () => {
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Nenhum status disponível')).toBeInTheDocument();
    expect(screen.getByText('Os status desaparecem após 24h')).toBeInTheDocument();
  });

  // ========== PRESENCE: ONLINE ==========
  it('shows Online agora when online', () => {
    mockData.presence = { isOnline: true, lastSeen: null, loading: false };
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Online agora')).toBeInTheDocument();
  });

  // ========== PRESENCE: OFFLINE ==========
  it('shows Offline when offline without lastSeen', () => {
    mockData.presence = { isOnline: false, lastSeen: null, loading: false };
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  // ========== PRESENCE: LAST SEEN ==========
  it('shows last seen when available', () => {
    mockData.presence = { isOnline: false, lastSeen: 'há 5 minutos', loading: false };
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Visto por último há 5 minutos')).toBeInTheDocument();
  });

  // ========== PRESENCE: LOADING ==========
  it('shows Verificando... when presence is loading', () => {
    mockData.presence = { isOnline: false, lastSeen: null, loading: true };
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Verificando...')).toBeInTheDocument();
  });

  // ========== STATUS MESSAGES ==========
  it('renders image status correctly', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'img1' },
      message: { imageMessage: { caption: 'Minha foto de férias' } },
      messageTimestamp: Math.floor(Date.now() / 1000) - 3600,
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    // The component shows "Ver Status" button with count badge, not individual captions
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('renders video status correctly', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'vid1' },
      message: { videoMessage: { caption: 'Meu vídeo' } },
      messageTimestamp: Math.floor(Date.now() / 1000) - 1800,
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('renders text status correctly', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'txt1' },
      message: { extendedTextMessage: { text: 'Bom dia!' } },
      messageTimestamp: Math.floor(Date.now() / 1000) - 600,
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('renders conversation type status', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'conv1' },
      message: { conversation: 'Status simples' },
      messageTimestamp: Math.floor(Date.now() / 1000) - 300,
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('shows Ver Status button for image without caption', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'img2' },
      message: { imageMessage: {} },
      messageTimestamp: Math.floor(Date.now() / 1000),
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('shows Ver Status button for video without caption', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'vid2' },
      message: { videoMessage: {} },
      messageTimestamp: Math.floor(Date.now() / 1000),
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('shows Ver Status button for empty message', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'empty1' },
      message: {},
      messageTimestamp: Math.floor(Date.now() / 1000),
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  // ========== STATUS COUNT BADGE ==========
  it('shows correct count for single status', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 's1' },
      message: { conversation: 'Test' },
      messageTimestamp: Math.floor(Date.now() / 1000),
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    // Badge shows just the number, not "1 status"
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows correct count for multiple statuses', () => {
    mockData.statusMessages = [
      { key: { id: 's1' }, message: { conversation: 'A' }, messageTimestamp: Math.floor(Date.now() / 1000) },
      { key: { id: 's2' }, message: { conversation: 'B' }, messageTimestamp: Math.floor(Date.now() / 1000) },
      { key: { id: 's3' }, message: { conversation: 'C' }, messageTimestamp: Math.floor(Date.now() / 1000) },
    ];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // ========== REFRESH BUTTON ==========
  it('has refresh button in the presence section', () => {
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  // ========== CLICK TO SELECT STATUS ==========
  it('does not crash when clicking Ver Status button', () => {
    mockData.statusMessages = [{
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'click1' },
      message: { conversation: 'Clickable' },
      messageTimestamp: Math.floor(Date.now() / 1000),
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    const btn = screen.getByText('Ver Status');
    fireEvent.click(btn);
    // No crash = success
  });

  // ========== TIMESTAMP EDGE CASES ==========
  it('handles string timestamp', () => {
    mockData.statusMessages = [{
      key: { id: 'ts1' },
      message: { conversation: 'String TS' },
      messageTimestamp: String(Math.floor(Date.now() / 1000) - 60),
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  it('handles missing timestamp gracefully', () => {
    mockData.statusMessages = [{
      key: { id: 'nots' },
      message: { conversation: 'No Time' },
    }];
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    expect(screen.getByText('Ver Status')).toBeInTheDocument();
  });

  // ========== MANY STATUSES ==========
  it('renders 50 statuses without crashing', () => {
    mockData.statusMessages = Array.from({ length: 50 }, (_, i) => ({
      key: { id: `mass-${i}` },
      message: { conversation: `Status ${i}` },
      messageTimestamp: Math.floor(Date.now() / 1000) - i * 60,
    }));
    render(<WhatsAppStatusSection phone="+5511999999999" />);
    // Badge shows "50" not "50 status"
    expect(screen.getByText('50')).toBeInTheDocument();
  });
});
