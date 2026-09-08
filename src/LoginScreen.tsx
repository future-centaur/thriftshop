import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { api, authApi, type User } from './api';
import {
  bouncySpring, smoothSpring,
  pageVariants, staggerContainer, staggerItem,
} from './animations';
import {
  ChevronRight, Lock, Hash, Mail, User as UserIcon, ArrowLeft,
  Check, X,
} from 'lucide-react';

// ============================================================
// FirstRunWizard — shown on a fresh DB with no users
// ============================================================
export function FirstRunWizard({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = name.length > 1 && email.includes('@') && password.length >= 8 && password === confirmPassword;

  const submit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await authApi.registerFirstAdmin(name, email, password);
      onSuccess(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create admin account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center p-6"
      variants={pageVariants(1)}
      initial="initial"
      animate="enter"
      style={{ background: 'var(--bg-primary)' }}
    >
      <motion.div
        className="w-full max-w-md"
        variants={staggerContainer(0.05, 0.05)}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerItem} className="text-center mb-8">
          <div
            className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
            }}
          >
            <Check size={32} style={{ color: 'var(--text-inverse)' }} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Create your admin account to get started
          </p>
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="rounded-3xl p-6"
          style={{
            background: 'var(--bg-card)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <FormField
            label="Your name"
            icon={<UserIcon size={18} />}
            value={name}
            onChange={setName}
            placeholder="Jane Doe"
          />
          <FormField
            label="Email"
            icon={<Mail size={18} />}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@shop.com"
            autoComplete="email"
          />
          <FormField
            label="Password"
            icon={<Lock size={18} />}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <FormField
            label="Confirm password"
            icon={<Lock size={18} />}
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter password"
            autoComplete="new-password"
            error={password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : null}
          />

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="rounded-xl p-3 mb-4 text-sm"
                style={{ background: '#FEE2E2', color: '#991B1B' }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            disabled={!isValid || submitting}
            whileTap={isValid ? tapPress : undefined}
            onClick={submit}
            className="w-full rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 mt-2"
            style={{
              background: isValid
                ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                : 'var(--bg-secondary)',
              color: isValid ? 'var(--text-inverse)' : 'var(--text-muted)',
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Creating...' : 'Create admin account'}
            {isValid && <ChevronRight size={18} />}
          </motion.button>
        </motion.div>

        <motion.p
          variants={staggerItem}
          className="text-center text-xs mt-6"
          style={{ color: 'var(--text-muted)' }}
        >
          This is the first run — you'll be the only admin and can add attendants later.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// LoginScreen — PIN + Password login
// ============================================================
export function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  // Public bootstrap lists only active users — deactivated people stay off the PIN picker
  useEffect(() => {
    if (mode === 'pin') {
      api.get<{ users: User[] }>('/api/bootstrap')
        .then((r) => setUsers(r.data.users || []))
        .catch(() => setUsers([]));
    }
  }, [mode]);

  const submitPin = async () => {
    if (!selectedUser || pin.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await authApi.login(selectedUser.email, undefined, pin);
      onLogin(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await authApi.login(email, password, undefined);
      onLogin(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.requestPasswordReset(email);
      setError('If that email exists, a reset link has been sent. Check the server console in dev mode.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send reset link');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when PIN reaches 4 digits
  useEffect(() => {
    if (mode === 'pin' && pin.length === 4 && selectedUser && !loading) {
      submitPin();
    }
  }, [pin, mode, selectedUser, loading]);

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center p-6"
      variants={pageVariants(1)}
      initial="initial"
      animate="enter"
      style={{ background: 'var(--bg-primary)' }}
    >
      <motion.div
        className="w-full max-w-md"
        variants={staggerContainer(0.05, 0.05)}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerItem} className="text-center mb-8">
          <div
            className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
            }}
          >
            <Hash size={32} style={{ color: 'var(--text-inverse)' }} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {forgotMode ? 'Reset your password' : mode === 'pin' ? 'Sign in with your PIN' : 'Sign in with email and password'}
          </p>
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="rounded-3xl p-6"
          style={{
            background: 'var(--bg-card)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <AnimatePresence mode="wait">
            {forgotMode ? (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={smoothSpring}
              >
                <FormField
                  label="Email"
                  icon={<Mail size={18} />}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@shop.com"
                  autoComplete="email"
                />
                <ActionButton
                  onClick={submitForgot}
                  disabled={!email || loading}
                  label={loading ? 'Sending...' : 'Send reset link'}
                />
                <button
                  onClick={() => { setForgotMode(false); setError(null); }}
                  className="w-full mt-3 text-sm flex items-center justify-center gap-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={14} /> Back to login
                </button>
              </motion.div>
            ) : mode === 'pin' ? (
              <motion.div
                key="pin"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={smoothSpring}
              >
                {users.length > 0 ? (
                  <>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Choose your name
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {users.map((u) => (
                        <motion.button
                          key={u.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => { setSelectedUser(u); setPin(''); setError(null); }}
                          className="rounded-xl p-3 text-left text-sm font-medium transition-colors"
                          style={{
                            background: selectedUser?.id === u.id ? 'var(--accent-light)' : 'var(--bg-secondary)',
                            color: selectedUser?.id === u.id ? 'var(--accent-secondary)' : 'var(--text-primary)',
                            border: selectedUser?.id === u.id ? '1.5px solid var(--accent-primary)' : '1.5px solid transparent',
                          }}
                        >
                          {u.name}
                        </motion.button>
                      ))}
                    </div>
                    {selectedUser && (
                      <PinPad
                        value={pin}
                        onChange={setPin}
                        disabled={loading}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-sm mb-4">No PIN-based users available.</p>
                    <button
                      onClick={() => setMode('password')}
                      className="text-sm font-medium"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      Use password instead →
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={smoothSpring}
              >
                <FormField
                  label="Email"
                  icon={<Mail size={18} />}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@shop.com"
                  autoComplete="email"
                />
                <FormField
                  label="Password"
                  icon={<Lock size={18} />}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Your password"
                  autoComplete="current-password"
                  onEnter={submitPassword}
                />
                <ActionButton
                  onClick={submitPassword}
                  disabled={!email || !password || loading}
                  label={loading ? 'Signing in...' : 'Sign in'}
                />
                <button
                  onClick={() => { setForgotMode(true); setError(null); }}
                  className="w-full mt-3 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Forgot password?
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="rounded-xl p-3 mt-4 text-sm"
                style={{ background: error.includes('sent') ? 'var(--accent-light)' : '#FEE2E2', color: error.includes('sent') ? 'var(--accent-secondary)' : '#991B1B' }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {!forgotMode && (
          <motion.button
            variants={staggerItem}
            onClick={() => { setMode(mode === 'pin' ? 'password' : 'pin'); setError(null); }}
            className="w-full mt-4 text-sm font-medium"
            style={{ color: 'var(--accent-primary)' }}
          >
            {mode === 'pin' ? 'Use password instead' : 'Use PIN instead'}
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// Form field
// ============================================================
function FormField({
  label, icon, type = 'text', value, onChange, placeholder, autoComplete, error, onEnter,
}: {
  label: string;
  icon: React.ReactNode;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
  onEnter?: () => void;
}) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <div
        className="rounded-2xl flex items-center gap-2 px-3.5 py-3"
        style={{
          background: 'var(--bg-secondary)',
          border: '1.5px solid transparent',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
      {error && <p className="text-xs mt-1" style={{ color: '#991B1B' }}>{error}</p>}
    </div>
  );
}

// ============================================================
// Action button
// ============================================================
function ActionButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <motion.button
      disabled={disabled}
      whileTap={disabled ? undefined : tapPress}
      onClick={onClick}
      className="w-full rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 mt-2"
      style={{
        background: disabled
          ? 'var(--bg-secondary)'
          : 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-inverse)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
      {!disabled && <ChevronRight size={18} />}
    </motion.button>
  );
}

// ============================================================
// PIN pad
// ============================================================
function PinPad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  const handleDigit = (digit: string) => {
    if (disabled) return;
    if (value.length < 4) onChange(value + digit);
  };
  const handleDelete = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, value, onChange]);

  return (
    <div
      className="mt-2 outline-none"
      ref={rootRef}
      tabIndex={0}
      aria-label="Enter your PIN"
    >
      {/* PIN display */}
      <div className="flex justify-center gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            animate={value.length > i ? { scale: [0, 1.2, 1] } : { scale: 1 }}
            transition={bouncySpring}
            className="w-4 h-4 rounded-full"
            style={{
              background: value.length > i ? 'var(--accent-primary)' : 'var(--bg-secondary)',
            }}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinButton key={d} label={d} onPress={() => handleDigit(d)} disabled={disabled || value.length >= 4} />
        ))}
        <div /> {/* empty */}
        <PinButton label="0" onPress={() => handleDigit('0')} disabled={disabled || value.length >= 4} />
        <PinButton label="⌫" onPress={handleDelete} disabled={disabled || value.length === 0} icon />
      </div>
    </div>
  );
}

function PinButton({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled: boolean; icon?: boolean }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.95 }}
      type="button"
      onClick={onPress}
      disabled={disabled}
      className="rounded-2xl py-4 text-xl font-semibold flex items-center justify-center"
      style={{
        background: disabled ? 'transparent' : 'var(--bg-secondary)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon ? <X size={18} /> : label}
    </motion.button>
  );
}

// Re-import the spring constant from animations
const tapPress = { scale: 0.97 };
