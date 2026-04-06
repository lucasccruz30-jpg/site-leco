const MAX_VAGAS = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELULAR_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const ESTADOS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

function sendJson(response, status, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).send(payload);
}

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    url,
    serviceRoleKey,
    configured: Boolean(url && serviceRoleKey),
  };
}

function getHeaders(serviceRoleKey, extraHeaders = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders,
  };
}

async function fetchInscricoesCount(config) {
  const requestUrl = `${config.url}/rest/v1/inscricoes?select=id&limit=1`;
  const supabaseResponse = await fetch(requestUrl, {
    headers: getHeaders(config.serviceRoleKey, { Prefer: 'count=exact' }),
  });

  if (!supabaseResponse.ok) {
    throw new Error(`Falha ao consultar inscricoes (${supabaseResponse.status})`);
  }

  const contentRange = supabaseResponse.headers.get('content-range') || '';
  const total = Number(contentRange.split('/')[1] || 0);

  return Number.isFinite(total) ? total : 0;
}

async function callRegistrarInscricao(config, payload) {
  const requestUrl = `${config.url}/rest/v1/rpc/registrar_inscricao`;
  const supabaseResponse = await fetch(requestUrl, {
    method: 'POST',
    headers: getHeaders(config.serviceRoleKey, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  const rawText = await supabaseResponse.text();
  let json = null;

  if (rawText) {
    try {
      json = JSON.parse(rawText);
    } catch {
      json = null;
    }
  }

  if (!supabaseResponse.ok) {
    throw new Error(
      (json && json.message) || `Falha ao registrar inscricao (${supabaseResponse.status})`
    );
  }

  return json;
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
        mensagem: 'O formulario ja foi publicado, mas o banco de dados ainda nao foi configurado na Vercel.',
      });
      return;
    }

    const { data, errors } = validate(normalizeBody(request.body));
    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, { status: 'validacao', errors });
      return;
    }

    try {
      const result = await callRegistrarInscricao(config, {
        p_nome: data.nome,
        p_email: data.email.toLowerCase(),
        p_celular: data.celular,
        p_quantidade_criancas: data.quantidade_criancas,
        p_cidade: data.cidade,
        p_estado: data.estado,
        p_paga_mesada: data.paga_mesada === 'sim',
        p_valor_mesada: data.paga_mesada === 'sim' ? data.valor_mesada : null,
        p_pretende_investir: data.paga_mesada === 'nao' ? data.pretende_investir : null,
      });

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
