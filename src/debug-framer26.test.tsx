import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { motion } from 'framer-motion';

const reduceMotion = { value: true };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

describe('Debug with duration=0.001', () => {
  it('reduced motion=true - duration=0.001', () => {
    const { container } = render(
      <motion.div
        animate={{ opacity: 0 }}
        transition={{ duration: 0.001 }}
        data-testid="animated-div"
      >
        Test
      </motion.div>
    );
    const div = container.querySelector('[data-testid="animated-div"]') as HTMLElement;
    console.log('TRUE_DURATION_001:', JSON.stringify(div.style.opacity));
  });

  it('reduced motion=false - duration=0.001', () => {
    reduceMotion.value = false;
    const { container } = render(
      <motion.div
        animate={{ opacity: 0 }}
        transition={{ duration: 0.001 }}
        data-testid="animated-div"
      >
        Test
      </motion.div>
    );
    const div = container.querySelector('[data-testid="animated-div"]') as HTMLElement;
    console.log('FALSE_DURATION_001:', JSON.stringify(div.style.opacity));
  });
});
