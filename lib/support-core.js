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
  ['duvida', 'Dúvida'],
  ['sugestao', 'Sugestão'],
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

const AUTO_CATEGORY_RULES = [
  {
    type: 'problemas-tecnicos',
    keywords: ['erro', 'bug', 'nao funciona', 'não funciona', 'travando', 'travou', 'falha', 'app nao abre', 'app não abre', 'crash', 'carregando'],
  },
  {
    type: 'acesso-e-conta',
    keywords: ['login', 'senha', 'entrar', 'acesso', 'conta', 'cadastro', 'recuperar acesso', 'recuperar senha'],
  },
  {
    type: 'assinatura-e-planos',
    keywords: ['pagamento', 'cobranca', 'cobrança', 'plano', 'cancelar', 'cancelamento', 'assinatura', 'renovacao', 'renovação', 'cartao', 'cartão', 'fatura'],
  },
  {
    type: 'sugestao',
    keywords: ['melhorar', 'ideia', 'sugestao', 'sugestão', 'seria bom', 'gostaria'],
  },
  {
    type: 'duvida',
    keywords: ['como', 'ajuda', 'duvida', 'dúvida', 'nao sei', 'não sei', 'onde encontro'],
  },
];

const AUTO_TAG_RULES = [
  { tag: 'login', keywords: ['login'] },
  { tag: 'senha', keywords: ['senha'] },
  { tag: 'acesso', keywords: ['acesso', 'entrar', 'conta'] },
  { tag: 'pagamento', keywords: ['pagamento', 'cobranca', 'cobrança', 'fatura'] },
  { tag: 'plano', keywords: ['plano', 'assinatura'] },
  { tag: 'cancelamento', keywords: ['cancelar', 'cancelamento'] },
  { tag: 'bug', keywords: ['bug'] },
  { tag: 'erro', keywords: ['erro', 'falha'] },
  { tag: 'app', keywords: ['app', 'aplicativo'] },
  { tag: 'travamento', keywords: ['travando', 'travou'] },
  { tag: 'duvida', keywords: ['duvida', 'dúvida', 'como', 'nao sei', 'não sei'] },
  { tag: 'sugestao', keywords: ['sugestao', 'sugestão', 'ideia', 'melhorar'] },
];

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

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function countKeywordMatches(text, keywords = []) {
  return keywords.reduce((total, keyword) => {
    return total + (text.includes(normalizeSearchText(keyword)) ? 1 : 0);
  }, 0);
}

function normalizeTags(value) {
  let raw = value;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      raw = [];
    } else {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed.split(',');
      }
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const tags = [];

  raw.forEach((item) => {
    const normalized = String(item || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .slice(0, 40);

    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    tags.push(normalized);
  });

  return tags.slice(0, 12);
}

