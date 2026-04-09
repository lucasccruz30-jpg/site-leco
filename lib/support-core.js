const { Pool, neonConfig } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

const DATABASE_PROVIDER = 'neon';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;

const TYPE_LABELS = new Map([
  ['problemas-tecnicos', 'Problemas técnicos'],
  ['acesso-e-conta', 'Acesso e conta'],
  ['assinatura-e-planos', 'Assinatura e planos'],
  ['outros-assuntos', 'Outros assuntos'],
]);

const PRIORITY_LABELS = new Map([
  ['baixa', 'Baixa'],
  ['media', 'Média'],
  ['alta', 'Alta'],
]);

const STATUS_LABELS = new Map([
  ['aberto', 'Aberto'],
  ['em_analise', 'Em análise'],
  ['respondido', 'Respondido'],
  ['concluido', 'Concluído'],
]);

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

function typeLabel(value) {
  return TYPE_LABELS.get(value) || 'Outros assuntos';
}

function priorityLabel(value) {
  return PRIORITY_LABELS.get(value) || 'Média';
}

function statusLabel(value) {
  return STATUS_LABELS.get(value) || 'Aberto';
}

function normalizePriority(value) {
  if (!value) return 'media';
  return PRIORITY_LABELS.has(value) ? value : 'media';
}

function normalizeStatus(value) {
  if (!value) return 'aberto';
  return STATUS_LABELS.has(value) ? value : 'aberto';
}

function normalizeType(value) {
  if (!value) return 'outros-assuntos';
  return TYPE_LABELS.has(value) ? value : 'outros-assuntos';
}

function getSupportConfig() {
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

async function ensureSupportSchema(connectionString) {
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
          tipo TEXT,
          prioridade TEXT,
          assunto TEXT,
          descricao TEXT NOT NULL,
          status TEXT,
          aceite_termos BOOLEAN NOT NULL,
          origem TEXT NOT NULL DEFAULT 'site',
          email_status TEXT NOT NULL DEFAULT 'pendente',
          notificacao_email_id TEXT,
          confirmacao_email_id TEXT,
          email_error TEXT,
          anexo_nome TEXT,
          anexo_url TEXT,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ
        );

        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS tipo TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS prioridade TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS assunto TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS anexo_nome TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS anexo_url TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS chamados_suporte_historico (
          id BIGSERIAL PRIMARY KEY,
          chamado_id BIGINT NOT NULL REFERENCES chamados_suporte(id) ON DELETE CASCADE,
          evento TEXT NOT NULL,
          autor TEXT NOT NULL DEFAULT 'sistema',
          descricao TEXT NOT NULL,
          payload JSONB,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_criado_em
          ON chamados_suporte (criado_em DESC);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_created_at
          ON chamados_suporte (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_email
          ON chamados_suporte (email);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_status
          ON chamados_suporte (status);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_prioridade
          ON chamados_suporte (prioridade);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_tipo
          ON chamados_suporte (tipo);
        CREATE INDEX IF NOT EXISTS idx_chamados_suporte_historico_chamado
          ON chamados_suporte_historico (chamado_id, criado_em ASC);
      `);

      await db.query(`
        UPDATE chamados_suporte
        SET protocolo = 'SUP-' || LPAD(id::text, 6, '0')
        WHERE protocolo IS NULL OR protocolo = '';

        UPDATE chamados_suporte
        SET tipo = COALESCE(NULLIF(tipo, ''), categoria, 'outros-assuntos'),
            prioridade = COALESCE(NULLIF(prioridade, ''), 'media'),
            assunto = COALESCE(NULLIF(assunto, ''), CASE
              WHEN categoria = 'problemas-tecnicos' THEN 'Problemas técnicos'
              WHEN categoria = 'acesso-e-conta' THEN 'Acesso e conta'
              WHEN categoria = 'assinatura-e-planos' THEN 'Assinatura e planos'
              ELSE 'Outros assuntos'
            END),
            status = COALESCE(NULLIF(status, ''), 'aberto'),
            created_at = COALESCE(created_at, criado_em, NOW()),
            updated_at = COALESCE(updated_at, created_at, criado_em, NOW())
        WHERE
          tipo IS NULL OR tipo = '' OR
          prioridade IS NULL OR prioridade = '' OR
          assunto IS NULL OR assunto = '' OR
          status IS NULL OR status = '' OR
          created_at IS NULL OR
          updated_at IS NULL;
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}

async function logSupportHistory(db, chamadoId, { evento, autor, descricao, payload }) {
  await db.query(
    `
      INSERT INTO chamados_suporte_historico (
        chamado_id,
        evento,
        autor,
        descricao,
        payload
      ) VALUES ($1, $2, $3, $4, $5)
    `,
    [chamadoId, evento, autor, descricao, payload ? JSON.stringify(payload) : null]
  );
}

async function insertSupportTicket(config, payload) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);

  const tipo = normalizeType(payload.categoria);
  const prioridade = normalizePriority(payload.prioridade);
  const assunto = String(payload.assunto || '').trim() || typeLabel(tipo);

  const result = await db.query(
    `
      INSERT INTO chamados_suporte (
        nome,
        email,
        celular,
        categoria,
        tipo,
        prioridade,
        assunto,
        descricao,
        status,
        aceite_termos,
        origem,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
      RETURNING id, created_at, updated_at
    `,
    [
      payload.nome,
      payload.email,
      payload.celular || null,
      tipo,
      tipo,
      prioridade,
      assunto,
      payload.descricao,
      'aberto',
      payload.aceite_termos,
      payload.origem || 'site',
    ]
  );

  const created = result.rows[0];
  const protocolo = `SUP-${String(created.id).padStart(6, '0')}`;

  await db.query(
    `
      UPDATE chamados_suporte
      SET protocolo = $2
      WHERE id = $1
    `,
    [created.id, protocolo]
  );

  await logSupportHistory(db, created.id, {
    evento: 'criacao',
    autor: 'sistema',
    descricao: 'Chamado aberto pelo portal de suporte.',
    payload: {
      status: 'aberto',
      prioridade,
      tipo,
    },
  });

  return {
    id: created.id,
    protocolo,
    created_at: created.created_at,
    updated_at: created.updated_at,
    prioridade,
    tipo,
    assunto,
  };
}

