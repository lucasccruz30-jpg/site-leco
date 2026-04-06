const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

const MAX_VAGAS = 50;
const LOCK_KEY = 42050;
const DATABASE_PROVIDER = 'neon';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const ESTADOS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

neonConfig.webSocketConstructor = ws;

let pool;
let schemaReady;

function sendJson(response, status, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(payload);
}

function getConfig() {
  const connectionString = process.env.DATABASE_URL;

  return {
    connectionString,
    provider: DATABASE_PROVIDER,
    configured: Boolean(connectionString),
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
          paga_mesada BOOLEAN NOT NULL,
          valor_mesada TEXT,
          pretende_investir TEXT,
          numero_inscricao INTEGER NOT NULL UNIQUE,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_inscricoes_email ON inscricoes (email);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_criado_em ON inscricoes (criado_em DESC);
        CREATE INDEX IF NOT EXISTS idx_inscricoes_numero ON inscricoes (numero_inscricao);
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

async function registrarInscricao(config, payload) {
  await ensureSchema(config.connectionString);
  const db = getPool(config.connectionString);
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

    const email = payload.email.toLowerCase();
    const duplicate = await client.query(
      'SELECT numero_inscricao FROM inscricoes WHERE email = $1 LIMIT 1',
      [email]
    );

    if (duplicate.rowCount > 0) {
      await client.query('ROLLBACK');
      return { status: 'email_duplicado' };
    }

    const countResult = await client.query('SELECT COUNT(*)::int AS total FROM inscricoes');
    const total = countResult.rows[0]?.total ?? 0;

    if (total >= MAX_VAGAS) {
      await client.query('ROLLBACK');
      return { status: 'vagas_esgotadas' };
    }

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
          numero_inscricao
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        payload.nome,
        email,
        payload.celular,
        payload.quantidade_criancas,
        payload.cidade,
        payload.estado,
        payload.paga_mesada === 'sim',
        payload.paga_mesada === 'sim' ? payload.valor_mesada : null,
        payload.paga_mesada === 'nao' ? payload.pretende_investir : null,
        numero,
      ]
    );

    await client.query('COMMIT');
    return { status: 'sucesso', numero };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failures
    }

    if (error && error.code === '23505') {
      return { status: 'email_duplicado' };
    }

    throw error;
  } finally {
    client.release();
  }
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

function validate(body) {
  const data = {
    nome: String(body.nome || '').trim(),
    email: String(body.email || '').trim(),
    celular: String(body.celular || '').trim(),
    quantidade_criancas: Number(body.quantidade_criancas),
    cidade: String(body.cidade || '').trim(),
    estado: String(body.estado || '').trim().toUpperCase(),
    paga_mesada: String(body.paga_mesada || '').trim().toLowerCase(),
    valor_mesada: String(body.valor_mesada || '').trim(),
    pretende_investir: String(body.pretende_investir || '').trim(),
    aceite_termos: Boolean(body.aceite_termos),
  };

  const errors = {};

  if (data.nome.length < 3) {
    errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
  }
  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = ['Informe um e-mail valido.'];
  }
  if (!CELULAR_REGEX.test(data.celular)) {
    errors.celular = ['Use o formato (11) 99999-9999.'];
  }
  if (!Number.isInteger(data.quantidade_criancas) || data.quantidade_criancas < 1 || data.quantidade_criancas > 20) {
    errors.quantidade_criancas = ['Informe um numero inteiro entre 1 e 20.'];
  }
  if (data.cidade.length < 2) {
    errors.cidade = ['Informe uma cidade valida.'];
  }
  if (!ESTADOS.has(data.estado)) {
    errors.estado = ['Selecione um estado valido.'];
  }
  if (!['sim', 'nao'].includes(data.paga_mesada)) {
    errors.paga_mesada = ['Selecione uma opcao.'];
  }
  if (data.paga_mesada === 'sim' && !data.valor_mesada) {
    errors.valor_mesada = ['Informe o valor da mesada.'];
  }
  if (data.paga_mesada === 'nao' && !data.pretende_investir) {
    errors.pretende_investir = ['Informe quanto pretende investir em mesada.'];
  }
  if (!data.aceite_termos) {
    errors.aceite_termos = ['Voce deve aceitar os termos para continuar.'];
  }

  return { data, errors };
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
        vagas_esgotadas: total >= MAX_VAGAS,
        backend_configured: true,
        database_provider: config.provider,
      });
      return;
    } catch (error) {
      console.error('[GET /api/inscricao]', error);
      sendJson(response, 500, {
        status: 'erro',
        mensagem: 'Nao foi possivel consultar a disponibilidade agora.',
        backend_configured: true,
      });
      return;
    }
  }

  if (request.method === 'POST') {
    if (!config.configured) {
      sendJson(response, 503, {
        status: 'erro',
        mensagem: 'O formulario ja foi publicado, mas o DATABASE_URL oficial do Neon ainda nao foi configurado na Vercel.',
      });
      return;
    }

    const { data, errors } = validate(normalizeBody(request.body));
    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, { status: 'validacao', errors });
      return;
    }

    try {
      const result = await registrarInscricao(config, data);

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
  sendJson(response, 405, { status: 'erro', mensagem: 'Metodo nao permitido.' });
};