function normalizeDateFilter(value) {
  const trimmed = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function normalizeSupportFilterState(filters = {}) {
  const normalized = {
    status: String(filters.status || '').trim(),
    statusGroup: String(filters.statusGroup || '').trim(),
    prioridade: String(filters.prioridade || '').trim(),
    tipo: String(filters.tipo || '').trim(),
    search: String(filters.search || '').trim(),
    from: normalizeDateFilter(filters.from),
    to: normalizeDateFilter(filters.to),
  };

  if (!STATUS_LABELS.has(normalized.status)) {
    normalized.status = '';
  }

  if (!PRIORITY_LABELS.has(normalized.prioridade)) {
    normalized.prioridade = '';
  }

  if (!TYPE_LABELS.has(normalized.tipo)) {
    normalized.tipo = '';
  }

  if (normalized.statusGroup !== 'open') {
    normalized.statusGroup = '';
  }

  if (normalized.from && normalized.to && normalized.from > normalized.to) {
    const swappedFrom = normalized.to;
    normalized.to = normalized.from;
    normalized.from = swappedFrom;
  }

  return normalized;
}

function buildSupportFilterClauses(filters = {}, options = {}) {
  const normalized = normalizeSupportFilterState(filters);
  const alias = options.alias ? `${options.alias}.` : '';
  const includeDate = options.includeDate !== false;
  const includeSearch = options.includeSearch !== false;
  const clauses = [];
  const values = [];
  const createdAtExpression = `COALESCE(${alias}created_at, ${alias}criado_em)`;
  const createdDateExpression = `(${createdAtExpression} AT TIME ZONE 'America/Sao_Paulo')::date`;

  if (normalized.statusGroup === 'open') {
    clauses.push(`COALESCE(${alias}status, 'aberto') <> 'concluido'`);
  } else if (normalized.status) {
    values.push(normalized.status);
    clauses.push(`COALESCE(${alias}status, 'aberto') = $${values.length}`);
  }

  if (normalized.prioridade) {
    values.push(normalized.prioridade);
    clauses.push(`COALESCE(${alias}prioridade, 'media') = $${values.length}`);
  }

  if (normalized.tipo) {
    values.push(normalized.tipo);
    clauses.push(`COALESCE(${alias}tipo, ${alias}categoria, 'outros-assuntos') = $${values.length}`);
  }

  if (includeDate && normalized.from) {
    values.push(normalized.from);
    clauses.push(`${createdDateExpression} >= $${values.length}::date`);
  }

  if (includeDate && normalized.to) {
    values.push(normalized.to);
    clauses.push(`${createdDateExpression} <= $${values.length}::date`);
  }

  if (includeSearch && normalized.search) {
    values.push(`%${normalized.search}%`);
    clauses.push(`(
      ${alias}protocolo ILIKE $${values.length}
      OR ${alias}nome ILIKE $${values.length}
      OR ${alias}email ILIKE $${values.length}
    )`);
  }

  return {
    filters: normalized,
    values,
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
}

function classifySupportTicket(payload) {
  const assuntoBase = String(payload.assunto || '').trim() || typeLabel(payload.categoria);
  const text = normalizeSearchText(`${assuntoBase} ${payload.descricao || ''}`);

  const scoredCategories = AUTO_CATEGORY_RULES.map((rule) => {
    let score = countKeywordMatches(text, rule.keywords);

    if (payload.categoria === rule.type) {
      score += 1;
    }

    return {
      type: rule.type,
      score,
    };
  });

  scoredCategories.sort((a, b) => b.score - a.score);
  const categoriaAutomatica = scoredCategories[0]?.score > 0
    ? scoredCategories[0].type
    : normalizeType(payload.categoria);

  const alta = [
    'nao consigo acessar',
    'não consigo acessar',
    'nao entra',
    'não entra',
    'erro critico',
    'erro crítico',
    'travou tudo',
    'nao funciona nada',
    'não funciona nada',
    'app nao abre',
    'app não abre',
    'sem acesso',
  ];
  const media = [
    'erro',
    'bug',
    'travando',
    'travou',
    'falha',
    'nao funciona',
    'não funciona',
    'problema',
    'instabilidade',
    'lento',
    'carregando',
  ];

  let prioridadeSugerida = 'media';
  if (countKeywordMatches(text, alta) > 0) {
    prioridadeSugerida = 'alta';
  } else if (categoriaAutomatica === 'duvida' || categoriaAutomatica === 'sugestao') {
    prioridadeSugerida = 'baixa';
  } else if (countKeywordMatches(text, media) > 0) {
    prioridadeSugerida = 'media';
  }

  const tagSet = new Set();
  AUTO_TAG_RULES.forEach((rule) => {
    if (countKeywordMatches(text, rule.keywords) > 0) {
      tagSet.add(rule.tag);
    }
  });

  if (categoriaAutomatica === 'problemas-tecnicos') tagSet.add('app');
  if (categoriaAutomatica === 'acesso-e-conta') tagSet.add('acesso');
  if (categoriaAutomatica === 'assinatura-e-planos') tagSet.add('plano');
  if (categoriaAutomatica === 'duvida') tagSet.add('duvida');
  if (categoriaAutomatica === 'sugestao') tagSet.add('sugestao');

  const tagsAutomaticas = normalizeTags(Array.from(tagSet));

  return {
    categoriaAutomatica,
    prioridadeSugerida,
    tagsAutomaticas,
  };
}

function getSupportConfig() {
  const connectionString = process.env.DATABASE_URL;
  const resendApiKey = process.env.RESEND_API_KEY || '';
  const supportEmail = process.env.LECO_SUPPORT_EMAIL || 'suporte@lecoapp.com.br';
  const alertEmails = String(process.env.LECO_SUPPORT_ALERT_EMAILS || supportEmail)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const fromEmail = process.env.LECO_SUPPORT_MAIL_FROM || `LECO Suporte <${supportEmail}>`;
  const replyToEmail = process.env.LECO_SUPPORT_REPLY_TO || supportEmail;
  const adminPanelUrl = process.env.LECO_SUPPORT_ADMIN_URL || 'https://lecoapp.com.br/admin/suporte/';

  return {
    connectionString,
    resendApiKey,
    supportEmail,
    alertEmails,
    fromEmail,
    replyToEmail,
    adminPanelUrl,
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

async function sendEmailWithRetry(resend, payload, attempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data, error } = await resend.emails.send(payload);

      if (error) {
        throw new Error(error.message || 'Falha ao enviar e-mail.');
      }

      return {
        status: 'enviado',
        id: data?.id || null,
        attempts: attempt,
        error: null,
      };
    } catch (error) {
      lastError = error;
      console.error(`[support-email] tentativa ${attempt} falhou`, {
        subject: payload.subject,
        to: payload.to,
        message: error.message,
      });

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  return {
    status: 'falha',
    id: null,
    attempts,
    error: lastError?.message || 'Falha ao enviar e-mail.',
  };
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
          categoria_automatica TEXT,
          tipo TEXT,
          prioridade TEXT,
          prioridade_sugerida TEXT,
          tags_automaticas JSONB,
          tags JSONB,
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
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS categoria_automatica TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS prioridade_sugerida TEXT;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS tags_automaticas JSONB;
        ALTER TABLE chamados_suporte ADD COLUMN IF NOT EXISTS tags JSONB;
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
            categoria_automatica = COALESCE(NULLIF(categoria_automatica, ''), tipo, categoria, 'outros-assuntos'),
            prioridade = COALESCE(NULLIF(prioridade, ''), 'media'),
            prioridade_sugerida = COALESCE(NULLIF(prioridade_sugerida, ''), prioridade, 'media'),
            tags_automaticas = COALESCE(tags_automaticas, '[]'::jsonb),
            tags = COALESCE(tags, tags_automaticas, '[]'::jsonb),
            assunto = COALESCE(NULLIF(assunto, ''), CASE
              WHEN categoria = 'problemas-tecnicos' THEN 'Problemas técnicos'
              WHEN categoria = 'acesso-e-conta' THEN 'Acesso e conta'
              WHEN categoria = 'assinatura-e-planos' THEN 'Assinatura e planos'
              WHEN categoria = 'duvida' THEN 'Dúvida'
              WHEN categoria = 'sugestao' THEN 'Sugestão'
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

  const categoria = normalizeType(payload.categoria);
  const assunto = String(payload.assunto || '').trim() || typeLabel(categoria);
  const classificacao = classifySupportTicket({
    categoria,
    assunto,
    descricao: payload.descricao,
  });
  const tipo = normalizeType(classificacao.categoriaAutomatica || categoria);
  const prioridade = normalizePriority(classificacao.prioridadeSugerida || payload.prioridade);
  const tagsAutomaticas = normalizeTags(classificacao.tagsAutomaticas);
  const tags = normalizeTags(payload.tags || tagsAutomaticas);

  const result = await db.query(
    `
      INSERT INTO chamados_suporte (
        nome,
        email,
        celular,
        categoria,
        categoria_automatica,
        tipo,
        prioridade,
        prioridade_sugerida,
        tags_automaticas,
        tags,
        assunto,
        descricao,
        status,
        aceite_termos,
        origem,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,NOW(),NOW())
      RETURNING id, created_at, updated_at
    `,
    [
      payload.nome,
      payload.email,
      payload.celular || null,
      categoria,
      tipo,
      tipo,
      prioridade,
      prioridade,
      JSON.stringify(tagsAutomaticas),
      JSON.stringify(tags),
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
      categoria_original: categoria,
      categoria_automatica: tipo,
      prioridade_sugerida: prioridade,
      tags_automaticas: tagsAutomaticas,
      tags_finais: tags,
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
    categoria_automatica: tipo,
    prioridade_sugerida: prioridade,
    tags_automaticas: tagsAutomaticas,
    tags,
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

function buildSupportInternalEmailHtml(payload, ticket) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Novo chamado de suporte LECO</h1>
      <p style="margin:0 0 20px;">Um novo chamado foi recebido pelo portal de suporte do LECO.</p>
      <div style="margin:0 0 20px;padding:16px 18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:6px;">Protocolo</strong>
        <span>${escapeHtml(ticket.protocolo)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-weight:700;">Nome</td><td style="padding:8px 0;">${escapeHtml(payload.nome)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">E-mail</td><td style="padding:8px 0;">${escapeHtml(payload.email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Telefone</td><td style="padding:8px 0;">${escapeHtml(payload.celular || 'Não informado')}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Tipo</td><td style="padding:8px 0;">${escapeHtml(typeLabel(ticket.tipo))}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Prioridade</td><td style="padding:8px 0;">${escapeHtml(priorityLabel(ticket.prioridade))}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Categoria automática</td><td style="padding:8px 0;">${escapeHtml(typeLabel(ticket.categoria_automatica || ticket.tipo))}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Prioridade sugerida</td><td style="padding:8px 0;">${escapeHtml(priorityLabel(ticket.prioridade_sugerida || ticket.prioridade))}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Tags</td><td style="padding:8px 0;">${escapeHtml(normalizeTags(ticket.tags || ticket.tags_automaticas).join(', ') || 'Sem tags')}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Assunto</td><td style="padding:8px 0;">${escapeHtml(ticket.assunto)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Data</td><td style="padding:8px 0;">${escapeHtml(new Date(ticket.created_at || Date.now()).toLocaleString('pt-BR'))}</td></tr>
      </table>
      <div style="margin-top:20px;padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Descrição</strong>
        <p style="margin:0;white-space:pre-line;">${escapeHtml(payload.descricao)}</p>
      </div>
    </div>
  `;
}

function buildSupportInternalEmailText(payload, ticket) {
  return [
    'Novo chamado de suporte LECO',
    '',
    `Protocolo: ${ticket.protocolo}`,
    `Nome: ${payload.nome}`,
    `Email: ${payload.email}`,
    `Telefone: ${payload.celular || 'Não informado'}`,
    `Tipo: ${typeLabel(ticket.tipo)}`,
    `Prioridade: ${priorityLabel(ticket.prioridade)}`,
    `Categoria automática: ${typeLabel(ticket.categoria_automatica || ticket.tipo)}`,
    `Prioridade sugerida: ${priorityLabel(ticket.prioridade_sugerida || ticket.prioridade)}`,
    `Tags: ${normalizeTags(ticket.tags || ticket.tags_automaticas).join(', ') || 'Sem tags'}`,
    `Assunto: ${ticket.assunto}`,
    `Data: ${new Date(ticket.created_at || Date.now()).toLocaleString('pt-BR')}`,
    '',
    'Descrição:',
    payload.descricao,
  ].join('\n');
}

function buildSupportAlertHtml(ticket, config) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Novo chamado foi aberto</h1>
      <p style="margin:0 0 18px;">Um novo chamado de suporte acabou de entrar no LECO.</p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <p style="margin:0 0 8px;"><strong>Protocolo:</strong> ${escapeHtml(ticket.protocolo)}</p>
        <p style="margin:0 0 8px;"><strong>Tipo:</strong> ${escapeHtml(typeLabel(ticket.tipo))}</p>
        <p style="margin:0;"><strong>Prioridade:</strong> ${escapeHtml(priorityLabel(ticket.prioridade))}</p>
      </div>
      <p style="margin:18px 0 0;">Acesse o painel interno para acompanhar o atendimento.</p>
      <p style="margin:10px 0 0;"><a href="${escapeHtml(config.adminPanelUrl)}" style="color:#1e5eff;font-weight:700;text-decoration:none;">Abrir painel de suporte</a></p>
    </div>
  `;
}

function buildSupportAlertText(ticket, config) {
  return [
    'Novo chamado foi aberto.',
    '',
    `Protocolo: ${ticket.protocolo}`,
    `Tipo: ${typeLabel(ticket.tipo)}`,
    `Prioridade: ${priorityLabel(ticket.prioridade)}`,
    '',
    `Painel: ${config.adminPanelUrl}`,
  ].join('\n');
}

function buildSupportConfirmationHtml(payload, ticket) {
  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">Recebemos seu chamado</h1>
      <p style="margin:0 0 16px;">Olá, ${escapeHtml(payload.nome)}.</p>
      <p style="margin:0 0 16px;">Seu chamado foi recebido com sucesso.</p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Protocolo</strong>
        <p style="margin:0;font-size:18px;font-weight:700;">${escapeHtml(ticket.protocolo)}</p>
      </div>
      <p style="margin:20px 0 0;">Nossa equipe irá retornar em breve.</p>
      <p style="margin:20px 0 0;">Atenciosamente,<br>Time LECO</p>
    </div>
  `;
}

function buildSupportConfirmationText(payload, ticket) {
  return [
    `Olá, ${payload.nome}.`,
    '',
    'Seu chamado foi recebido com sucesso.',
    '',
    `Protocolo: ${ticket.protocolo}`,
    '',
    'Nossa equipe irá retornar em breve.',
    '',
    'Atenciosamente,',
    'Time LECO',
  ].join('\n');
}

async function sendSupportCreationEmails(config, payload, ticket) {
  if (!config.emailConfigured) {
    return {
      status: 'nao_configurado',
      notificationId: null,
      alertId: null,
      confirmationId: null,
      error: 'RESEND_API_KEY ausente.',
    };
  }

  const resend = getResendClient(config.resendApiKey);
  const detailedSubject = `[LECO SUPORTE] [${priorityLabel(ticket.prioridade).toUpperCase()}] [${typeLabel(ticket.tipo).toUpperCase()}] ${ticket.assunto}`;
  const alertRecipients = config.alertEmails.length ? config.alertEmails : [config.supportEmail];

  const detailedResult = await sendEmailWithRetry(resend, {
    from: config.fromEmail,
    to: [config.supportEmail],
    replyTo: payload.email,
    subject: detailedSubject,
    html: buildSupportInternalEmailHtml(payload, ticket),
    text: buildSupportInternalEmailText(payload, ticket),
  });

  const alertResult = await sendEmailWithRetry(resend, {
    from: config.fromEmail,
    to: alertRecipients,
    replyTo: payload.email,
    subject: '🚨 Novo chamado recebido - LECO',
    html: buildSupportAlertHtml(ticket, config),
    text: buildSupportAlertText(ticket, config),
  });

  const confirmationResult = await sendEmailWithRetry(resend, {
    from: config.fromEmail,
    to: [payload.email],
    replyTo: config.replyToEmail,
    subject: 'Recebemos seu chamado - LECO',
    html: buildSupportConfirmationHtml(payload, ticket),
    text: buildSupportConfirmationText(payload, ticket),
  });

  const failures = [];

  if (detailedResult.status !== 'enviado') {
    failures.push(`suporte: ${detailedResult.error}`);
  }
  if (alertResult.status !== 'enviado') {
    failures.push(`alerta: ${alertResult.error}`);
  }
  if (confirmationResult.status !== 'enviado') {
    failures.push(`confirmacao: ${confirmationResult.error}`);
  }

  const sentCount = [detailedResult, alertResult, confirmationResult].filter((item) => item.status === 'enviado').length;

  return {
    status: failures.length === 0 ? 'enviado' : (sentCount > 0 ? 'parcial' : 'falha'),
    notificationId: detailedResult.id,
    alertId: alertResult.id,
    confirmationId: confirmationResult.id,
    error: failures.length ? failures.join(' | ') : null,
  };
}

function mapTicketRow(row) {
  const tipo = row.tipo || row.categoria || 'outros-assuntos';
  const categoriaAutomatica = row.categoria_automatica || tipo;
  const prioridade = row.prioridade || 'media';
  const prioridadeSugerida = row.prioridade_sugerida || prioridade;
  const status = row.status || 'aberto';
  const tagsAutomaticas = normalizeTags(row.tags_automaticas);
  const tags = normalizeTags(row.tags || tagsAutomaticas);

  return {
    id: row.id,
    protocolo: row.protocolo,
    nome: row.nome,
    email: row.email,
    celular: row.celular,
    categoria: row.categoria || tipo,
    categoria_label: typeLabel(row.categoria || tipo),
    categoria_automatica: categoriaAutomatica,
    categoria_automatica_label: typeLabel(categoriaAutomatica),
    tipo,
    tipo_label: typeLabel(tipo),
    prioridade,
    prioridade_label: priorityLabel(prioridade),
    prioridade_sugerida: prioridadeSugerida,
    prioridade_sugerida_label: priorityLabel(prioridadeSugerida),
    tags_automaticas: tagsAutomaticas,
    tags,
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
  const filterState = buildSupportFilterClauses(filters, { includeDate: true, includeSearch: true });
  const result = await db.query(
    `
      SELECT
        id,
        protocolo,
        nome,
        email,
        celular,
        categoria,
        categoria_automatica,
        tipo,
        prioridade,
        prioridade_sugerida,
        tags_automaticas,
        tags,
        assunto,
        descricao,
        status,
        anexo_nome,
        anexo_url,
        COALESCE(created_at, criado_em) AS created_at,
        COALESCE(updated_at, created_at, criado_em) AS updated_at
      FROM chamados_suporte
      ${filterState.where}
      ORDER BY COALESCE(created_at, criado_em) DESC
      LIMIT 250
    `,
    filterState.values
  );

  return result.rows.map(mapTicketRow);
}

async function getSupportDashboardMetrics(config, filters = {}) {
  await ensureSupportSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const selected = buildSupportFilterClauses(filters, { alias: 'c', includeDate: true, includeSearch: false });
  const rolling = buildSupportFilterClauses(filters, { alias: 'c', includeDate: false, includeSearch: false });
  const currentDateExpression = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;

  const [
    rollingSummaryResult,
    selectedSummaryResult,
    timingResult,
    volumeSeriesResult,
    categoryResult,
    priorityResult,
  ] = await Promise.all([
    db.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE (COALESCE(c.created_at, c.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date = ${currentDateExpression}
          )::int AS total_dia,
          COUNT(*) FILTER (
            WHERE (COALESCE(c.created_at, c.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date >= (${currentDateExpression} - 6)
          )::int AS total_semana,
          COUNT(*) FILTER (
            WHERE (COALESCE(c.created_at, c.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date >= (${currentDateExpression} - 29)
          )::int AS total_mes
        FROM chamados_suporte c
        ${rolling.where}
      `,
      rolling.values
    ),
    db.query(
      `
        SELECT
          COUNT(*)::int AS total_periodo,
          COUNT(*) FILTER (WHERE COALESCE(c.status, 'aberto') <> 'concluido')::int AS abertos_atuais,
          COUNT(*) FILTER (WHERE COALESCE(c.status, 'aberto') = 'concluido')::int AS concluidos,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE COALESCE(c.status, 'aberto') = 'concluido') / NULLIF(COUNT(*), 0),
            1
          ) AS taxa_conclusao
        FROM chamados_suporte c
        ${selected.where}
      `,
      selected.values
    ),
    db.query(
      `
        WITH chamados_filtrados AS (
          SELECT
            c.id,
            COALESCE(c.created_at, c.criado_em) AS created_at,
            COALESCE(c.updated_at, c.created_at, c.criado_em) AS updated_at,
            COALESCE(c.status, 'aberto') AS status
          FROM chamados_suporte c
          ${selected.where}
        ),
        primeira_resposta AS (
          SELECT
            h.chamado_id,
            MIN(h.criado_em) AS first_response_at
          FROM chamados_suporte_historico h
          INNER JOIN chamados_filtrados cf ON cf.id = h.chamado_id
          WHERE h.evento = 'resposta'
          GROUP BY h.chamado_id
        ),
        primeira_conclusao AS (
          SELECT
            h.chamado_id,
            MIN(h.criado_em) AS first_resolution_at
          FROM chamados_suporte_historico h
          INNER JOIN chamados_filtrados cf ON cf.id = h.chamado_id
          WHERE h.evento = 'status'
            AND COALESCE(h.payload->>'to', '') = 'concluido'
          GROUP BY h.chamado_id
        )
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (pr.first_response_at - cf.created_at)) / 60.0), 1) AS resposta_media_minutos,
          ROUND(
            AVG(
              EXTRACT(
                EPOCH FROM (
                  COALESCE(pc.first_resolution_at, CASE WHEN cf.status = 'concluido' THEN cf.updated_at END) - cf.created_at
                )
              ) / 60.0
            ),
            1
          ) AS resolucao_media_minutos
        FROM chamados_filtrados cf
        LEFT JOIN primeira_resposta pr ON pr.chamado_id = cf.id
        LEFT JOIN primeira_conclusao pc ON pc.chamado_id = cf.id
      `,
      selected.values
    ),
    db.query(
      `
        SELECT
          TO_CHAR((COALESCE(c.created_at, c.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia,
          COUNT(*)::int AS total
        FROM chamados_suporte c
        ${selected.where}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      selected.values
    ),
    db.query(
      `
        SELECT
          COALESCE(c.tipo, c.categoria, 'outros-assuntos') AS tipo,
          COUNT(*)::int AS total
        FROM chamados_suporte c
        ${selected.where}
        GROUP BY 1
        ORDER BY total DESC, tipo ASC
      `,
      selected.values
    ),
    db.query(
      `
        SELECT
          COALESCE(c.prioridade, 'media') AS prioridade,
          COUNT(*)::int AS total
        FROM chamados_suporte c
        ${selected.where}
        GROUP BY 1
        ORDER BY total DESC, prioridade ASC
      `,
      selected.values
    ),
  ]);

  const rollingSummary = rollingSummaryResult.rows[0] || {};
  const selectedSummary = selectedSummaryResult.rows[0] || {};
  const timingSummary = timingResult.rows[0] || {};
  const categoryBreakdown = categoryResult.rows.map((row) => ({
    value: row.tipo,
    label: typeLabel(row.tipo),
    total: Number(row.total) || 0,
  }));
  const priorityBreakdown = priorityResult.rows.map((row) => ({
    value: row.prioridade,
    label: priorityLabel(row.prioridade),
    total: Number(row.total) || 0,
  }));

  const metrics = {
    totals: {
      day: Number(rollingSummary.total_dia) || 0,
      week: Number(rollingSummary.total_semana) || 0,
      month: Number(rollingSummary.total_mes) || 0,
      period: Number(selectedSummary.total_periodo) || 0,
      open: Number(selectedSummary.abertos_atuais) || 0,
      completed: Number(selectedSummary.concluidos) || 0,
      completionRate: Number(selectedSummary.taxa_conclusao) || 0,
      averageFirstResponseMinutes: Number(timingSummary.resposta_media_minutos) || 0,
      averageResolutionMinutes: Number(timingSummary.resolucao_media_minutos) || 0,
    },
    volumeSeries: volumeSeriesResult.rows.map((row) => ({
      date: row.dia,
      total: Number(row.total) || 0,
    })),
    categories: categoryBreakdown,
    priorities: priorityBreakdown,
    alerts: [],
  };

  const technicalCount = categoryBreakdown.find((item) => item.value === 'problemas-tecnicos')?.total || 0;
  const periodTotal = metrics.totals.period;

  if (metrics.totals.open >= 10) {
    metrics.alerts.push({
      id: 'open-backlog',
      severity: 'warning',
      title: 'Fila de chamados em aberto acima do ideal',
      description: `Existem ${metrics.totals.open} chamados ainda pendentes no filtro atual.`,
      drilldown: {
        statusGroup: 'open',
      },
    });
  }

  if (technicalCount >= 5 && periodTotal > 0 && technicalCount / periodTotal >= 0.4) {
    metrics.alerts.push({
      id: 'technical-spike',
      severity: 'warning',
      title: 'Chamados técnicos em alta no período',
      description: `${technicalCount} chamados técnicos foram registrados no período filtrado.`,
      drilldown: {
        tipo: 'problemas-tecnicos',
      },
    });
  }

  if (metrics.totals.averageFirstResponseMinutes >= 720) {
    metrics.alerts.push({
      id: 'response-delay',
      severity: 'warning',
      title: 'Tempo médio de primeira resposta elevado',
      description: 'O tempo médio de resposta ultrapassou 12 horas no filtro atual.',
      drilldown: {
        statusGroup: 'open',
      },
    });
  }

  return {
    filters: selected.filters,
    metrics,
  };
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
        categoria_automatica,
        tipo,
        prioridade,
        prioridade_sugerida,
        tags_automaticas,
        tags,
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
  const nextType = changes.tipo ? normalizeType(changes.tipo) : current.tipo;
  const nextTags = changes.tags !== undefined ? normalizeTags(changes.tags) : current.tags;

  await db.query(
    `
      UPDATE chamados_suporte
      SET status = $2,
          prioridade = $3,
          tipo = $4,
          tags = $5::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    [current.id, nextStatus, nextPriority, nextType, JSON.stringify(nextTags)]
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

  if (nextType !== current.tipo) {
    await logSupportHistory(db, current.id, {
      evento: 'classificacao_final',
      autor: actor || 'suporte',
      descricao: `Categoria final alterada para ${typeLabel(nextType)}.`,
      payload: {
        from: current.tipo,
        to: nextType,
        categoria_automatica: current.categoria_automatica,
      },
    });
  }

  if (JSON.stringify(nextTags) !== JSON.stringify(current.tags || [])) {
    await logSupportHistory(db, current.id, {
      evento: 'tags',
      autor: actor || 'suporte',
      descricao: `Tags finais atualizadas: ${nextTags.length ? nextTags.join(', ') : 'sem tags'}.`,
      payload: {
        from: current.tags || [],
        to: nextTags,
        tags_automaticas: current.tags_automaticas || [],
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
  normalizeTags,
  classifySupportTicket,
  getSupportConfig,
  getPool,
  getResendClient,
  sendEmailWithRetry,
  ensureSupportSchema,
  insertSupportTicket,
  sendSupportCreationEmails,
  updateSupportEmailMetadata,
  listSupportTickets,
  getSupportDashboardMetrics,
  getSupportTicketDetail,
  updateSupportTicket,
  addSupportComment,
  addSupportReply,
};
