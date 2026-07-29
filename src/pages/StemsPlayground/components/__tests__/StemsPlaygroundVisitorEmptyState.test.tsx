import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = jest.fn();
const mockBootstrap = jest.fn();
const mockDispatch = jest.fn();

jest.mock('@shared/lib/hooks/useAppDispatch', () => ({
  useAppDispatch: () => mockDispatch,
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('@shared/lib/bootstrapPublicArtistPageSurfaces', () => ({
  bootstrapPublicArtistPageSurfaces: (...args: unknown[]) => mockBootstrap(...args),
}));

import { StemsPlaygroundVisitorEmptyState } from '../StemsPlaygroundVisitorEmptyState';

describe('StemsPlaygroundVisitorEmptyState', () => {
  it('bootstraps artist surfaces and navigates to the public artist page', () => {
    mockNavigate.mockClear();
    mockBootstrap.mockClear();
    mockDispatch.mockClear();

    const { container } = render(
      <MemoryRouter>
        <StemsPlaygroundVisitorEmptyState
          ui={{
            menu: {},
            buttons: {},
            titles: {},
            stems: {
              emptyTitle: 'Стемы пока недоступны',
              emptyDescription: 'Артист ещё не опубликовал стемы.',
              emptyGoToArtist: 'Перейти к артисту',
            },
          }}
          artistSlug="beatles"
          artistHubPath="/?artist=beatles"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveClass('empty-state--tab');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Стемы пока недоступны' })
    ).toBeInTheDocument();
    expect(screen.getByText('Артист ещё не опубликовал стемы.')).toBeInTheDocument();
    expect(container.querySelector('.artist-page-builder-block')).not.toBeInTheDocument();

    const actionButton = screen.getByRole('button', { name: 'Перейти к артисту' });
    expect(actionButton).toHaveClass('stems-page__visitor-empty-action');

    fireEvent.click(actionButton);

    expect(mockBootstrap).toHaveBeenCalledWith(mockDispatch, 'beatles');
    expect(mockNavigate).toHaveBeenCalledWith('/?artist=beatles', { replace: false });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
