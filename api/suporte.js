const { Pool, neonConfig } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const ws = require('ws');

const DATABASE_PROVIDER = 'neon';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const CATEGORIAS = new Map([
  ['problemas-tecnicos', 'Problemas técnicos'],
  ['acesso-e-conta', 'Acesso e conta'],
  ['assinatura-e-planos', 'Assinatura e planos'],
  ['outros-assuntos', 'Outros assuntos'],
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

function getConfig() {
  const connectionString = process.env.DATABASE_URL;
  const resendApiKey = process.env.RESEND_API_KEY || '';
  const supportEmail = process.env.LECO_SUPPORT_EMAIL || 'suporte@lecoapp.com.br';
  const fromEmail = process.env.LECO_MAIL_FROM || 'LECO <onboarding@resend.dev>';
  const replyToEmail = process.env.LECO_MAIL_REPLY_TO || supportEmail;

  return {
    connectionString,
    resendApiKey,
    supportEmail,
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
        CREATE TABLE IF NOT EXISTS chamados_suporte (
          id BIGSERIAL PRIMARY KEY,
          protocolo TEXT UNIQUE,
          nome TEXT NOT NULL,
          email TEXT NOT NULL,
          celular TEXT,
          categoria TEXT NOT NULL,
          descricao TEXT NOT NULL,
          aceite_termos BOOLEAN NOT NULL,
          origem TEXT NOT NULL DEFAULT 'site',
          status TEXT NOT NULL DEFAULT 'recebido',
          email_status TEXT NOT NULL DEFAULT 'pendente',
          notificacao_email_id TEXT,
          confirmacao_email_id TEXT,
          email_error TEXT,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_criado_em
          ON chamados_suporte (criado_em DESC);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_email
          ON chamados_suporte (email);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_categoria
          ON chamados_suporte (categoria);
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
    celular: String(body.celular || '').trim(),
    categoria: String(body.categoria || '').trim(),
    descricao: String(body.descricao || '').trim(),
    aceite_termos: Boolean(body.aceite_termos),
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
  if (!CATEGORIAS.has(data.categoria)) {
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

async function insertChamado(config, payload) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);

  const insertResult = await db.query(
    `
      INSERT INTO chamados_suporte (
        nome,
        email,
        celular,
        categoria,
        descricao,
        aceite_termos
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, criado_em
    `,
    [
      payload.nome,
      payload.email,
      payload.celular || null,
      payload.categoria,
      payload.descricao,
      payload.aceite_termos,
    ]
  );

  const created = insertResult.rows[0];
  const protocolo = `SUP-${String(created.id).padStart(6, '0')}`;

  await db.query(
    `
      UPDATE chamados_suporte
      SET protocolo = $2
      WHERE id = $1
    `,
    [created.id, protocolo]
  );

  return {
    ...created,
    protocolo,
  };
}

async function updateEmailMetadata(config, id, emailResult) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);

  await db.query(
    `
      UPDATE chamados_suporte
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

function buildInternalEmailHtml(payload, protocolo) {
  const categoria = CATEGORIAS.get(payload.categoria) || payload.categoria;

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
  const categoria = CATEGORIAS.get(payload.categoria) || payload.categoria;

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
    const created = await insertChamado(config, data);
    const emailResult = await sendEmails(config, data, created.protocolo);
    await updateEmailMetadata(config, created.id, emailResult);

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
