const { Pool, neonConfig } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const ws = require('ws');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const ESTADOS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
const TIPOS_INSTITUICAO = new Map([
  ['escola-privada', 'Escola privada'],
  ['escola-publica', 'Escola publica'],
  ['rede-de-ensino', 'Rede de ensino'],
  ['instituicao-social', 'Instituicao social'],
  ['outro', 'Outro formato'],
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
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
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
        CREATE TABLE IF NOT EXISTS solicitacoes_apresentacao (
          id BIGSERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          cargo TEXT NOT NULL,
          instituicao TEXT NOT NULL,
          email TEXT NOT NULL,
          celular TEXT NOT NULL,
          tipo_instituicao TEXT NOT NULL,
          quantidade_alunos INTEGER NOT NULL CHECK (quantidade_alunos >= 1 AND quantidade_alunos <= 50000),
          cidade TEXT NOT NULL,
          estado CHAR(2) NOT NULL,
          mensagem TEXT NOT NULL,
          aceite_contato BOOLEAN NOT NULL,
          origem TEXT NOT NULL DEFAULT 'site',
          email_status TEXT NOT NULL DEFAULT 'pendente',
          notificacao_email_id TEXT,
          confirmacao_email_id TEXT,
          email_error TEXT,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_solicitacoes_apresentacao_criado_em
          ON solicitacoes_apresentacao (criado_em DESC);
        CREATE INDEX IF NOT EXISTS idx_solicitacoes_apresentacao_email
          ON solicitacoes_apresentacao (email);
        CREATE INDEX IF NOT EXISTS idx_solicitacoes_apresentacao_instituicao
          ON solicitacoes_apresentacao (instituicao);
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
    cargo: String(body.cargo || '').trim(),
    instituicao: String(body.instituicao || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    celular: String(body.celular || '').trim(),
    tipo_instituicao: String(body.tipo_instituicao || '').trim(),
    quantidade_alunos: Number(body.quantidade_alunos),
    cidade: String(body.cidade || '').trim(),
    estado: String(body.estado || '').trim().toUpperCase(),
    mensagem: String(body.mensagem || '').trim(),
    aceite_contato: Boolean(body.aceite_contato),
  };

  const errors = {};

  if (data.nome.length < 3) {
    errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
  }
  if (data.cargo.length < 2) {
    errors.cargo = ['Informe o cargo ou funcao responsavel pela solicitacao.'];
  }
  if (data.instituicao.length < 2) {
    errors.instituicao = ['Informe o nome da instituicao.'];
  }
  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = ['Informe um e-mail valido.'];
  }
  if (!CELULAR_REGEX.test(data.celular)) {
    errors.celular = ['Use o formato (11) 99999-9999.'];
  }
  if (!TIPOS_INSTITUICAO.has(data.tipo_instituicao)) {
    errors.tipo_instituicao = ['Selecione o tipo de instituicao.'];
  }
  if (!Number.isInteger(data.quantidade_alunos) || data.quantidade_alunos < 1 || data.quantidade_alunos > 50000) {
    errors.quantidade_alunos = ['Informe um numero inteiro entre 1 e 50000.'];
  }
  if (data.cidade.length < 2) {
    errors.cidade = ['Informe a cidade da instituicao.'];
  }
  if (!ESTADOS.has(data.estado)) {
    errors.estado = ['Selecione um estado valido.'];
  }
  if (data.mensagem.length < 20) {
    errors.mensagem = ['Descreva o contexto da solicitacao com pelo menos 20 caracteres.'];
  }
  if (data.mensagem.length > 1500) {
    errors.mensagem = ['Resuma a mensagem em ate 1500 caracteres.'];
  }
  if (!data.aceite_contato) {
    errors.aceite_contato = ['Voce precisa autorizar o contato para continuar.'];
  }

  return { data, errors };
}

async function insertSolicitacao(config, payload) {
  await ensureSchema(config.connectionString);

  const db = getPool(config.connectionString);
  const result = await db.query(
    `
      INSERT INTO solicitacoes_apresentacao (
        nome,
        cargo,
        instituicao,
        email,
        celular,
        tipo_instituicao,
        quantidade_alunos,
        cidade,
        estado,
        mensagem,
        aceite_contato
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, criado_em
    `,
    [
      payload.nome,
      payload.cargo,
      payload.instituicao,
      payload.email,
      payload.celular,
      payload.tipo_instituicao,
      payload.quantidade_alunos,
      payload.cidade,
      payload.estado,
      payload.mensagem,
      payload.aceite_contato,
    ]
  );

  return result.rows[0];
}

async function updateEmailMetadata(config, id, emailResult) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);

  await db.query(
    `
      UPDATE solicitacoes_apresentacao
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
  const tipoInstituicao = TIPOS_INSTITUICAO.get(payload.tipo_instituicao) || payload.tipo_instituicao;

  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Nova solicitacao de apresentacao</h1>
      <p style="margin:0 0 20px;">Uma nova solicitacao chegou pelo site da LECO.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-weight:700;">Nome</td><td style="padding:8px 0;">${escapeHtml(payload.nome)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Cargo</td><td style="padding:8px 0;">${escapeHtml(payload.cargo)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Instituicao</td><td style="padding:8px 0;">${escapeHtml(payload.instituicao)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">E-mail</td><td style="padding:8px 0;">${escapeHtml(payload.email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Celular</td><td style="padding:8px 0;">${escapeHtml(payload.celular)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Tipo</td><td style="padding:8px 0;">${escapeHtml(tipoInstituicao)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Quantidade de alunos</td><td style="padding:8px 0;">${escapeHtml(payload.quantidade_alunos)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Cidade / Estado</td><td style="padding:8px 0;">${escapeHtml(payload.cidade)} - ${escapeHtml(payload.estado)}</td></tr>
      </table>
      <div style="margin-top:20px;padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Contexto da solicitacao</strong>
        <p style="margin:0;white-space:pre-line;">${escapeHtml(payload.mensagem)}</p>
      </div>
    </div>
  `;
}

