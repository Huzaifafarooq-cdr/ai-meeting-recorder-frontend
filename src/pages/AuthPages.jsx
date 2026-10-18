import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AudioLines, ListChecks, Sparkles } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { Logo } from '../components/AppLayout';
import { Alert, Button, Field, inputClass } from '../components/ui';
import { LIMITS, validateLogin, validateRegister } from '../lib/validation';

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md text-white">
          <h2 className="text-3xl font-semibold leading-tight">Focus on the conversation. We'll take the notes.</h2>
          <ul className="mt-8 space-y-5 text-brand-100">
            <li className="flex gap-3">
              <AudioLines className="h-6 w-6 shrink-0 text-white" aria-hidden /> Live transcripts with speaker detection as you talk.
            </li>
            <li className="flex gap-3">
              <Sparkles className="h-6 w-6 shrink-0 text-white" aria-hidden /> AI summaries, key decisions and keywords automatically.
            </li>
            <li className="flex gap-3">
              <ListChecks className="h-6 w-6 shrink-0 text-white" aria-hidden /> Action items with owners and due dates, ready to share.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function useAuthForm(initial, validate, submit) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);
  const bind = (name) => ({
    id: name,
    name,
    value: values[name],
    onChange: (e) => {
      const { value } = e.target;
      setValues((v) => ({ ...v, [name]: value }));
      if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest);
    },
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    const invalid = validate(values);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      document.getElementById(Object.keys(initial).find((k) => invalid[k]))?.focus();
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, k === 'password' ? v : v.trim()]));
      await submit(clean);
    } catch (err) {
      if (err.details?.length) setErrors(Object.fromEntries(err.details.toReversed().map((d) => [d.field, d.message])));
      else setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return { bind, errors, formError, loading, onSubmit };
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useAuthForm({ email: '', password: '' }, validateLogin, async (v) => {
    await login(v);
    navigate(location.state?.from ?? '/', { replace: true });
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your meeting notes."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <Field label="Email" id="email" error={form.errors.email}>
          <input type="email" autoComplete="email" required maxLength={LIMITS.email} className={inputClass} {...form.bind('email')} />
        </Field>
        <Field label="Password" id="password" error={form.errors.password}>
          <input type="password" autoComplete="current-password" required maxLength={LIMITS.password} className={inputClass} {...form.bind('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={form.loading}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const form = useAuthForm({ name: '', email: '', password: '' }, validateRegister, async (v) => {
    await register(v);
    navigate('/', { replace: true });
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start recording smarter meetings in seconds."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <Field label="Full name" id="name" error={form.errors.name}>
          <input autoComplete="name" required maxLength={LIMITS.name} className={inputClass} {...form.bind('name')} />
        </Field>
        <Field label="Email" id="email" error={form.errors.email}>
          <input type="email" autoComplete="email" required maxLength={LIMITS.email} className={inputClass} {...form.bind('email')} />
        </Field>
        <Field label="Password" id="password" error={form.errors.password} hint="At least 8 characters, with a letter and a number.">
          <input type="password" autoComplete="new-password" required maxLength={LIMITS.password} className={inputClass} {...form.bind('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={form.loading}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
