const {
  getAdminConfig,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  authenticateCredentials,
  createSessionToken,
} = require('../../lib/admin-auth');
const { sendJson, normalizeBody } = require('../../lib/support-core');

module.exports = async function handler(request, response) {
  const config = getAdminConfig();

  if (request.method === 'GET') {
    const session = config.configured ? getSessionFromRequest(request, config) : null;
    sendJson(response, 200, {
      configured: config.configured,
      authenticated: Boolean(session),
      username: session?.username || null,
    });
    return;
  }

  if (request.method === 'POST') {
    if (!config.configured) {
      sendJson(response, 503, {
        status: 'erro',
        mensagem: 'Credenciais do painel interno ainda não foram configuradas.',
        configured: false,
      });
      return;
    }

    const body = normalizeBody(request.body);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!authenticateCredentials(username, password, config)) {
      sendJson(response, 401, {
        status: 'erro',
        mensagem: 'Usuário ou senha inválidos.',
      });
      return;
    }

    const token = createSessionToken(username, config.sessionSecret);
    setSessionCookie(response, token);

    sendJson(response, 200, {
      status: 'sucesso',
      authenticated: true,
      username,
    });
    return;
  }

  if (request.method === 'DELETE') {
    clearSessionCookie(response);
    sendJson(response, 200, {
      status: 'sucesso',
      authenticated: false,
    });
    return;
  }

  response.setHeader('Allow', 'GET, POST, DELETE');
  sendJson(response, 405, {
    status: 'erro',
    mensagem: 'Método não permitido.',
  });
};
