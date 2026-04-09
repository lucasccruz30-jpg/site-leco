const {
  EMAIL_REGEX,
  CELULAR_REGEX,
  TYPE_LABELS,
  sendJson,
  normalizeBody,
  escapeHtml,
  getSupportConfig,
  getResendClient,
  insertSupportTicket,
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

function buildInternalEmailHtml(payload, protocolo) {
  const categoria = TYPE_LABELS.get(payload.categoria) || payload.categoria;

  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Novo chamado de suporte</h1>
      <p style="margin:0 0 20px;">Um novo chamado foi aberto pelo site da LECO.</p>
      <div style="margin:0 0 20px;padding:16px 18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:6px;">Protocolo</strong>
        <span>${escapeHtml(protocolo)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-weight:700;">Nome</td><td style="padding:8px 0;">${escapeHtml(payload.nome)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">E-mail</td><td style="padding:8px 0;">${escapeHtml(payload.email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Celular</td><td style="padding:8px 0;">${escapeHtml(payload.celular || 'Não informado')}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Assunto</td><td style="padding:8px 0;">${escapeHtml(categoria)}</td></tr>
      </table>
      <div style="margin-top:20px;padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Descrição</strong>
        <p style="margin:0;white-space:pre-line;">${escapeHtml(payload.descricao)}</p>
      </div>
    </div>
  `;
}

function buildInternalEmailText(payload, protocolo) {
  const categoria = TYPE_LABELS.get(payload.categoria) || payload.categoria;

  return [
    'Novo chamado de suporte',
    '',
    `Protocolo: ${protocolo}`,
    `Nome: ${payload.nome}`,
    `E-mail: ${payload.email}`,
    `Celular: ${payload.celular || 'Não informado'}`,
    `Assunto: ${categoria}`,
    '',
    'Descrição:',
    payload.descricao,
  ].join('\n');
}

function buildConfirmationHtml(payload, protocolo) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Chamado enviado com sucesso</h1>
      <p style="margin:0 0 16px;">Oi, ${escapeHtml(payload.nome)}.</p>
      <p style="margin:0 0 16px;">Recebemos sua solicitação e nossa equipe irá analisar o caso.</p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Número do protocolo</strong>
        <p style="margin:0;font-size:18px;font-weight:700;">${escapeHtml(protocolo)}</p>
      </div>
      <p style="margin:20px 0 0;">Você receberá a resposta no e-mail informado. Guarde o número do protocolo para futuras referências.</p>
      <p style="margin:20px 0 0;">Obrigado,<br>Time LECO</p>
    </div>
  `;
}

function buildConfirmationText(payload, protocolo) {
  return [
    `Oi, ${payload.nome}.`,
    '',
    'Chamado enviado com sucesso.',
    'Recebemos sua solicitação e nossa equipe irá analisar o caso.',
    '',
    `Número do protocolo: ${protocolo}`,
    'Você receberá a resposta no e-mail informado. Guarde o número do protocolo para futuras referências.',
    '',
    'Obrigado,',
    'Time LECO',
  ].join('\n');
}

async function sendEmails(config, payload, protocolo) {
  if (!config.emailConfigured) {
    return {
      status: 'nao_configurado',
      notificationId: null,
      confirmationId: null,
      error: 'RESEND_API_KEY ausente.',
    };
  }

  const resend = getResendClient(config.resendApiKey);
  const failures = [];
  let notificationId = null;
  let confirmationId = null;

  try {
    const { data, error } = await resend.emails.send({
      from: config.fromEmail,
      to: [config.supportEmail],
      replyTo: payload.email,
      subject: `Novo chamado de suporte - ${protocolo}`,
      html: buildInternalEmailHtml(payload, protocolo),
      text: buildInternalEmailText(payload, protocolo),
    });

    if (error) {
      throw new Error(error.message || 'Falha ao enviar notificação interna.');
    }

    notificationId = data?.id || null;
  } catch (error) {
    failures.push(`notificacao: ${error.message}`);
  }

  try {
    const { data, error } = await resend.emails.send({
      from: config.fromEmail,
      to: [payload.email],
      replyTo: config.replyToEmail,
      subject: `Recebemos seu chamado - ${protocolo}`,
      html: buildConfirmationHtml(payload, protocolo),
      text: buildConfirmationText(payload, protocolo),
    });

    if (error) {
      throw new Error(error.message || 'Falha ao enviar confirmação ao solicitante.');
    }

    confirmationId = data?.id || null;
  } catch (error) {
    failures.push(`confirmacao: ${error.message}`);
  }

  return {
    status: failures.length === 0 ? 'enviado' : (notificationId || confirmationId ? 'parcial' : 'falha'),
    notificationId,
    confirmationId,
    error: failures.length > 0 ? failures.join(' | ') : null,
  };
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
    const emailResult = await sendEmails(config, data, created.protocolo);
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
      mensagem: 'Não foi possível concluir seu cadastro agora. Tente novamente em instantes.',
    });
  }
};
