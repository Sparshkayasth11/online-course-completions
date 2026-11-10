const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');

process.env.NODE_PATH = [
  process.env.NODE_PATH,
  path.resolve(__dirname, '..', 'node_modules'),
]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

const {
  adminCredentialsMatch,
  clearSessionCookie,
  hashPassword,
  requireAdmin,
  requireStudent,
  setSessionCookie,
  setStudentSessionCookie,
  validateAuthConfig,
  verifyPassword,
} = require('../../auth');

const authEnvironmentKeys = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET'];

function configureAuth(t) {
  const previousValues = Object.fromEntries(
    authEnvironmentKeys.map((key) => [key, process.env[key]])
  );
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
  process.env.SESSION_SECRET = '01234567890123456789012345678901';

  t.after(() => {
    for (const key of authEnvironmentKeys) {
      if (previousValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValues[key];
      }
    }
  });
}

test('requires a strong session secret', (t) => {
  configureAuth(t);
  process.env.SESSION_SECRET = 'short';

  assert.throws(validateAuthConfig, /at least 32 characters/);
});

test('checks configured admin credentials without exposing a token', (t) => {
  configureAuth(t);

  assert.equal(
    adminCredentialsMatch('ADMIN@example.com', 'correct-horse-battery-staple'),
    true
  );
  assert.equal(adminCredentialsMatch('admin@example.com', 'incorrect'), false);
});

test('sets and validates an HttpOnly admin session cookie', (t) => {
  configureAuth(t);

  let token;
  let cookieOptions;
  setSessionCookie({
    cookie(name, value, options) {
      assert.equal(name, 'admin_session');
      token = value;
      cookieOptions = options;
    },
  });

  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.sameSite, 'strict');
  assert.equal(cookieOptions.secure, false);

  let accepted = false;
  const response = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  requireAdmin(
    { headers: { cookie: `admin_session=${token}` } },
    response,
    () => {
      accepted = true;
    }
  );

  assert.equal(accepted, true);
});

test('configures production session cookies for cross-origin requests', (t) => {
  configureAuth(t);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  let cookieOptions;
  setSessionCookie({
    cookie(name, value, options) {
      cookieOptions = options;
    },
  });

  assert.equal(cookieOptions.sameSite, 'none');
  assert.equal(cookieOptions.secure, true);
});

test('rejects invalid admin session cookies', (t) => {
  configureAuth(t);

  let statusCode;
  let nextCalled = false;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  requireAdmin(
    { headers: { cookie: 'admin_session=invalid' } },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);
});

test('clears the session cookie with matching security attributes', (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  let cookieName;
  let cookieOptions;
  clearSessionCookie({
    clearCookie(name, options) {
      cookieName = name;
      cookieOptions = options;
    },
  });

  assert.equal(cookieName, 'admin_session');
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.sameSite, 'none');
  assert.equal(cookieOptions.secure, true);
  assert.equal(cookieOptions.path, '/');
});

test('hashes new student passwords with a per-password salt', async () => {
  const firstHash = await hashPassword('student-password');
  const secondHash = await hashPassword('student-password');

  assert.match(firstHash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.match(secondHash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(firstHash, secondHash);
});

test('verifies student passwords without accepting invalid hashes', async () => {
  const hash = await hashPassword('student-password');

  assert.equal(await verifyPassword('student-password', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword('student-password', 'plaintext'), false);
});

test('sets and validates a signed student session cookie', (t) => {
  configureAuth(t);
  let token;
  setStudentSessionCookie(
    {
      cookie(name, value, options) {
        assert.equal(name, 'student_session');
        assert.equal(options.httpOnly, true);
        token = value;
      },
    },
    '0123456789abcdef01234567'
  );

  let studentId;
  const response = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  const request = { headers: { cookie: `student_session=${token}` } };
  requireStudent(request, response, () => {
    studentId = request.studentId;
  });
  assert.equal(studentId, '0123456789abcdef01234567');
});

test('GET /api/auth/me returns admin details only for a valid session', async (t) => {
  configureAuth(t);
  const previousFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://online-course-completions.vercel.app';
  t.after(() => {
    if (previousFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  const { app } = require('../../server');
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  await new Promise((resolve) => server.once('listening', resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const preflightResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://online-course-completions.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflightResponse.status, 204);
  assert.equal(
    preflightResponse.headers.get('access-control-allow-origin'),
    'https://online-course-completions.vercel.app'
  );
  assert.equal(
    preflightResponse.headers.get('access-control-allow-credentials'),
    'true'
  );

  const unauthenticatedResponse = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(unauthenticatedResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
    }),
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get('set-cookie').split(';')[0];

  const authenticatedResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(authenticatedResponse.status, 200);
  assert.deepEqual(await authenticatedResponse.json(), {
    authenticated: true,
    admin: { email: 'admin@example.com', role: 'admin' },
  });
});

test('loads backend environment variables from root and backend working directories', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const serverPath = path.join(projectRoot, 'server.js');
  const childEnvironment = { ...process.env };
  delete childEnvironment.MONGO_URI;

  for (const workingDirectory of [projectRoot, path.join(projectRoot, 'backend')]) {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        'require(process.argv[1]); process.exit(process.env.MONGO_URI ? 0 : 1);',
        serverPath,
      ],
      {
        cwd: workingDirectory,
        env: childEnvironment,
        encoding: 'utf8',
      }
    );

    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr);
  }
});
