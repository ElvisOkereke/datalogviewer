import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

afterEach(() => vi.restoreAllMocks());

test('a crashing child shows a labelled fallback with recovery actions', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary label="the charts">
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong in the charts');
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
    'href',
    expect.stringContaining('render-error'),
  );
});

test('healthy children render normally', () => {
  render(
    <ErrorBoundary label="the charts">
      <p>fine</p>
    </ErrorBoundary>,
  );
  expect(screen.getByText('fine')).toBeInTheDocument();
});

test('a new resetKey (e.g. another log) clears the fallback', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { rerender } = render(
    <ErrorBoundary label="the charts" resetKey="log-a">
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toBeInTheDocument();
  rerender(
    <ErrorBoundary label="the charts" resetKey="log-b">
      <p>recovered</p>
    </ErrorBoundary>,
  );
  expect(screen.getByText('recovered')).toBeInTheDocument();
});
