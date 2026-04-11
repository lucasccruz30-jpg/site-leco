const {
  EMAIL_REGEX,
  CELULAR_REGEX,
  TYPE_LABELS,
  sendJson,
  normalizeBody,
  getSupportConfig,
  insertSupportTicket,
  sendSupportCreationEmails,
  updateSupportEmailMetadata,
} = require('../lib/support-core');

function validate(body) {
  const data = {
    nome: String(body.nome || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    celular: String(body.celular || '').trim(),
    categoria: String(body.categoria || '').trim(),
    descricao: String(body.descricao || '').trim(),
    aceite_termos: Boolean(body.aceite_termos),
    prioridade: 'media',
    origem: 'site',
  };

  const errors = {};

  if (data.nome.length < 3) {
    errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
  }
  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = ['Informe um e-mail válido.'];
  }
  if (data.celular && !CELULAR_REGEX.test(data.celular)) {
    errors.celular = ['Use o formato (11) 99999-9999.'];
  }
  if (!TYPE_LABELS.has(data.categoria)) {
    errors.categoria = ['Selecione o assunto do chamado.'];
  }
  if (data.descricao.length < 20) {
    errors.descricao = ['Descreva a solicitação com pelo menos 20 caracteres.'];
  }
  if (!data.aceite_termos) {
    errors.aceite_termos = ['Você precisa concordar com os termos para continuar.'];
  }

  return { data, errors };
}

module.exports = async function handler(request, response) {
  const config = getSupportConfig();

  if (request.method === 'GET') {
    sendJson(response, 200, {
      backend_configured: config.backendConfigured,
      email_configured: config.emailConfigured,
      database_provider: config.provider,
    });
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    sendJson(response, 405, { status: 'erro', mensagem: 'Método não permitido.' });
    return;
  }

  if (!config.backendConfigured) {
    sendJson(response, 503, {
      status: 'erro',
      mensagem: 'O DATABASE_URL oficial do Neon ainda não foi configurado para receber chamados.',
    });
    return;
  }

  const { data, errors } = validate(normalizeBody(request.body));
  if (Object.keys(errors).length > 0) {
    sendJson(response, 400, { status: 'validacao', errors });
    return;
  }

  try {
    const created = await insertSupportTicket(config, data);
    const emailResult = await sendSupportCreationEmails(config, data, created);
    await updateSupportEmailMetadata(config, created.id, emailResult);

    sendJson(response, 200, {
      status: 'sucesso',
      protocolo: created.protocolo,
      email_status: emailResult.status,
    });
  } catch (error) {
    console.error('[POST /api/suporte]', error);
    sendJson(response, 500, {
      status: 'erro',
      mensagem: 'Não foi possível concluir seu chamado agora. Tente novamente em instantes.',
    });
  }
};
