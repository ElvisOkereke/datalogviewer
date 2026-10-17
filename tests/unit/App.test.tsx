import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from '@/App';

test('renders the brand in the banner', () => {
  render(<App />);
  expect(screen.getByRole('banner')).toHaveTextContent('DataLogViewer');
});