async function updateSupportEmailMetadata(config, id, emailResult) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);

  await db.query(
    `
      UPDATE chamados_suporte
      SET email_status = $2,
          notificacao_email_id = $3,
          confirmacao_email_id = $4,
          email_error = $5,
          updated_at = NOW()
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

function mapTicketRow(row) {
  const tipo = row.tipo || row.categoria || 'outros-assuntos';
  const prioridade = row.prioridade || 'media';
  const status = row.status || 'aberto';

  return {
    id: row.id,
    protocolo: row.protocolo,
    nome: row.nome,
    email: row.email,
    celular: row.celular,
    tipo,
    tipo_label: typeLabel(tipo),
    prioridade,
    prioridade_label: priorityLabel(prioridade),
    assunto: row.assunto || typeLabel(tipo),
    descricao: row.descricao,
    status,
    status_label: statusLabel(status),
    anexo_nome: row.anexo_nome,
    anexo_url: row.anexo_url,
    created_at: row.created_at || row.criado_em,
    updated_at: row.updated_at || row.created_at || row.criado_em,
    created_at_display: row.created_at || row.criado_em,
    updated_at_display: row.updated_at || row.created_at || row.criado_em,
  };
}

async function listSupportTickets(config, filters = {}) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);

  const clauses = [];
  const values = [];

  if (filters.status && STATUS_LABELS.has(filters.status)) {
    values.push(filters.status);
    clauses.push(`COALESCE(status, 'aberto') = $${values.length}`);
  }

  if (filters.prioridade && PRIORITY_LABELS.has(filters.prioridade)) {
    values.push(filters.prioridade);
    clauses.push(`COALESCE(prioridade, 'media') = $${values.length}`);
  }

  if (filters.tipo && TYPE_LABELS.has(filters.tipo)) {
    values.push(filters.tipo);
    clauses.push(`COALESCE(tipo, categoria, 'outros-assuntos') = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    clauses.push(`(
      protocolo ILIKE $${values.length}
      OR nome ILIKE $${values.length}
      OR email ILIKE $${values.length}
    )`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `
      SELECT
        id,
        protocolo,
        nome,
        email,
        celular,
        categoria,
        tipo,
        prioridade,
        assunto,
        descricao,
        status,
        anexo_nome,
        anexo_url,
        COALESCE(created_at, criado_em) AS created_at,
        COALESCE(updated_at, created_at, criado_em) AS updated_at
      FROM chamados_suporte
      ${where}
      ORDER BY COALESCE(created_at, criado_em) DESC
      LIMIT 250
    `,
    values
  );

  return result.rows.map(mapTicketRow);
}

