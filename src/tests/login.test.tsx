import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../pages/Login.js';

const mockState = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockState.signInWithPassword,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  mockState.signInWithPassword.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
});

describe('LoginPage', () => {
  it('continues to sign in when sign-up fetch reports a network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'Fetch Retry' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret1' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /sign up/i })[1]);

    await waitFor(() => {
      expect(mockState.signInWithPassword).toHaveBeenCalledWith({
        email: 'fetch-retry@users.giftmatch.app',
        password: 'secret1',
      });
    });

    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
  });
});
