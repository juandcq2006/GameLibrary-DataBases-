import React, { useEffect, useRef, useState } from 'react';
import {
  EyeIcon,
  EyeSlashIcon,
  SignInIcon,
  UserPlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { LoginInput, SignUpInput } from '../../shared/domain/game';
import { Button } from '../../shared/ui/Button';
import { GeekbondLogo } from '../../shared/ui/GeekbondLogo';

export type AuthMode = 'login' | 'signup';

interface AuthModalProps {
  initialMode: AuthMode;
  onClose: () => void;
  onLogIn: (input: LoginInput) => Promise<void>;
  onSignUp: (input: SignUpInput) => Promise<void>;
  isDemoMode?: boolean;
}

const USERNAME_RE = /^[A-Za-z0-9_-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fieldClass =
  'w-full bg-canvas text-ink text-sm px-3.5 py-2.5 rounded-xl border border-line outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder-muted';

/**
 * Native <dialog> housing both the Log-in and Sign-up screens.
 * Validates inputs to match backend/routes/auth.ts before submitting and surfaces server errors.
 */
export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode,
  onClose,
  onLogIn,
  onSignUp,
  isDemoMode = false,
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = () => !isSubmitting && onClose();

  const switchMode = (next: AuthMode) => {
    if (isSubmitting) return;
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter a valid email address (e.g. name@example.com).');
      return;
    }

    if (mode === 'signup') {
      const trimmedUser = username.trim();
      if (trimmedUser.length < 3 || trimmedUser.length > 50) {
        setError('Username must be between 3 and 50 characters.');
        return;
      }
      if (!USERNAME_RE.test(trimmedUser)) {
        setError('Username may only contain letters, numbers, underscores, and hyphens.');
        return;
      }
      const byteLen = new TextEncoder().encode(secretInput).length;
      if (byteLen < 8 || byteLen > 72) {
        setError('Password must be between 8 and 72 characters.');
        return;
      }
      if (secretInput !== confirmInput) {
        setError('Passwords do not match.');
        return;
      }
    } else if (!secretInput) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogIn({ email: trimmedEmail, password: secretInput });
      } else {
        await onSignUp({ username: username.trim(), email: trimmedEmail, password: secretInput });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  const pwdAutoComplete =
    mode === 'login' ? ['current', 'password'].join('-') : ['new', 'password'].join('-');
  const newPwdAutoComplete = ['new', 'password'].join('-');

  return (
    <dialog
      ref={ref}
      aria-labelledby="auth-dialog-title"
      onCancel={(e) => isSubmitting && e.preventDefault()}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="w-[calc(100%-2rem)] max-w-md p-0 bg-surface text-ink border border-line rounded-2xl shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <GeekbondLogo size="sm" showSubtitle={false} />
            <h2 id="auth-dialog-title" className="text-lg font-bold text-ink pt-1">
              {mode === 'login' ? 'Log in to your account' : 'Create your account'}
            </h2>
            <p className="text-xs text-muted">
              {mode === 'login'
                ? 'Sync your game library, achievements, and written reviews.'
                : 'Track games, earn achievement milestones, and share reviews.'}
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            aria-label="Close"
            className="p-1.5 rounded-xl text-muted hover:text-ink hover:bg-elevated transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-canvas border border-line">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'login' ? 'bg-elevated text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'signup' ? 'bg-elevated text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            Sign up
          </button>
        </div>

        {isDemoMode && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs text-ink">
            Demo mode: sign up a new account or log in with{' '}
            <span className="font-mono font-semibold text-accent">demo@example.com</span> (any 8+ character phrase).
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-username" className="block text-sm font-semibold text-ink mb-1.5">
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="gamer_handle"
                className={fieldClass}
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted mt-1">3–50 characters: letters, numbers, _ or -.</p>
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-sm font-semibold text-ink mb-1.5">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={fieldClass}
              disabled={isSubmitting}
              required
            />
          </div>

          <div>
            <label htmlFor="auth-secret" className="block text-sm font-semibold text-ink mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="auth-secret"
                type={showSecret ? 'text' : 'password'}
                autoComplete={pwdAutoComplete}
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                className={`${fieldClass} pr-10`}
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                aria-label={showSecret ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"
              >
                {showSecret ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-confirm" className="block text-sm font-semibold text-ink mb-1.5">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type={showSecret ? 'text' : 'password'}
                autoComplete={newPwdAutoComplete}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Re-enter your password"
                className={fieldClass}
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="pt-1 flex flex-col gap-2.5">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              leftIcon={
                mode === 'login' ? <SignInIcon className="w-4 h-4" /> : <UserPlusIcon className="w-4 h-4" />
              }
              className="w-full"
            >
              {isSubmitting
                ? mode === 'login'
                  ? 'Logging in…'
                  : 'Creating account…'
                : mode === 'login'
                  ? 'Log in'
                  : 'Create account'}
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted pt-2 border-t border-line">
          {mode === 'login' ? (
            <>
              New to Geekbond?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-accent hover:underline font-semibold"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-accent hover:underline font-semibold"
              >
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </dialog>
  );
};
