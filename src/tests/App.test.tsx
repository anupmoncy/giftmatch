import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App.js';

describe('App', () => {
  it('redirects to the login page by default', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
  });

  it('links the logo to Find Gifts from the login page', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /giftmatch/i })).toHaveAttribute('href', '/quiz');
  });
});