async function getSupportTicketDetail(config, ticketId) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);

  const isNumericId = /^\d+$/.test(String(ticketId || ''));
  const ticketResult = await db.query(
    `
      SELECT
        id,
        protocolo,
        nome,
        email,
        celular,
        categoria,
        tipo,
        prioridade,
        assunto,
        descricao,
        status,
        anexo_nome,
        anexo_url,
        COALESCE(created_at, criado_em) AS created_at,
        COALESCE(updated_at, created_at, criado_em) AS updated_at
      FROM chamados_suporte
      WHERE ${isNumericId ? 'id = $1' : 'protocolo = $1'}
      LIMIT 1
    `,
    [ticketId]
  );

  if (ticketResult.rowCount === 0) {
    return null;
  }

  const historyResult = await db.query(
    `
      SELECT
        id,
        evento,
        autor,
        descricao,
        payload,
        criado_em
      FROM chamados_suporte_historico
      WHERE chamado_id = $1
      ORDER BY criado_em ASC, id ASC
    `,
    [ticketResult.rows[0].id]
  );

  const ticket = mapTicketRow(ticketResult.rows[0]);
  ticket.history = historyResult.rows.map((row) => ({
    id: row.id,
    evento: row.evento,
    autor: row.autor,
    descricao: row.descricao,
    payload: row.payload,
    criado_em: row.criado_em,
  }));

  return ticket;
}

async function updateSupportTicket(config, ticketId, changes, actor) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const current = await getSupportTicketDetail(config, ticketId);

  if (!current) {
    return null;
  }

  const nextStatus = changes.status ? normalizeStatus(changes.status) : current.status;
  const nextPriority = changes.prioridade ? normalizePriority(changes.prioridade) : current.prioridade;

  await db.query(
    `
      UPDATE chamados_suporte
      SET status = $2,
          prioridade = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [current.id, nextStatus, nextPriority]
  );

  if (nextStatus !== current.status) {
    await logSupportHistory(db, current.id, {
      evento: 'status',
      autor: actor || 'suporte',
      descricao: `Status alterado para ${statusLabel(nextStatus)}.`,
      payload: {
        from: current.status,
        to: nextStatus,
      },
    });
  }

  if (nextPriority !== current.prioridade) {
    await logSupportHistory(db, current.id, {
      evento: 'prioridade',
      autor: actor || 'suporte',
      descricao: `Prioridade alterada para ${priorityLabel(nextPriority)}.`,
      payload: {
        from: current.prioridade,
        to: nextPriority,
      },
    });
  }

  return getSupportTicketDetail(config, current.id);
}

async function addSupportComment(config, ticketId, comment, actor) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const current = await getSupportTicketDetail(config, ticketId);

  if (!current) {
    return null;
  }

  await db.query(
    `
      UPDATE chamados_suporte
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [current.id]
  );

  await logSupportHistory(db, current.id, {
    evento: 'comentario_interno',
    autor: actor || 'suporte',
    descricao: comment,
    payload: null,
  });

  return getSupportTicketDetail(config, current.id);
}

