const crypto = require('crypto');

const COOKIE_NAME = 'leco_admin_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function getAdminConfig() {
  const username = process.env.LECO_ADMIN_USERNAME || '';
  const password = process.env.LECO_ADMIN_PASSWORD || '';
  const sessionSecret = process.env.LECO_ADMIN_SESSION_SECRET || '';

  return {
    username,
    password,
    sessionSecret,
    configured: Boolean(username && password && sessionSecret),
  };
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((accumulator, item) => {
    const [key, ...valueParts] = item.trim().split('=');
    if (!key) return accumulator;
    accumulator[key] = decodeURIComponent(valueParts.join('=') || '');
    return accumulator;
  }, {});
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionToken(username, secret) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      exp: Date.now() + SESSION_DURATION_MS,
    })
  ).toString('base64url');

  const signature = signValue(payload, secret);
  return `${payload}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret || !token.includes('.')) {
    return null;
  }

  const [payload, signature] = token.split('.');
  const expected = signValue(payload, secret);

  if (!timingSafeEqualString(signature, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function setSessionCookie(response, token) {
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function getSessionFromRequest(request, config) {
  const cookies = parseCookies(request.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  return verifySessionToken(token, config.sessionSecret);
}

function authenticateCredentials(username, password, config) {
  if (!config.configured) {
    return false;
  }

  return (
    timingSafeEqualString(username, config.username) &&
    timingSafeEqualString(password, config.password)
  );
}

function requireAdminSession(request, response, sendJson) {
  const config = getAdminConfig();

  if (!config.configured) {
    sendJson(response, 503, {
      status: 'erro',
      mensagem: 'Credenciais do painel interno ainda não foram configuradas.',
      configured: false,
    });
    return null;
  }

  const session = getSessionFromRequest(request, config);
  if (!session) {
    sendJson(response, 401, {
      status: 'nao_autorizado',
      mensagem: 'Faça login para acessar o painel interno.',
    });
    return null;
  }

  return {
    username: session.username,
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_DURATION_MS,
  getAdminConfig,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  authenticateCredentials,
  createSessionToken,
  requireAdminSession,
};
