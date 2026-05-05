import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('App', () => {
  it('redirects to the login page by default', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
  });
});
