const { Pool, neonConfig } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const ws = require('ws');

const MAX_VAGAS = 50;
const LOCK_KEY = 42050;
const DATABASE_PROVIDER = 'neon';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const FORMULARIOS_SUPORTADOS = new Set(['inscricao', 'familias_fundadoras']);
const ESTADOS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
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
    configured: Boolean(connectionString),
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

function getResendClient(apiKey) {
  if (!apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function normalizeCelular(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on';
  }

  return false;
}

async function ensureSchema(connectionString) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool(connectionString);

      await db.query(`
        CREATE TABLE IF NOT EXISTS inscricoes (
          id BIGSERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          celular TEXT NOT NULL,
          quantidade_criancas INTEGER NOT NULL CHECK (quantidade_criancas >= 1 AND quantidade_criancas <= 20),
          cidade TEXT NOT NULL,
          estado CHAR(2) NOT NULL,
          paga_mesada BOOLEAN NOT NULL DEFAULT FALSE,
          valor_mesada TEXT,
          pretende_investir TEXT,
          celular_normalizado TEXT,
          idades_criancas TEXT,
          formulario TEXT NOT NULL DEFAULT 'inscricao',
          campanha TEXT,
          origem TEXT,
          canal TEXT,
          status_lead TEXT,
          elegivel_promocao TEXT,
          email_status TEXT NOT NULL DEFAULT 'pendente',
          notificacao_email_id TEXT,
          confirmacao_email_id TEXT,
          email_error TEXT,
          numero_inscricao INTEGER NOT NULL UNIQUE,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS celular_normalizado TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS idades_criancas TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS formulario TEXT NOT NULL DEFAULT 'inscricao';
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS campanha TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS origem TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS canal TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS status_lead TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS elegivel_promocao TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pendente';
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS notificacao_email_id TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS confirmacao_email_id TEXT;
        ALTER TABLE inscricoes ADD COLUMN IF NOT EXISTS email_error TEXT;
        ALTER TABLE inscricoes ALTER COLUMN paga_mesada SET DEFAULT FALSE;

        UPDATE inscricoes
        SET celular_normalizado = regexp_replace(celular, '\\D', '', 'g')
        WHERE celular IS NOT NULL
          AND (celular_normalizado IS NULL OR celular_normalizado = '');

        CREATE INDEX IF NOT EXISTS idx_inscricoes_email ON inscricoes (email);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_criado_em ON inscricoes (criado_em DESC);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_numero ON inscricoes (numero_inscricao);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_celular_normalizado ON inscricoes (celular_normalizado);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_formulario ON inscricoes (formulario);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_campanha ON inscricoes (campanha);
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}

async function fetchInscricoesCount(config) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const result = await db.query('SELECT COUNT(*)::int AS total FROM inscricoes');
  return result.rows[0]?.total ?? 0;
}

function getFormDefaults(formulario) {
  if (formulario === 'familias_fundadoras') {
    return {
      campanha: '2_meses_lancamento',
      origem: 'familias_fundadoras',
      canal: 'site',
      status_lead: 'lead_campanha',
      elegivel_promocao: 'pendente',
    };
  }

  return {
    campanha: '2_meses_lancamento',
    origem: 'inscricao',
    canal: 'site',
    status_lead: 'lead_campanha',
    elegivel_promocao: 'pendente',
  };
}

function validate(body) {
  const formularioRecebido = String(body.formulario || '').trim();
  const formulario = FORMULARIOS_SUPORTADOS.has(formularioRecebido)
    ? formularioRecebido
    : 'inscricao';
  const defaults = getFormDefaults(formulario);

  const data = {
    formulario,
    nome: String(body.nome || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    celular: String(body.celular || '').trim(),
    quantidade_criancas: Number(body.quantidade_criancas),
    idades_criancas: String(body.idades_criancas || '').trim(),
    cidade: String(body.cidade || '').trim(),
    estado: String(body.estado || '').trim().toUpperCase(),
    paga_mesada: String(body.paga_mesada || '').trim().toLowerCase(),
    valor_mesada: String(body.valor_mesada || '').trim(),
    pretende_investir: String(body.pretende_investir || '').trim(),
    aceite_termos: toBoolean(body.aceite_termos),
    campanha: String(body.campanha || defaults.campanha).trim() || defaults.campanha,
    origem: String(body.origem || defaults.origem).trim() || defaults.origem,
    canal: String(body.canal || defaults.canal).trim() || defaults.canal,
    status_lead: String(body.status_lead || defaults.status_lead).trim() || defaults.status_lead,
    elegivel_promocao: String(body.elegivel_promocao || defaults.elegivel_promocao).trim() || defaults.elegivel_promocao,
  };

  const errors = {};

  if (data.nome.length < 3) {
    errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
  }

  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = ['Informe um e-mail válido.'];
  }

  if (!CELULAR_REGEX.test(data.celular)) {
    errors.celular = ['Use o formato (11) 99999-9999.'];
  }

  if (!Number.isInteger(data.quantidade_criancas) || data.quantidade_criancas < 1 || data.quantidade_criancas > 20) {
    errors.quantidade_criancas = ['Informe um número inteiro entre 1 e 20.'];
  }

  if (data.cidade.length < 2) {
    errors.cidade = ['Informe uma cidade válida.'];
  }

  if (!ESTADOS.has(data.estado)) {
    errors.estado = ['Selecione um estado válido.'];
  }

  if (formulario === 'familias_fundadoras') {
    if (data.idades_criancas.length < 2) {
      errors.idades_criancas = ['Informe a idade das crianças.'];
    }

    data.paga_mesada = '';
    data.valor_mesada = '';
    data.pretende_investir = '';
  } else {
    if (!['sim', 'nao'].includes(data.paga_mesada)) {
      errors.paga_mesada = ['Selecione uma opção.'];
    }

    if (data.paga_mesada === 'sim' && !data.valor_mesada) {
      errors.valor_mesada = ['Informe o valor da mesada.'];
    }

    if (data.paga_mesada === 'nao' && !data.pretende_investir) {
      errors.pretende_investir = ['Informe quanto pretende investir em mesada.'];
    }
  }

  if (!data.aceite_termos) {
    errors.aceite_termos = ['Você deve aceitar os termos para continuar.'];
  }

  return { data, errors };
}

async function registrarInscricao(config, payload) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

    const celularNormalizado = normalizeCelular(payload.celular);
    const duplicate = await client.query(
      `
        SELECT numero_inscricao, email, celular_normalizado
        FROM inscricoes
        WHERE lower(email) = $1
           OR celular_normalizado = $2
        ORDER BY criado_em ASC
        LIMIT 1
      `,
      [payload.email, celularNormalizado]
    );

    if (duplicate.rowCount > 0) {
      await client.query('ROLLBACK');
      const duplicateLead = duplicate.rows[0];

      return {
        status: 'lead_existente',
        duplicate_by: duplicateLead.email === payload.email ? 'email' : 'celular',
        numero: duplicateLead.numero_inscricao,
      };
    }

    const countResult = await client.query('SELECT COUNT(*)::int AS total FROM inscricoes');
    const total = countResult.rows[0]?.total ?? 0;
    const numero = total + 1;

    await client.query(
      `
        INSERT INTO inscricoes (
          nome,
          email,
          celular,
          quantidade_criancas,
          cidade,
          estado,
          paga_mesada,
          valor_mesada,
          pretende_investir,
          celular_normalizado,
          idades_criancas,
          formulario,
          campanha,
          origem,
          canal,
          status_lead,
          elegivel_promocao,
          numero_inscricao
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
      `,
      [
        payload.nome,
        payload.email,
        payload.celular,
        payload.quantidade_criancas,
        payload.cidade,
        payload.estado,
        payload.paga_mesada === 'sim',
        payload.paga_mesada === 'sim' ? payload.valor_mesada : null,
        payload.paga_mesada === 'nao' ? payload.pretende_investir : null,
        celularNormalizado,
        payload.idades_criancas || null,
        payload.formulario,
        payload.campanha,
        payload.origem,
        payload.canal,
        payload.status_lead,
        payload.elegivel_promocao,
        numero,
      ]
    );

    await client.query('COMMIT');
    return { status: 'sucesso', numero };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }

    if (error && error.code === '23505') {
      return { status: 'lead_existente' };
    }

    throw error;
  } finally {
    client.release();
  }
}

async function updateEmailMetadata(config, numero, emailResult) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);

  await db.query(
    `
      UPDATE inscricoes
      SET email_status = $2,
          notificacao_email_id = $3,
          confirmacao_email_id = $4,
          email_error = $5
      WHERE numero_inscricao = $1
    `,
    [
      numero,
      emailResult.status,
      emailResult.notificationId,
      emailResult.confirmationId,
      emailResult.error ? String(emailResult.error).slice(0, 1000) : null,
    ]
  );
}

function buildInternalEmailHtml(payload, numero) {
  const titulo = payload.formulario === 'familias_fundadoras'
    ? 'Nova participação na campanha LECO'
    : 'Nova inscrição LECO';

  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">${escapeHtml(titulo)}</h1>
      <p style="margin:0 0 20px;">Uma nova inscrição chegou pelo site da LECO.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-weight:700;">Número</td><td style="padding:8px 0;">#${escapeHtml(numero)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Nome</td><td style="padding:8px 0;">${escapeHtml(payload.nome)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">E-mail</td><td style="padding:8px 0;">${escapeHtml(payload.email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Celular</td><td style="padding:8px 0;">${escapeHtml(payload.celular)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Quantidade de crianças</td><td style="padding:8px 0;">${escapeHtml(payload.quantidade_criancas)}</td></tr>
        ${payload.idades_criancas ? `<tr><td style="padding:8px 0;font-weight:700;">Idades</td><td style="padding:8px 0;">${escapeHtml(payload.idades_criancas)}</td></tr>` : ''}
        <tr><td style="padding:8px 0;font-weight:700;">Cidade / Estado</td><td style="padding:8px 0;">${escapeHtml(payload.cidade)} - ${escapeHtml(payload.estado)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Formulário</td><td style="padding:8px 0;">${escapeHtml(payload.formulario)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Campanha</td><td style="padding:8px 0;">${escapeHtml(payload.campanha || 'Não informada')}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Origem</td><td style="padding:8px 0;">${escapeHtml(payload.origem || 'site')}</td></tr>
      </table>
      ${
        payload.formulario === 'inscricao'
          ? `
            <div style="margin-top:20px;padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
              <strong style="display:block;margin-bottom:8px;">Contexto familiar</strong>
              <p style="margin:0;"><strong>Paga mesada:</strong> ${payload.paga_mesada === 'sim' ? 'Sim' : 'Não'}</p>
              ${
                payload.paga_mesada === 'sim'
                  ? `<p style="margin:8px 0 0;"><strong>Valor da mesada:</strong> ${escapeHtml(payload.valor_mesada || 'Não informado')}</p>`
                  : `<p style="margin:8px 0 0;"><strong>Pretende investir:</strong> ${escapeHtml(payload.pretende_investir || 'Não informado')}</p>`
              }
            </div>
          `
          : ''
      }
    </div>
  `;
}

function buildInternalEmailText(payload, numero) {
  const linhas = [
    payload.formulario === 'familias_fundadoras' ? 'Nova participação na campanha LECO' : 'Nova inscrição LECO',
    '',
    `Número: #${numero}`,
    `Nome: ${payload.nome}`,
    `E-mail: ${payload.email}`,
    `Celular: ${payload.celular}`,
    `Quantidade de crianças: ${payload.quantidade_criancas}`,
    `Cidade / Estado: ${payload.cidade} - ${payload.estado}`,
    `Formulário: ${payload.formulario}`,
    `Campanha: ${payload.campanha || 'Não informada'}`,
    `Origem: ${payload.origem || 'site'}`,
  ];

  if (payload.idades_criancas) {
    linhas.push(`Idades: ${payload.idades_criancas}`);
  }

  if (payload.formulario === 'inscricao') {
    linhas.push(
      `Paga mesada: ${payload.paga_mesada === 'sim' ? 'Sim' : 'Não'}`,
      payload.paga_mesada === 'sim'
        ? `Valor da mesada: ${payload.valor_mesada || 'Não informado'}`
        : `Pretende investir: ${payload.pretende_investir || 'Não informado'}`
    );
  }

  return linhas.join('\n');
}

function buildConfirmationHtml(payload, numero) {
  const titulo = payload.formulario === 'familias_fundadoras'
    ? 'Recebemos sua participação na campanha'
    : 'Recebemos sua inscrição';

  return `
    <div style="font-family:Arial,sans-serif;color:#10172a;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">${escapeHtml(titulo)}</h1>
      <p style="margin:0 0 16px;">Oi, ${escapeHtml(payload.nome)}.</p>
      <p style="margin:0 0 16px;">
        Seu cadastro foi recebido com sucesso pela LECO.
        Nossa equipe vai considerar a campanha, a ordem de validação e os critérios de elegibilidade conforme o regulamento.
      </p>
      <div style="padding:18px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;">
        <strong style="display:block;margin-bottom:8px;">Resumo do envio</strong>
        <p style="margin:0;"><strong>Número:</strong> #${escapeHtml(numero)}</p>
        <p style="margin:8px 0 0;"><strong>Quantidade de crianças:</strong> ${escapeHtml(payload.quantidade_criancas)}</p>
        ${payload.idades_criancas ? `<p style="margin:8px 0 0;"><strong>Idades:</strong> ${escapeHtml(payload.idades_criancas)}</p>` : ''}
      </div>
      <p style="margin:20px 0 0;">Obrigado,<br>Time LECO</p>
    </div>
  `;
}

function buildConfirmationText(payload, numero) {
  const linhas = [
    `Oi, ${payload.nome}.`,
    '',
    payload.formulario === 'familias_fundadoras'
      ? 'Sua participação na campanha LECO foi recebida com sucesso.'
      : 'Sua inscrição na LECO foi recebida com sucesso.',
    'Nossa equipe vai considerar a campanha, a ordem de validação e os critérios de elegibilidade conforme o regulamento.',
    '',
    `Número: #${numero}`,
    `Quantidade de crianças: ${payload.quantidade_criancas}`,
  ];

  if (payload.idades_criancas) {
    linhas.push(`Idades: ${payload.idades_criancas}`);
  }

  linhas.push('', 'Obrigado,', 'Time LECO');
  return linhas.join('\n');
}

async function sendEmails(config, payload, numero) {
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
  const subjectBase = payload.formulario === 'familias_fundadoras'
    ? `Nova participação na campanha - ${payload.nome}`
    : `Nova inscrição LECO - ${payload.nome}`;

  try {
    const { data, error } = await resend.emails.send({
      from: config.fromEmail,
      to: [config.contactEmail],
      replyTo: payload.email,
      subject: subjectBase,
      html: buildInternalEmailHtml(payload, numero),
      text: buildInternalEmailText(payload, numero),
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
      subject: payload.formulario === 'familias_fundadoras'
        ? 'Recebemos sua participação na campanha LECO'
        : 'Recebemos sua inscrição na LECO',
      html: buildConfirmationHtml(payload, numero),
      text: buildConfirmationText(payload, numero),
    });

    if (error) {
      throw new Error(error.message || 'Falha ao enviar confirmação ao participante.');
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
    if (!config.configured) {
      sendJson(response, 200, {
        total: 0,
        vagas_restantes: MAX_VAGAS,
        vagas_esgotadas: false,
        backend_configured: false,
        database_provider: config.provider,
      });
      return;
    }

    try {
      const total = await fetchInscricoesCount(config);
      sendJson(response, 200, {
        total,
        vagas_restantes: Math.max(0, MAX_VAGAS - total),
        vagas_esgotadas: false,
        backend_configured: true,
        email_configured: config.emailConfigured,
        database_provider: config.provider,
      });
      return;
    } catch (error) {
      console.error('[GET /api/inscricao]', error);
      sendJson(response, 500, {
        status: 'erro',
        mensagem: 'Não foi possível consultar a disponibilidade agora.',
        backend_configured: true,
      });
      return;
    }
  }

  if (request.method === 'POST') {
    if (!config.configured) {
      sendJson(response, 503, {
        status: 'erro',
        mensagem: 'O formulário já foi publicado, mas o DATABASE_URL oficial do Neon ainda não foi configurado na Vercel.',
      });
      return;
    }

    const { data, errors } = validate(normalizeBody(request.body));

    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, {
        status: 'validacao',
        errors,
      });
      return;
    }

    try {
      const result = await registrarInscricao(config, data);

      if (result.status === 'sucesso') {
        const emailResult = await sendEmails(config, data, result.numero);
        await updateEmailMetadata(config, result.numero, emailResult);
        sendJson(response, 200, {
          ...result,
          email_status: emailResult.status,
        });
        return;
      }

      sendJson(response, 200, result);
      return;
    } catch (error) {
      console.error('[POST /api/inscricao]', error);
      sendJson(response, 500, {
        status: 'erro',
        mensagem: 'Erro interno. Tente novamente em instantes.',
      });
      return;
    }
  }

  response.setHeader('Allow', 'GET, POST');
  sendJson(response, 405, {
    status: 'erro',
    mensagem: 'Método não permitido.',
  });
};
