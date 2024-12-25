/**
 * Comprehensive test suite for LoginForm component
 * Tests authentication flows, form validation, accessibility, and security measures
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';

// Component under test
import LoginForm from '../../../../src/components/auth/LoginForm';

// Mock hooks and utilities
vi.mock('../../../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    verifyMfa: mockVerifyMfa,
    persistSession: mockPersistSession
  })
}));

// Mock toast notifications
vi.mock('../../../../src/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast
  })
}));

// Global test variables
const mockLogin = vi.fn();
const mockVerifyMfa = vi.fn();
const mockPersistSession = vi.fn();
const mockShowToast = vi.fn();
let user: ReturnType<typeof userEvent.setup>;

// Test constants
const VALID_EMAIL = 'test@example.com';
const VALID_PASSWORD = 'Test@12345678';
const VALID_MFA_CODE = '123456';
const INVALID_EMAIL = 'invalid-email';
const INVALID_PASSWORD = 'weak';
const INVALID_MFA_CODE = '12345';

describe('LoginForm', () => {
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('should render all form elements correctly', () => {
      render(<LoginForm />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should be accessible according to WCAG 2.1 AA', async () => {
      const { container } = render(<LoginForm />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support high contrast mode', () => {
      render(<LoginForm />);
      const form = screen.getByRole('form');
      expect(form).toHaveStyle({
        'color-scheme': 'light dark'
      });
    });
  });

  describe('Form Validation', () => {
    it('should validate email format', async () => {
      render(<LoginForm />);
      const emailInput = screen.getByLabelText(/email/i);

      await user.type(emailInput, INVALID_EMAIL);
      await user.tab();

      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });

    it('should validate password requirements', async () => {
      render(<LoginForm />);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(passwordInput, INVALID_PASSWORD);
      await user.tab();

      expect(screen.getByText(/password must be at least 12 characters/i)).toBeInTheDocument();
    });

    it('should validate required fields', async () => {
      render(<LoginForm />);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.click(submitButton);

      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });

    it('should validate MFA code format when required', async () => {
      render(<LoginForm requireMFA />);
      const mfaInput = screen.getByLabelText(/mfa code/i);

      await user.type(mfaInput, INVALID_MFA_CODE);
      await user.tab();

      expect(screen.getByText(/mfa code must be 6 digits/i)).toBeInTheDocument();
    });
  });

  describe('Authentication Flow', () => {
    it('should handle successful login', async () => {
      const onSuccess = vi.fn();
      render(<LoginForm onSuccess={onSuccess} />);

      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: VALID_EMAIL,
          password: VALID_PASSWORD,
          rememberMe: false
        });
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('should handle MFA verification flow', async () => {
      mockLogin.mockResolvedValueOnce({ mfaRequired: true });
      render(<LoginForm />);

      // Initial login
      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // MFA verification
      await waitFor(() => {
        expect(screen.getByLabelText(/mfa code/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/mfa code/i), VALID_MFA_CODE);
      await user.click(screen.getByRole('button', { name: /verify mfa/i }));

      await waitFor(() => {
        expect(mockVerifyMfa).toHaveBeenCalledWith({
          mfaToken: VALID_MFA_CODE,
          mfaCode: VALID_MFA_CODE
        });
      });
    });

    it('should handle session persistence', async () => {
      render(<LoginForm persistSession />);

      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      await user.click(screen.getByRole('checkbox', { name: /remember me/i }));
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPersistSession).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display network error messages', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Network error'));
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
      });
    });

    it('should handle rate limiting', async () => {
      const error = new Error('Too many attempts');
      error.name = 'RateLimitError';
      mockLogin.mockRejectedValueOnce(error);

      render(<LoginForm />);

      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts/i);
        expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
      });
    });

    it('should handle invalid credentials', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i);
      });
    });
  });

  describe('Security Features', () => {
    it('should mask password input', () => {
      render(<LoginForm />);
      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should prevent multiple simultaneous submissions', async () => {
      render(<LoginForm />);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(screen.getByLabelText(/email/i), VALID_EMAIL);
      await user.type(screen.getByLabelText(/password/i), VALID_PASSWORD);
      
      // Attempt multiple submissions
      await user.click(submitButton);
      await user.click(submitButton);
      await user.click(submitButton);

      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it('should clear sensitive form data after submission', async () => {
      render(<LoginForm />);
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(emailInput, VALID_EMAIL);
      await user.type(passwordInput, VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(emailInput).toHaveValue('');
        expect(passwordInput).toHaveValue('');
      });
    });
  });
});