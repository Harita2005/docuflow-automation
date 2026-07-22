import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../components/LoginPage';
import '@testing-library/jest-dom';
import { expect, test, vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

test('LoginPage renders correctly and submits data', async () => {
  const mockOnLoginSuccess = vi.fn();
  
  render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
  
  // Verify step 1 UI elements exist
  expect(screen.getByText('Email, Username, or Employee ID')).toBeInTheDocument();
  
  const identifierInput = screen.getByPlaceholderText('e.g. alerts@ramrajcotton.net or EMP-1001');
  
  // Simulate user typing identifier
  fireEvent.change(identifierInput, { target: { value: 'testuser' } });
  
  // Go to step 2 by clicking Next
  const nextButton = screen.getByRole('button', { name: /Next/i });
  fireEvent.click(nextButton);
  
  // Verify step 2 UI elements exist
  expect(screen.getByText('Password')).toBeInTheDocument();
  const passwordInput = screen.getByPlaceholderText('••••••••');
  
  // Simulate user typing password
  fireEvent.change(passwordInput, { target: { value: 'password123' } });
  
  // Mock the fetch response
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ token: 'mock-token', user: { id: '1', role: 'manager', email: 'test@example.com', username: 'testuser' } })
  });
  
  // Find the submit button and submit
  const submitButton = screen.getByRole('button', { name: /Sign in to account/i });
  fireEvent.click(submitButton);
  
  // Verify fetch was called correctly
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'testuser', password: 'password123' })
    });
    expect(mockOnLoginSuccess).toHaveBeenCalledWith('1', 'manager', 'test@example.com', 'testuser');
  });
});
