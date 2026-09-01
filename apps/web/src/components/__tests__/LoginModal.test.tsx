import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginModal from '../LoginModal';

// Mock simplewebauthn and react-oauth
vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: () => vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

describe('LoginModal Component', () => {
  it('should render all three login options including the sneak peek demo box', () => {
    const onSuccess = vi.fn();
    render(<LoginModal onSuccess={onSuccess} />);

    expect(screen.getByText('Portfolio Tracker')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByText('Continue with Passkey / Touch ID')).toBeInTheDocument();

    // Third box: Sneak peek demo button
    expect(screen.getByRole('button', { name: /Would you like to take a sneak peek\?/i })).toBeInTheDocument();
  });

  it('should trigger demo sign in when clicking Would you like to take a sneak peek?', async () => {
    const onSuccess = vi.fn();
    const mockDemoUser = {
      id: 'demo-user-123',
      email: 'demo@portfolio.local',
      name: 'Joe',
      country: 'Spain',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: 'mock-demo-token',
        user: mockDemoUser,
      }),
    } as Response);

    vi.stubGlobal('fetch', mockFetch);

    render(<LoginModal onSuccess={onSuccess} />);

    const demoButton = screen.getByRole('button', { name: /Would you like to take a sneak peek\?/i });
    fireEvent.click(demoButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockDemoUser);
    });
  });
});