function buildInternalEmailText(payload) {
  const tipoInstituicao = TIPOS_INSTITUICAO.get(payload.tipo_instituicao) || payload.tipo_instituicao;

  return [
    'Nova solicitacao de apresentacao',
    '',
    `Nome: ${payload.nome}`,
    `Cargo: ${payload.cargo}`,
    `Instituicao: ${payload.instituicao}`,
    `E-mail: ${payload.email}`,
    `Celular: ${payload.celular}`,
    `Tipo de instituicao: ${tipoInstituicao}`,
    `Quantidade de alunos: ${payload.quantidade_alunos}`,
    `Cidade / Estado: ${payload.cidade} - ${payload.estado}`,
    '',
    'Contexto da solicitacao:',
    payload.mensagem,
  ].join('\n');
}

function buildConfirmationHtml(payload) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Recebemos sua solicitacao</h1>
      <p style="margin:0 0 16px;">Oi, ${escapeHtml(payload.nome)}.</p>
      <p style="margin:0 0 16px;">
        Sua solicitacao de apresentacao da LECO foi recebida com sucesso.
        Em breve nosso time entrara em contato para entender melhor o contexto da sua instituicao
        e compartilhar a proposta mais adequada.
      </p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Resumo enviado</strong>
        <p style="margin:0;"><strong>Instituicao:</strong> ${escapeHtml(payload.instituicao)}</p>
        <p style="margin:8px 0 0;"><strong>Quantidade de alunos:</strong> ${escapeHtml(payload.quantidade_alunos)}</p>
      </div>
      <p style="margin:20px 0 0;">Obrigado,<br>Time LECO</p>
    </div>
  `;
}

function buildConfirmationText(payload) {
  return [
    `Oi, ${payload.nome}.`,
    '',
    'Sua solicitacao de apresentacao da LECO foi recebida com sucesso.',
    'Em breve nosso time entrara em contato para entender melhor o contexto da sua instituicao e compartilhar a proposta mais adequada.',
    '',
    `Instituicao: ${payload.instituicao}`,
    `Quantidade de alunos: ${payload.quantidade_alunos}`,
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
      subject: `Nova solicitacao de apresentacao - ${payload.instituicao}`,
      html: buildInternalEmailHtml(payload),
      text: buildInternalEmailText(payload),
    });

    if (error) {
      throw new Error(error.message || 'Falha ao enviar notificacao interna.');
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
      subject: 'Recebemos sua solicitacao de apresentacao',
      html: buildConfirmationHtml(payload),
      text: buildConfirmationText(payload),
    });

    if (error) {
      throw new Error(error.message || 'Falha ao enviar confirmacao ao solicitante.');
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
    });
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    sendJson(response, 405, { status: 'erro', mensagem: 'Metodo nao permitido.' });
    return;
  }

  if (!config.backendConfigured) {
    sendJson(response, 503, {
      status: 'erro',
      mensagem: 'O banco de dados ainda nao foi configurado para receber solicitacoes.',
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
    console.error('[POST /api/apresentacao]', error);
    sendJson(response, 500, {
      status: 'erro',
      mensagem: 'Nao foi possivel registrar sua solicitacao agora. Tente novamente em instantes.',
    });
  }
};
