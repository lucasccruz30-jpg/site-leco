const { Pool, neonConfig } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const ws = require('ws');

const DATABASE_PROVIDER = 'neon';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const PERFIS = new Map([
  ['familia', 'Família / responsável'],
  ['escola', 'Escola / instituição'],
  ['outro', 'Outro perfil'],
]);

neonConfig.webSocketConstructor = ws;

let pool;
let schemaReady;
let resendClient;

function sendJson(response, status, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(payload);
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  const calculateDigit = (base, factor) => {
    let total = 0;
    for (const digit of base) {
      total += Number(digit) * factor;
      factor -= 1;
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calculateDigit(digits.slice(0, 9), 10);
  const secondDigit = calculateDigit(digits.slice(0, 10), 11);

  return firstDigit === Number(digits[9]) && secondDigit === Number(digits[10]);
}

function getConfig() {
  const connectionString = process.env.DATABASE_URL;
  const resendApiKey = process.env.RESEND_API_KEY || '';
  const contactEmail = process.env.LECO_CONTACT_EMAIL || 'contato@lecoapp.com.br';
  const fromEmail = process.env.LECO_MAIL_FROM || 'LECO <onboarding@resend.dev>';
  const replyToEmail = process.env.LECO_MAIL_REPLY_TO || contactEmail;

  return {
    connectionString,
    resendApiKey,
    contactEmail,
    fromEmail,
    replyToEmail,
    provider: DATABASE_PROVIDER,
    backendConfigured: Boolean(connectionString),
    emailConfigured: Boolean(resendApiKey),
  };
}

function getPool(connectionString) {
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 3,
    });
  }

  return pool;
}

