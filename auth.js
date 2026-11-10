const { createHmac, randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = 'admin_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function isAuthConfigured() {
  return Boolean(
    process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD &&
      process.env.SESSION_SECRET &&
      process.env.SESSION_SECRET.length >= 32
  );
}

function validateAuthConfig() {
  if (!process.env.ADMIN_EMAIL) {
    throw new Error('ADMIN_EMAIL is not configured.');
  }
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is not configured.');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const match = /^scrypt\$([a-f\d]{32})\$([a-f\d]{128})$/i.exec(storedHash);
  if (!match) {
    return false;
  }

  const [, salt, expectedHash] = match;
  const actualHash = await scryptAsync(password, salt, 64);
  const expectedHashBuffer = Buffer.from(expectedHash, 'hex');
  return (
    actualHash.length === expectedHashBuffer.length &&
    timingSafeEqual(actualHash, expectedHashBuffer)
  );
}

function adminCredentialsMatch(email, password) {
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!configuredEmail || !configuredPassword || !secret || !email || !password) {
    return false;
  }

  const providedPasswordHash = createHmac('sha256', secret)
    .update(password)
    .digest();
  const configuredPasswordHash = createHmac('sha256', secret)
    .update(configuredPassword)
    .digest();

  return (
    email.trim().toLowerCase() === configuredEmail.trim().toLowerCase() &&
    timingSafeEqual(providedPasswordHash, configuredPasswordHash)
  );
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    })
  ).toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function createStudentSessionToken(studentId) {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'student',
      studentId,
      exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    })
  ).toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function readSignedSession(token) {
  if (!token || !isAuthConfigured()) {
    return false;
  }

  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length) {
    return false;
  }

  const expectedSignature = createHmac('sha256', process.env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const actualSignatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    actualSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)
  ) {
    return false;
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

function isValidSessionToken(token) {
  const session = readSignedSession(token);
  return Boolean(
    session &&
      session.role === 'admin' &&
      Number.isInteger(session.exp) &&
      session.exp > Math.floor(Date.now() / 1000)
  );
}

function readSessionCookie(req, cookieName = SESSION_COOKIE) {
  const cookieHeader = req.headers.cookie || '';
  const sessionCookie = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`));

  return sessionCookie ? sessionCookie.slice(cookieName.length + 1) : '';
}

function setSessionCookie(res) {
  res.cookie(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS * 1000,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

function setStudentSessionCookie(res, studentId) {
  res.cookie('student_session', createStudentSessionToken(studentId), {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS * 1000,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

function clearStudentSessionCookie(res) {
  res.clearCookie('student_session', {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

function requireAdmin(req, res, next) {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: 'Admin authentication is not configured.' });
  }

  if (!isValidSessionToken(readSessionCookie(req))) {
    return res.status(401).json({ error: 'Admin sign-in is required.' });
  }

  return next();
}

function requireStudent(req, res, next) {
  const session = readSignedSession(readSessionCookie(req, 'student_session'));
  if (
    !session ||
    session.role !== 'student' ||
    typeof session.studentId !== 'string' ||
    !/^[a-f\d]{24}$/i.test(session.studentId) ||
    !Number.isInteger(session.exp) ||
    session.exp <= Math.floor(Date.now() / 1000)
  ) {
    return res.status(401).json({ error: 'Student sign-in is required.' });
  }

  req.studentId = session.studentId;
  return next();
}

module.exports = {
  adminCredentialsMatch,
  clearSessionCookie,
  clearStudentSessionCookie,
  hashPassword,
  isAuthConfigured,
  requireStudent,
  requireAdmin,
  setSessionCookie,
  setStudentSessionCookie,
  validateAuthConfig,
  verifyPassword,
};
