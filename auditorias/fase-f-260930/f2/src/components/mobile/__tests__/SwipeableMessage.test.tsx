// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SwipeableMessage } from '@/components/mobile/SwipeableMessage';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, style, ...rest }: any) => (
      <div className={className} style={style}>{children}</div>
    ),
  },
  useMotionValue: () => ({ get: () => 0, set: vi.fn() }),
  useTransform: () => ({ get: () => 0, set: vi.fn() }),
}));

// Mock useIsMobile
vi.mock('@/hooks/ui/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

describe('SwipeableMessage', () => {
  it('renders children on desktop without swipe wrapper', () => {
    render(
      <SwipeableMessage>
        <span>Hello</span>
      </SwipeableMessage>
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders children on mobile with swipe container', async () => {
    const { useIsMobile } = await import('@/hooks/ui/use-mobile');
    (useIsMobile as any).mockReturnValue(true);

    render(
      <SwipeableMessage onSwipeRight={vi.fn()} onSwipeLeft={vi.fn()}>
        <span>Mobile Message</span>
      </SwipeableMessage>
    );
    expect(screen.getByText('Mobile Message')).toBeInTheDocument();
  });

  it('accepts optional className', () => {
    const { container } = render(
      <SwipeableMessage className="test-class">
        <span>Content</span>
      </SwipeableMessage>
    );
    expect(container.firstChild).toHaveClass('test-class');
  });
});
