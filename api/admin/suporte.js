const { requireAdminSession } = require('../../lib/admin-auth');
const {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  sendJson,
  normalizeBody,
  getSupportConfig,
  listSupportTickets,
  getSupportDashboardMetrics,
  getSupportTicketDetail,
  updateSupportTicket,
  addSupportComment,
  addSupportReply,
} = require('../../lib/support-core');

module.exports = async function handler(request, response) {
  const session = requireAdminSession(request, response, sendJson);
  if (!session) {
    return;
  }

  const config = getSupportConfig();

  if (!config.backendConfigured) {
    sendJson(response, 503, {
      status: 'erro',
      mensagem: 'O banco oficial do suporte ainda não está configurado.',
    });
    return;
  }

  if (request.method === 'GET') {
    try {
      const view = String(request.query.view || '').trim();
      const ticketId = String(request.query.ticketId || request.query.protocolo || '').trim();

      if (ticketId) {
        const ticket = await getSupportTicketDetail(config, ticketId);
        if (!ticket) {
          sendJson(response, 404, {
            status: 'erro',
            mensagem: 'Chamado não encontrado.',
          });
          return;
        }

        sendJson(response, 200, {
          status: 'sucesso',
          ticket,
        });
        return;
      }

      if (view === 'dashboard') {
        const dashboard = await getSupportDashboardMetrics(config, {
          from: String(request.query.from || '').trim(),
          to: String(request.query.to || '').trim(),
          prioridade: String(request.query.prioridade || '').trim(),
          tipo: String(request.query.tipo || '').trim(),
        });

        sendJson(response, 200, {
          status: 'sucesso',
          dashboard,
          meta: {
            statuses: Array.from(STATUS_LABELS.entries()).map(([value, label]) => ({ value, label })),
            priorities: Array.from(PRIORITY_LABELS.entries()).map(([value, label]) => ({ value, label })),
            types: Array.from(TYPE_LABELS.entries()).map(([value, label]) => ({ value, label })),
          },
        });
        return;
      }

      const filters = {
        status: String(request.query.status || '').trim(),
        statusGroup: String(request.query.statusGroup || '').trim(),
        prioridade: String(request.query.prioridade || '').trim(),
        tipo: String(request.query.tipo || '').trim(),
        search: String(request.query.search || '').trim(),
        from: String(request.query.from || '').trim(),
        to: String(request.query.to || '').trim(),
      };

      const tickets = await listSupportTickets(config, filters);

      sendJson(response, 200, {
        status: 'sucesso',
        tickets,
        meta: {
          statuses: Array.from(STATUS_LABELS.entries()).map(([value, label]) => ({ value, label })),
          priorities: Array.from(PRIORITY_LABELS.entries()).map(([value, label]) => ({ value, label })),
          types: Array.from(TYPE_LABELS.entries()).map(([value, label]) => ({ value, label })),
        },
      });
      return;
    } catch (error) {
      console.error('[GET /api/admin/suporte]', error);
      sendJson(response, 500, {
        status: 'erro',
        mensagem: 'Não foi possível carregar os chamados agora.',
      });
      return;
    }
  }

  if (request.method === 'PATCH') {
    try {
      const body = normalizeBody(request.body);
      const ticketId = String(body.ticketId || '').trim();

      if (!ticketId) {
        sendJson(response, 400, {
          status: 'validacao',
          mensagem: 'Informe o chamado que deve ser atualizado.',
        });
        return;
      }

      const ticket = await updateSupportTicket(
        config,
        ticketId,
        {
          status: String(body.status || '').trim(),
          prioridade: String(body.prioridade || '').trim(),
          tipo: String(body.tipo || '').trim(),
          tags: body.tags,
        },
        session.username
      );

      if (!ticket) {
        sendJson(response, 404, {
          status: 'erro',
          mensagem: 'Chamado não encontrado.',
        });
        return;
      }

      sendJson(response, 200, {
        status: 'sucesso',
        ticket,
      });
      return;
    } catch (error) {
      console.error('[PATCH /api/admin/suporte]', error);
      sendJson(response, 500, {
        status: 'erro',
        mensagem: 'Não foi possível atualizar o chamado agora.',
      });
      return;
    }
  }

  if (request.method === 'POST') {
    try {
      const body = normalizeBody(request.body);
      const ticketId = String(body.ticketId || '').trim();
      const action = String(body.action || '').trim();

      if (!ticketId) {
        sendJson(response, 400, {
          status: 'validacao',
          mensagem: 'Informe o chamado para continuar.',
        });
        return;
      }

      if (action === 'add_comment') {
        const comment = String(body.comment || '').trim();
        if (comment.length < 3) {
          sendJson(response, 400, {
            status: 'validacao',
            mensagem: 'Escreva um comentário interno com pelo menos 3 caracteres.',
          });
          return;
        }

        const ticket = await addSupportComment(config, ticketId, comment, session.username);
        if (!ticket) {
          sendJson(response, 404, {
            status: 'erro',
            mensagem: 'Chamado não encontrado.',
          });
          return;
        }

        sendJson(response, 200, {
          status: 'sucesso',
          ticket,
        });
        return;
      }

      if (action === 'reply') {
        const message = String(body.message || '').trim();
        if (message.length < 5) {
          sendJson(response, 400, {
            status: 'validacao',
            mensagem: 'Escreva uma resposta com pelo menos 5 caracteres.',
          });
          return;
        }

        const ticket = await addSupportReply(config, ticketId, message, session.username);
        if (!ticket) {
          sendJson(response, 404, {
            status: 'erro',
            mensagem: 'Chamado não encontrado.',
          });
          return;
        }

        sendJson(response, 200, {
          status: 'sucesso',
          ticket,
        });
        return;
      }

      sendJson(response, 400, {
        status: 'validacao',
        mensagem: 'Ação administrativa inválida.',
      });
    } catch (error) {
      console.error('[POST /api/admin/suporte]', error);
      sendJson(response, 500, {
        status: 'erro',
        mensagem: error.code === 'EMAIL_REPLY_FAILED'
          ? 'Não foi possível enviar a resposta por e-mail agora.'
          : 'Não foi possível concluir esta ação agora.',
      });
    }
    return;
  }

  response.setHeader('Allow', 'GET, PATCH, POST');
  sendJson(response, 405, {
    status: 'erro',
    mensagem: 'Método não permitido.',
  });
};