function buildSupportReplyHtml(ticket, message) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Resposta ao seu chamado</h1>
      <p style="margin:0 0 16px;">Olá, ${escapeHtml(ticket.nome)}.</p>
      <p style="margin:0 0 16px;">Nossa equipe analisou o seu chamado e enviou a resposta abaixo.</p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Protocolo</strong>
        <p style="margin:0 0 14px;font-weight:700;">${escapeHtml(ticket.protocolo)}</p>
        <strong style="display:block;margin-bottom:8px;">Resposta</strong>
        <p style="margin:0;white-space:pre-line;">${escapeHtml(message)}</p>
      </div>
      <p style="margin:20px 0 0;">Atenciosamente,<br>Time LECO</p>
    </div>
  `;
}

function buildSupportReplyText(ticket, message) {
  return [
    `Olá, ${ticket.nome}.`,
    '',
    'Nossa equipe analisou o seu chamado e enviou a resposta abaixo.',
    '',
    `Protocolo: ${ticket.protocolo}`,
    '',
    'Resposta:',
    message,
    '',
    'Atenciosamente,',
    'Time LECO',
  ].join('\n');
}

async function sendSupportReplyEmail(config, ticket, message) {
  if (!config.emailConfigured) {
    return {
      status: 'nao_configurado',
      emailId: null,
      error: 'RESEND_API_KEY ausente.',
    };
  }

  const resend = getResendClient(config.resendApiKey);
  const { data, error } = await resend.emails.send({
    from: config.fromEmail,
    to: [ticket.email],
    replyTo: config.replyToEmail,
    subject: `Resposta ao chamado ${ticket.protocolo}`,
    html: buildSupportReplyHtml(ticket, message),
    text: buildSupportReplyText(ticket, message),
  });

  if (error) {
    return {
      status: 'falha',
      emailId: null,
      error: error.message || 'Falha ao enviar resposta ao usuário.',
    };
  }

  return {
    status: 'enviado',
    emailId: data?.id || null,
    error: null,
  };
}

async function addSupportReply(config, ticketId, message, actor) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const current = await getSupportTicketDetail(config, ticketId);

  if (!current) {
    return null;
  }

  const emailResult = await sendSupportReplyEmail(config, current, message);
  if (emailResult.status !== 'enviado') {
    const error = new Error(emailResult.error || 'Falha ao enviar resposta ao usuário.');
    error.code = 'EMAIL_REPLY_FAILED';
    throw error;
  }

  const nextStatus = current.status === 'concluido' ? 'concluido' : 'respondido';

  await db.query(
    `
      UPDATE chamados_suporte
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [current.id, nextStatus]
  );

  if (nextStatus !== current.status) {
    await logSupportHistory(db, current.id, {
      evento: 'status',
      autor: actor || 'suporte',
      descricao: `Status alterado para ${statusLabel(nextStatus)}.`,
      payload: {
        from: current.status,
        to: nextStatus,
      },
    });
  }

  await logSupportHistory(db, current.id, {
    evento: 'resposta',
    autor: actor || 'suporte',
    descricao: message,
    payload: {
      email_status: emailResult.status,
      email_id: emailResult.emailId,
    },
  });

  return getSupportTicketDetail(config, current.id);
}

module.exports = {
  DATABASE_PROVIDER,
  EMAIL_REGEX,
  CELULAR_REGEX,
  TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  sendJson,
  normalizeBody,
  escapeHtml,
  typeLabel,
  priorityLabel,
  statusLabel,
  normalizePriority,
  normalizeStatus,
  normalizeType,
  getSupportConfig,
  getPool,
  getResendClient,
  ensureSupportSchema,
  insertSupportTicket,
  updateSupportEmailMetadata,
  listSupportTickets,
  getSupportTicketDetail,
  updateSupportTicket,
  addSupportComment,
  addSupportReply,
};
