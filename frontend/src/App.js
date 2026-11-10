import { useEffect, useState } from 'react';
import AdminDashboard from './AdminDashboard';
import StudentAssignmentPortal from './StudentAssignmentPortal';
import './App.css';

async function readResponse(response) {
  const responseText = await response.text();
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    if (
      (response.headers.get('content-type') || '').includes('text/html') ||
      /^\s*</.test(responseText)
    ) {
      throw new Error(
        `Expected a JSON response but received HTML (HTTP ${response.status}). Check the API route and frontend proxy.`
      );
    }
    throw new Error(`The server returned invalid JSON (HTTP ${response.status}).`);
  }
}

function App() {
  const [authStatus, setAuthStatus] = useState('loading');
  const [loginMode, setLoginMode] = useState('admin');
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        const adminResponse = await fetch('/api/auth/me');
        if (adminResponse.status !== 401) {
          const adminBody = await readResponse(adminResponse);
          if (!adminResponse.ok) {
            throw new Error(
              adminBody.error ||
                `Unable to verify admin sign-in (${adminResponse.status}).`
            );
          }
          if (isMounted) {
            setAuthStatus('admin');
          }
          return;
        }

        const studentResponse = await fetch('/api/student/me');
        if (studentResponse.status === 401) {
          if (isMounted) {
            setAuthStatus('unauthenticated');
          }
          return;
        }

        const studentBody = await readResponse(studentResponse);
        if (!studentResponse.ok) {
          throw new Error(
            studentBody.error ||
              `Unable to verify student sign-in (${studentResponse.status}).`
          );
        }
        if (isMounted) {
          setAuthStatus('student');
        }
      } catch (requestError) {
        if (isMounted) {
          setAuthError(requestError.message || 'Unable to verify sign-in.');
          setAuthStatus('unauthenticated');
        }
      }
    }

    checkSession();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError('');
    setIsSigningIn(true);

    try {
      const isAdminLogin = loginMode === 'admin';
      const studentIdentifier = studentId.trim();
      const response = await fetch(
        isAdminLogin ? '/api/auth/login' : '/api/student/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isAdminLogin
              ? { email, password }
              : {
                  ...(studentIdentifier.includes('@')
                    ? { email: studentIdentifier }
                    : { studentId: studentIdentifier }),
                  password,
                }
          ),
        }
      );
      const responseBody = await readResponse(response);
      if (!response.ok) {
        throw new Error(
          responseBody.error || `Sign-in failed (${response.status}).`
        );
      }

      setPassword('');
      setAuthStatus(isAdminLogin ? 'admin' : 'student');
    } catch (requestError) {
      setAuthError(requestError.message || 'Unable to sign in.');
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    setAuthError('');
    try {
      const response = await fetch(
        authStatus === 'admin' ? '/api/auth/logout' : '/api/student/logout',
        { method: 'POST' }
      );
      const responseBody = await readResponse(response);
      if (!response.ok) {
        throw new Error(
          responseBody.error || `Sign-out failed (${response.status}).`
        );
      }
      setAuthStatus('unauthenticated');
      setPassword('');
      setEmail('');
      setStudentId('');
    } catch (requestError) {
      setAuthError(requestError.message || 'Unable to sign out.');
    }
  }

  if (authStatus === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <p role="status" className="text-sm font-medium text-slate-600">
          Checking sign-in…
        </p>
      </main>
    );
  }

  if (authStatus === 'unauthenticated') {
    const isAdminLogin = loginMode === 'admin';
    return (
      <main className="login-shell flex min-h-screen items-center justify-center px-4 py-10">
        <section className="login-card w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            JNCT Completions
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {isAdminLogin ? 'Admin sign-in' : 'Student sign-in'}
          </h1>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              aria-pressed={isAdminLogin}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                isAdminLogin
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
              onClick={() => {
                setLoginMode('admin');
                setAuthError('');
              }}
              type="button"
            >
              Admin
            </button>
            <button
              aria-pressed={!isAdminLogin}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                !isAdminLogin
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
              onClick={() => {
                setLoginMode('student');
                setAuthError('');
              }}
              type="button"
            >
              Student
            </button>
          </div>
          {authError && (
            <p
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {authError}
            </p>
          )}
          <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
            {isAdminLogin ? (
              <div>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="admin-email"
                >
                  Email
                </label>
                <input
                  autoComplete="username"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  id="admin-email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
            ) : (
              <div>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="student-id"
                >
                  Student ID or Email
                </label>
                <input
                  autoComplete="username"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  id="student-id"
                  onChange={(event) => setStudentId(event.target.value)}
                  placeholder="Enter your student ID or email"
                  required
                  value={studentId}
                />
              </div>
            )}
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="login-password"
              >
                Password
              </label>
              <input
                autoComplete="current-password"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                id="login-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <button
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSigningIn}
              type="submit"
            >
              {isSigningIn ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="App app-shell flex min-h-screen flex-col bg-slate-100">
      <header className="app-header sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="brand-mark hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black tracking-tight text-white sm:flex"
            >
              JNCT
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                JNCT Completions
              </p>
              <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {authStatus === 'admin' ? 'Admin workspace' : 'Student workspace'}
              </h1>
            </div>
          </div>
          <button
            className="app-signout shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        </div>
        {authError && (
          <p className="mx-auto mt-3 max-w-7xl text-sm text-red-700" role="alert">
            {authError}
          </p>
        )}
      </header>
      <div className="app-content mx-auto w-full max-w-7xl flex-1">
        {authStatus === 'admin' ? (
          <AdminDashboard />
        ) : (
          <StudentAssignmentPortal />
        )}
      </div>
      <footer className="app-footer border-t border-slate-200 px-4 py-5 text-center text-sm text-slate-500 sm:px-6">
        <p>
          <span className="font-semibold text-slate-700">JNCT Completions</span>
          <span aria-hidden="true"> · </span>
          Learn with purpose. Complete with confidence.
        </p>
      </footer>
    </div>
  );
}

export default App;