function getResendClient(apiKey) {
  if (!apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

async function ensureSchema(connectionString) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool(connectionString);
      await db.query(`
        CREATE TABLE IF NOT EXISTS solicitacoes_exclusao_dados (
          id BIGSERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          email TEXT NOT NULL,
          cpf TEXT,
          celular TEXT,
          perfil TEXT NOT NULL,
          referencia TEXT,
          mensagem TEXT,
          confirmacao_exclusao BOOLEAN NOT NULL,
          origem TEXT NOT NULL DEFAULT 'site',
          email_status TEXT NOT NULL DEFAULT 'pendente',
          notificacao_email_id TEXT,
          confirmacao_email_id TEXT,
          email_error TEXT,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE solicitacoes_exclusao_dados
          ADD COLUMN IF NOT EXISTS cpf TEXT;

        CREATE INDEX IF NOT EXISTS idx_solicitacoes_exclusao_dados_criado_em
          ON solicitacoes_exclusao_dados (criado_em DESC);
        CREATE INDEX IF NOT EXISTS idx_solicitacoes_exclusao_dados_email
          ON solicitacoes_exclusao_dados (email);
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}

function validate(body) {
  const data = {
    nome: String(body.nome || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    cpf: String(body.cpf || '').trim(),
    celular: String(body.celular || '').trim(),
    perfil: String(body.perfil || '').trim(),
    referencia: String(body.referencia || '').trim(),
    mensagem: String(body.mensagem || '').trim(),
    confirmacao_exclusao: Boolean(body.confirmacao_exclusao),
  };

  const errors = {};

  if (data.nome.length < 3) {
    errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
  }
  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = ['Informe um e-mail válido.'];
  }
  if (!CPF_REGEX.test(data.cpf) || !isValidCpf(data.cpf)) {
    errors.cpf = ['Informe um CPF válido.'];
  }
  if (data.celular && !CELULAR_REGEX.test(data.celular)) {
    errors.celular = ['Use o formato (11) 99999-9999.'];
  }
  if (!PERFIS.has(data.perfil)) {
    errors.perfil = ['Selecione o perfil da conta.'];
  }
  if (!data.confirmacao_exclusao) {
    errors.confirmacao_exclusao = ['Você precisa confirmar a leitura do termo e a solicitação de exclusão.'];
  }

  return { data, errors };
}

async function insertSolicitacao(config, payload) {
  await ensureSchema(config.connectionString);

  const db = getPool(config.connectionString);
  const result = await db.query(
    `
      INSERT INTO solicitacoes_exclusao_dados (
        nome,
        email,
        cpf,
        celular,
        perfil,
        referencia,
        mensagem,
        confirmacao_exclusao
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, criado_em
    `,
    [
      payload.nome,
      payload.email,
      payload.cpf,
      payload.celular || null,
      payload.perfil,
      payload.referencia || null,
      payload.mensagem || null,
      payload.confirmacao_exclusao,
    ]
  );

  return result.rows[0];
}

async function updateEmailMetadata(config, id, emailResult) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);

  await db.query(
    `
      UPDATE solicitacoes_exclusao_dados
      SET email_status = $2,
          notificacao_email_id = $3,
          confirmacao_email_id = $4,
          email_error = $5
      WHERE id = $1
    `,
    [
      id,
      emailResult.status,
      emailResult.notificationId,
      emailResult.confirmationId,
      emailResult.error ? String(emailResult.error).slice(0, 1000) : null,
    ]
  );
}

function buildInternalEmailHtml(payload) {
  const perfil = PERFIS.get(payload.perfil) || payload.perfil;

  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Nova solicitação de exclusão de dados</h1>
      <p style="margin:0 0 20px;">Um novo pedido chegou pela página reservada do app LECO.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-weight:700;">Nome</td><td style="padding:8px 0;">${escapeHtml(payload.nome)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">E-mail da conta</td><td style="padding:8px 0;">${escapeHtml(payload.email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">CPF</td><td style="padding:8px 0;">${escapeHtml(payload.cpf)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Celular</td><td style="padding:8px 0;">${escapeHtml(payload.celular || 'Não informado')}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Perfil</td><td style="padding:8px 0;">${escapeHtml(perfil)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Referência adicional</td><td style="padding:8px 0;">${escapeHtml(payload.referencia || 'Não informada')}</td></tr>
      </table>
      <div style="margin-top:20px;padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Observações</strong>
        <p style="margin:0;white-space:pre-line;">${escapeHtml(payload.mensagem || 'Sem observações adicionais.')}</p>
      </div>
    </div>
  `;
}

function buildInternalEmailText(payload) {
  const perfil = PERFIS.get(payload.perfil) || payload.perfil;

  return [
    'Nova solicitação de exclusão de dados',
    '',
    `Nome: ${payload.nome}`,
    `E-mail da conta: ${payload.email}`,
    `CPF: ${payload.cpf}`,
    `Celular: ${payload.celular || 'Não informado'}`,
    `Perfil: ${perfil}`,
    `Referência adicional: ${payload.referencia || 'Não informada'}`,
    '',
    'Observações:',
    payload.mensagem || 'Sem observações adicionais.',
  ].join('\n');
}

function buildConfirmationHtml(payload) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Recebemos sua solicitação</h1>
      <p style="margin:0 0 16px;">Oi, ${escapeHtml(payload.nome)}.</p>
      <p style="margin:0 0 16px;">
        Sua solicitação de exclusão de dados do app LECO foi recebida com sucesso.
        Nosso time vai validar as informações enviadas e seguir com o atendimento pelos canais informados.
      </p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Resumo enviado</strong>
        <p style="margin:0;"><strong>E-mail da conta:</strong> ${escapeHtml(payload.email)}</p>
        <p style="margin:8px 0 0;"><strong>CPF:</strong> ${escapeHtml(payload.cpf)}</p>
        <p style="margin:8px 0 0;"><strong>Perfil:</strong> ${escapeHtml(PERFIS.get(payload.perfil) || payload.perfil)}</p>
      </div>
      <p style="margin:20px 0 0;">Obrigado,<br>Time LECO</p>
    </div>
  `;
}

function buildConfirmationText(payload) {
  return [
    `Oi, ${payload.nome}.`,
    '',
    'Sua solicitação de exclusão de dados do app LECO foi recebida com sucesso.',
    'Nosso time vai validar as informações enviadas e seguir com o atendimento pelos canais informados.',
    '',
    `E-mail da conta: ${payload.email}`,
    `CPF: ${payload.cpf}`,
    `Perfil: ${PERFIS.get(payload.perfil) || payload.perfil}`,
    '',
    'Obrigado,',
    'Time LECO',
  ].join('\n');
}

async function sendEmails(config, payload) {
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
      to: [config.contactEmail],
      replyTo: payload.email,
      subject: `Solicitação de exclusão de dados - ${payload.nome}`,
      html: buildInternalEmailHtml(payload),
      text: buildInternalEmailText(payload),
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
      subject: 'Recebemos sua solicitação de exclusão de dados',
      html: buildConfirmationHtml(payload),
      text: buildConfirmationText(payload),
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
  const config = getConfig();

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
      mensagem: 'O DATABASE_URL oficial do Neon ainda não foi configurado para receber solicitações.',
    });
    return;
  }

  const { data, errors } = validate(normalizeBody(request.body));
  if (Object.keys(errors).length > 0) {
    sendJson(response, 400, { status: 'validacao', errors });
    return;
  }

  try {
    const created = await insertSolicitacao(config, data);
    const emailResult = await sendEmails(config, data);
    await updateEmailMetadata(config, created.id, emailResult);

    sendJson(response, 200, {
      status: 'sucesso',
      id: created.id,
      email_status: emailResult.status,
    });
  } catch (error) {
    console.error('[POST /api/excluir-dados]', error);
    sendJson(response, 500, {
      status: 'erro',
      mensagem: 'Não foi possível registrar sua solicitação agora. Tente novamente em instantes.',
    });
  }
};
