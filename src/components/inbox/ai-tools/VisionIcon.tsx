import { memo } from 'react';

interface VisionIconProps {
  className?: string;
}

/**
 * Third-eye / Vision icon — eye shape with eyelash rays on top and concentric pupil.
 * Based on the reference vector provided by the user.
 */
export const VisionIcon = memo(function VisionIcon({ className = 'w-4 h-4' }: VisionIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Eye shape */}
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      {/* Outer pupil ring */}
      <circle cx="12" cy="12" r="3.5" />
      {/* Inner pupil dot */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      {/* Eyelash rays */}
      <path d="M8 5.5 7 3" />
      <path d="M10 4.5 9.5 2" />
      <path d="M12 4l0-2.5" />
      <path d="M14 4.5l.5-2.5" />
      <path d="M16 5.5l1-2.5" />
    </svg>
  );
});
