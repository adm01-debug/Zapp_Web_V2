// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { TourProvider, useTour, DEFAULT_ONBOARDING_STEPS, TourStep } from '../OnboardingTour';
import { WelcomeModal } from '../WelcomeModal';

// Helper component to access tour context
function TourConsumer({ steps, autoStart }: { steps?: TourStep[]; autoStart?: boolean }) {
  const { isActive, currentStep, startTour, endTour, nextStep, prevStep, goToStep, steps: tourSteps } = useTour();

  return (
    <div>
      <span data-testid="is-active">{String(isActive)}</span>
      <span data-testid="current-step">{currentStep}</span>
      <span data-testid="total-steps">{tourSteps.length}</span>
      <button data-testid="start-tour" onClick={() => startTour(steps || DEFAULT_ONBOARDING_STEPS)}>Start</button>
      <button data-testid="end-tour" onClick={endTour}>End</button>
      <button data-testid="next-step" onClick={nextStep}>Next</button>
      <button data-testid="prev-step" onClick={prevStep}>Prev</button>
      <button data-testid="go-to-2" onClick={() => goToStep(2)}>Go to 2</button>
    </div>
  );
}

describe('TourProvider', () => {
  it('provides default inactive state', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    expect(screen.getByTestId('is-active').textContent).toBe('false');
    expect(screen.getByTestId('current-step').textContent).toBe('0');
    expect(screen.getByTestId('total-steps').textContent).toBe('0');
  });

  it('starts tour with steps', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    expect(screen.getByTestId('is-active').textContent).toBe('true');
    expect(screen.getByTestId('total-steps').textContent).toBe(String(DEFAULT_ONBOARDING_STEPS.length));
    expect(screen.getByTestId('current-step').textContent).toBe('0');
  });

  it('navigates forward through steps', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step'));
    expect(screen.getByTestId('current-step').textContent).toBe('1');
  });

  it('navigates backward through steps', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step'));
    fireEvent.click(screen.getByTestId('next-step'));
    expect(screen.getByTestId('current-step').textContent).toBe('2');
    fireEvent.click(screen.getByTestId('prev-step'));
    expect(screen.getByTestId('current-step').textContent).toBe('1');
  });

  it('does not go below step 0', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('prev-step'));
    expect(screen.getByTestId('current-step').textContent).toBe('0');
  });

  it('ends tour when advancing past last step', () => {
    const twoSteps: TourStep[] = [
      { id: 'a', target: '#a', title: 'A', description: 'Desc A' },
      { id: 'b', target: '#b', title: 'B', description: 'Desc B' },
    ];
    render(
      <TourProvider>
        <TourConsumer steps={twoSteps} />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    expect(screen.getByTestId('is-active').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('next-step')); // step 1
    fireEvent.click(screen.getByTestId('next-step')); // should end
    expect(screen.getByTestId('is-active').textContent).toBe('false');
  });

  it('calls onComplete when tour ends', () => {
    const onComplete = vi.fn();
    const twoSteps: TourStep[] = [
      { id: 'a', target: '#a', title: 'A', description: 'Desc A' },
    ];
    render(
      <TourProvider onComplete={onComplete}>
        <TourConsumer steps={twoSteps} />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step')); // ends single-step tour
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('goToStep jumps to specific step', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('go-to-2'));
    expect(screen.getByTestId('current-step').textContent).toBe('2');
  });

  it('goToStep ignores invalid indices', () => {
    const twoSteps: TourStep[] = [
      { id: 'a', target: '#a', title: 'A', description: 'Desc A' },
      { id: 'b', target: '#b', title: 'B', description: 'Desc B' },
    ];
    render(
      <TourProvider>
        <TourConsumer steps={twoSteps} />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('go-to-2')); // index 2 is out of bounds for 2 steps
    expect(screen.getByTestId('current-step').textContent).toBe('0'); // unchanged
  });

  it('endTour resets state', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step'));
    fireEvent.click(screen.getByTestId('end-tour'));
    expect(screen.getByTestId('is-active').textContent).toBe('false');
    expect(screen.getByTestId('current-step').textContent).toBe('0');
    expect(screen.getByTestId('total-steps').textContent).toBe('0');
  });
});

describe('useTour outside TourProvider', () => {
  it('throws if used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<TourConsumer />);
    }).toThrow('useTour must be used within a TourProvider');
    spy.mockRestore();
  });
});

describe('DEFAULT_ONBOARDING_STEPS', () => {
  it('has at least 1 step', () => {
    expect(DEFAULT_ONBOARDING_STEPS.length).toBeGreaterThan(0);
  });

  it('each step has required fields', () => {
    for (const step of DEFAULT_ONBOARDING_STEPS) {
      expect(step.id).toBeTruthy();
      expect(step.target).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
    }
  });

  it('each step target is a valid CSS selector format', () => {
    for (const step of DEFAULT_ONBOARDING_STEPS) {
      expect(() => document.querySelector(step.target)).not.toThrow();
    }
  });

  it('step IDs are unique', () => {
    const ids = DEFAULT_ONBOARDING_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('WelcomeModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <WelcomeModal isOpen={false} onClose={vi.fn()} onStartTour={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders content when open', () => {
    render(
      <WelcomeModal isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} userName="João" />
    );
    expect(screen.getByText(/João/)).toBeInTheDocument();
  });

  it('calls onStartTour when tour button is clicked', () => {
    const onStartTour = vi.fn();
    render(
      <WelcomeModal isOpen={true} onClose={vi.fn()} onStartTour={onStartTour} />
    );
    const tourButton = screen.getByText(/Iniciar Tour Guiado/i);
    fireEvent.click(tourButton);
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button/skip is clicked', () => {
    const onClose = vi.fn();
    render(
      <WelcomeModal isOpen={true} onClose={onClose} onStartTour={vi.fn()} />
    );
    // Find skip/close button
    const skipButton = screen.getByText(/pular|explorar|fechar/i);
    fireEvent.click(skipButton);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Keyboard navigation', () => {
  it('Escape key ends the tour', async () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    expect(screen.getByTestId('is-active').textContent).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('is-active').textContent).toBe('false');
  });

  it('ArrowRight advances step', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('current-step').textContent).toBe('1');
  });

  it('ArrowLeft goes back', () => {
    render(
      <TourProvider>
        <TourConsumer />
      </TourProvider>
    );
    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('current-step').textContent).toBe('0');
  });
});
