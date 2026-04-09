const sessionFeedback = document.getElementById('session-feedback');
const configState = document.getElementById('config-state');
const loginState = document.getElementById('login-state');
const appState = document.getElementById('app-state');
const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const filtersForm = document.getElementById('filters-form');
const clearFiltersButton = document.getElementById('clear-filters-button');
const refreshButton = document.getElementById('refresh-button');
const tableBody = document.getElementById('ticket-table-body');
const detailContainer = document.getElementById('ticket-detail');
const detailFeedback = document.getElementById('detail-feedback');
const listFeedback = document.getElementById('list-feedback');
const listSummary = document.getElementById('list-summary');
const ticketCount = document.getElementById('ticket-count');
const loggedUser = document.getElementById('logged-user');
const statusFilter = document.getElementById('filter-status');
const priorityFilter = document.getElementById('filter-priority');
const typeFilter = document.getElementById('filter-type');

const state = {
    authenticated: false,
    configured: true,
    meta: {
        statuses: [],
        priorities: [],
        types: [],
    },
    tickets: [],
    selectedTicketId: null,
    selectedTicket: null,
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
    if (!value) return '—';
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function showSessionFeedback(message, type = 'warning') {
    sessionFeedback.textContent = message;
    sessionFeedback.className = `admin-feedback ${type}`;
    sessionFeedback.classList.remove('is-hidden');
}

function hideSessionFeedback() {
    sessionFeedback.textContent = '';
    sessionFeedback.className = 'admin-feedback is-hidden';
}

function showInlineFeedback(element, message, type = 'warning') {
    element.textContent = message;
    element.className = `admin-inline-feedback ${type}`;
    element.classList.remove('is-hidden');
}

function hideInlineFeedback(element) {
    element.textContent = '';
    element.className = 'admin-inline-feedback is-hidden';
}

function showConfigState() {
    configState.classList.remove('is-hidden');
    loginState.classList.add('is-hidden');
    appState.classList.add('is-hidden');
}

function showLoginState(message, type = 'warning') {
    configState.classList.add('is-hidden');
    loginState.classList.remove('is-hidden');
    appState.classList.add('is-hidden');
    if (message) {
        showSessionFeedback(message, type);
    } else {
        hideSessionFeedback();
    }
}

function showAppState() {
    configState.classList.add('is-hidden');
    loginState.classList.add('is-hidden');
    appState.classList.remove('is-hidden');
    hideSessionFeedback();
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (response.status === 401) {
        state.authenticated = false;
        showLoginState('Sua sessão expirou. Faça login novamente.');
        throw new Error(payload.mensagem || 'Sessão expirada.');
    }

    return { response, payload };
}

function buildOptions(options, placeholder) {
    return [
        `<option value="">${escapeHtml(placeholder)}</option>`,
        ...options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`),
    ].join('');
}

function syncFilterMeta(meta) {
    if (!meta) return;

    if (Array.isArray(meta.statuses)) {
        state.meta.statuses = meta.statuses;
    }
    if (Array.isArray(meta.priorities)) {
        state.meta.priorities = meta.priorities;
    }
    if (Array.isArray(meta.types)) {
        state.meta.types = meta.types;
    }

    const currentStatus = statusFilter.value;
    const currentPriority = priorityFilter.value;
    const currentType = typeFilter.value;

    statusFilter.innerHTML = buildOptions(state.meta.statuses, 'Todos');
    priorityFilter.innerHTML = buildOptions(state.meta.priorities, 'Todas');
    typeFilter.innerHTML = buildOptions(state.meta.types, 'Todos');

    statusFilter.value = currentStatus;
    priorityFilter.value = currentPriority;
    typeFilter.value = currentType;
}

function getTicketStatusBadge(ticket) {
    return `<span class="admin-badge status-${escapeHtml(ticket.status)}">${escapeHtml(ticket.status_label)}</span>`;
}

function getPriorityBadge(ticket) {
    return `<span class="admin-badge priority-${escapeHtml(ticket.prioridade)}">${escapeHtml(ticket.prioridade_label)}</span>`;
}

function renderTicketList() {
    if (!state.tickets.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="admin-table-empty">Nenhum chamado encontrado com os filtros atuais.</td>
            </tr>
        `;
        listSummary.textContent = 'Nenhum chamado encontrado.';
        ticketCount.textContent = '0 chamados';
        return;
    }

    tableBody.innerHTML = state.tickets.map((ticket) => `
        <tr
            class="admin-ticket-row${ticket.id === state.selectedTicketId ? ' is-selected' : ''}"
            data-ticket-id="${ticket.id}"
            tabindex="0"
            role="button"
            aria-label="Abrir chamado ${escapeHtml(ticket.protocolo)}"
        >
            <td><strong>${escapeHtml(ticket.protocolo)}</strong></td>
            <td>${escapeHtml(ticket.nome)}</td>
            <td>${escapeHtml(ticket.email)}</td>
            <td>${escapeHtml(ticket.tipo_label)}</td>
            <td>${getPriorityBadge(ticket)}</td>
            <td>${getTicketStatusBadge(ticket)}</td>
            <td>${escapeHtml(formatDateTime(ticket.created_at))}</td>
        </tr>
    `).join('');

    listSummary.textContent = `${state.tickets.length} chamado(s) carregado(s), com os mais recentes primeiro.`;
    ticketCount.textContent = `${state.tickets.length} chamados`;
}

function getFilterQuery() {
    const params = new URLSearchParams();
    const search = document.getElementById('ticket-search').value.trim();
    const status = statusFilter.value;
    const prioridade = priorityFilter.value;
    const tipo = typeFilter.value;

    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (prioridade) params.set('prioridade', prioridade);
    if (tipo) params.set('tipo', tipo);

    return params.toString();
}

async function loadTickets({ preserveSelection = true } = {}) {
    hideInlineFeedback(listFeedback);
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="admin-table-empty">Carregando chamados...</td>
        </tr>
    `;

    const query = getFilterQuery();
    const url = query ? `/api/admin/suporte?${query}` : '/api/admin/suporte';

    try {
        const { response, payload } = await apiFetch(url, { method: 'GET' });

        if (!response.ok) {
            showInlineFeedback(listFeedback, payload.mensagem || 'Não foi possível carregar os chamados agora.', 'error');
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="admin-table-empty">Não foi possível carregar os chamados agora.</td>
                </tr>
            `;
            return;
        }

        syncFilterMeta(payload.meta);
        state.tickets = Array.isArray(payload.tickets) ? payload.tickets : [];

        if (!preserveSelection || !state.tickets.some((ticket) => ticket.id === state.selectedTicketId)) {
            state.selectedTicketId = state.tickets[0]?.id || null;
        }

        renderTicketList();

        if (state.selectedTicketId) {
            await loadTicketDetail(state.selectedTicketId, { silent: true });
        } else {
            renderEmptyDetail();
        }
    } catch (error) {
        console.error(error);
    }
}

function renderEmptyDetail() {
    state.selectedTicket = null;
    detailContainer.innerHTML = `
        <div class="admin-empty-detail">
            <h2>Selecione um chamado</h2>
            <p>Ao escolher um item da lista, você poderá ver todos os dados enviados, alterar o status, registrar comentários internos e responder o usuário.</p>
        </div>
    `;
}

function renderHistory(history = []) {
    if (!history.length) {
        return '<p class="admin-helper-copy">Ainda não há histórico registrado para este chamado.</p>';
    }

    return `
        <div class="admin-history-list">
            ${history.map((item) => `
                <article class="admin-history-item">
                    <div class="admin-history-topline">
                        <span class="admin-history-event">${escapeHtml(item.evento.replace(/_/g, ' '))}</span>
                        <span class="admin-history-date">${escapeHtml(formatDateTime(item.criado_em))}</span>
                    </div>
                    <span class="admin-history-author">${escapeHtml(item.autor)}</span>
                    <p>${escapeHtml(item.descricao)}</p>
                </article>
            `).join('')}
        </div>
    `;
}

function renderTicketDetail(ticket) {
    state.selectedTicket = ticket;

    detailContainer.innerHTML = `
        <div class="admin-detail-shell">
            <header class="admin-ticket-header">
                <div>
                    <h2>${escapeHtml(ticket.protocolo)}</h2>
                    <p class="admin-ticket-subtitle">Chamado aberto em ${escapeHtml(formatDateTime(ticket.created_at))}. Última atualização em ${escapeHtml(formatDateTime(ticket.updated_at))}.</p>
                </div>
                <div class="admin-ticket-meta">
                    ${getTicketStatusBadge(ticket)}
                    ${getPriorityBadge(ticket)}
                </div>
            </header>

            <section class="admin-data-card">
                <h3>Dados enviados pelo usuário</h3>
                <div class="admin-data-list">
                    <div class="admin-data-item">
                        <span>Nome</span>
                        <strong>${escapeHtml(ticket.nome)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>E-mail</span>
                        <a href="mailto:${escapeHtml(ticket.email)}">${escapeHtml(ticket.email)}</a>
                    </div>
                    <div class="admin-data-item">
                        <span>Celular</span>
                        <strong>${escapeHtml(ticket.celular || 'Não informado')}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Tipo</span>
                        <strong>${escapeHtml(ticket.tipo_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Assunto</span>
                        <strong>${escapeHtml(ticket.assunto || ticket.tipo_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Anexo</span>
                        ${ticket.anexo_url
                            ? `<a href="${escapeHtml(ticket.anexo_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ticket.anexo_nome || 'Abrir anexo')}</a>`
                            : '<strong>Nenhum anexo enviado</strong>'}
                    </div>
                </div>
                <div class="admin-description">
                    <strong>Descrição completa</strong>
                    <p>${escapeHtml(ticket.descricao)}</p>
                </div>
            </section>

            <section class="admin-ticket-grid">
                <article class="admin-actions-card">
                    <h3>Atualizar status e prioridade</h3>
                    <form id="ticket-status-form" class="admin-status-form">
                        <div class="admin-field">
                            <label for="detail-status">Status</label>
                            <select id="detail-status" name="status">
                                ${state.meta.statuses.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.status ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-priority">Prioridade</label>
                            <select id="detail-priority" name="prioridade">
                                ${state.meta.priorities.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.prioridade ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <button id="save-status-button" type="submit" class="admin-primary-button">Salvar</button>
                    </form>
                    <p class="admin-helper-copy">Use esse bloco para organizar a fila de atendimento e refletir o andamento real de cada chamado.</p>
                </article>

                <article class="admin-actions-card">
                    <h3>Comentário interno</h3>
                    <form id="internal-comment-form" class="admin-action-form">
                        <div class="admin-field">
                            <label for="internal-comment">Registro interno</label>
                            <textarea id="internal-comment" name="comment" placeholder="Adicione uma anotação para uso interno da equipe."></textarea>
                        </div>
                        <button id="comment-button" type="submit" class="admin-secondary-button">Salvar comentário</button>
                    </form>
                    <p class="admin-helper-copy">O comentário interno fica registrado no histórico do chamado e não é enviado ao usuário.</p>
                </article>
            </section>

            <section class="admin-actions-card">
                <h3>Responder usuário</h3>
                <form id="reply-form" class="admin-action-form">
                    <div class="admin-field">
                        <label for="reply-message">Resposta</label>
                        <textarea id="reply-message" name="message" placeholder="Escreva aqui a resposta que será enviada por e-mail ao usuário."></textarea>
                    </div>
                    <button id="reply-button" type="submit" class="admin-primary-button">Enviar resposta por e-mail</button>
                </form>
                <p class="admin-helper-copy">A resposta será enviada automaticamente para ${escapeHtml(ticket.email)} e ficará registrada no histórico deste chamado.</p>
            </section>

            <section class="admin-history-card">
                <h3>Histórico do chamado</h3>
                ${renderHistory(ticket.history)}
            </section>
        </div>
    `;

    attachDetailEventHandlers(ticket.id);
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
}

async function loadTicketDetail(ticketId, { silent = false } = {}) {
    if (!silent) {
        hideInlineFeedback(detailFeedback);
        detailContainer.innerHTML = `
            <div class="admin-empty-detail">
                <h2>Carregando chamado</h2>
                <p>Buscando os detalhes completos e o histórico do atendimento.</p>
            </div>
        `;
    }

    try {
        const { response, payload } = await apiFetch(`/api/admin/suporte?ticketId=${encodeURIComponent(ticketId)}`, { method: 'GET' });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível carregar este chamado agora.', 'error');
            renderEmptyDetail();
            return;
        }

        state.selectedTicketId = payload.ticket.id;
        renderTicketList();
        renderTicketDetail(payload.ticket);
    } catch (error) {
        console.error(error);
    }
}

async function handleStatusSubmit(event, ticketId) {
    event.preventDefault();
    hideInlineFeedback(detailFeedback);

    const button = document.getElementById('save-status-button');
    const status = document.getElementById('detail-status').value;
    const prioridade = document.getElementById('detail-priority').value;
    setButtonLoading(button, true, 'Salvando...', 'Salvar');

    try {
        const { response, payload } = await apiFetch('/api/admin/suporte', {
            method: 'PATCH',
            body: JSON.stringify({ ticketId, status, prioridade }),
        });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível atualizar o chamado agora.', 'error');
            return;
        }

        showInlineFeedback(detailFeedback, 'Status e prioridade atualizados com sucesso.', 'success');
        renderTicketDetail(payload.ticket);
        await loadTickets({ preserveSelection: true });
    } catch (error) {
        console.error(error);
    } finally {
        setButtonLoading(button, false, 'Salvando...', 'Salvar');
    }
}

async function handleCommentSubmit(event, ticketId) {
    event.preventDefault();
    hideInlineFeedback(detailFeedback);

    const textarea = document.getElementById('internal-comment');
    const message = textarea.value.trim();
    const button = document.getElementById('comment-button');

    if (message.length < 3) {
        showInlineFeedback(detailFeedback, 'Escreva um comentário interno com pelo menos 3 caracteres.', 'error');
        return;
    }

    setButtonLoading(button, true, 'Salvando...', 'Salvar comentário');

    try {
        const { response, payload } = await apiFetch('/api/admin/suporte', {
            method: 'POST',
            body: JSON.stringify({
                ticketId,
                action: 'add_comment',
                comment: message,
            }),
        });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível salvar o comentário agora.', 'error');
            return;
        }

        textarea.value = '';
        showInlineFeedback(detailFeedback, 'Comentário interno registrado com sucesso.', 'success');
        renderTicketDetail(payload.ticket);
        await loadTickets({ preserveSelection: true });
    } catch (error) {
        console.error(error);
    } finally {
        setButtonLoading(button, false, 'Salvando...', 'Salvar comentário');
    }
}

async function handleReplySubmit(event, ticketId) {
    event.preventDefault();
    hideInlineFeedback(detailFeedback);

    const textarea = document.getElementById('reply-message');
    const message = textarea.value.trim();
    const button = document.getElementById('reply-button');

    if (message.length < 5) {
        showInlineFeedback(detailFeedback, 'Escreva uma resposta com pelo menos 5 caracteres.', 'error');
        return;
    }

    setButtonLoading(button, true, 'Enviando...', 'Enviar resposta por e-mail');

    try {
        const { response, payload } = await apiFetch('/api/admin/suporte', {
            method: 'POST',
            body: JSON.stringify({
                ticketId,
                action: 'reply',
                message,
            }),
        });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível enviar a resposta agora.', 'error');
            return;
        }

        textarea.value = '';
        showInlineFeedback(detailFeedback, 'Resposta enviada ao usuário e registrada no histórico.', 'success');
        renderTicketDetail(payload.ticket);
        await loadTickets({ preserveSelection: true });
    } catch (error) {
        console.error(error);
    } finally {
        setButtonLoading(button, false, 'Enviando...', 'Enviar resposta por e-mail');
    }
}

function attachDetailEventHandlers(ticketId) {
    const statusForm = document.getElementById('ticket-status-form');
    const commentForm = document.getElementById('internal-comment-form');
    const replyForm = document.getElementById('reply-form');

    if (statusForm) {
        statusForm.addEventListener('submit', (event) => handleStatusSubmit(event, ticketId));
    }

    if (commentForm) {
        commentForm.addEventListener('submit', (event) => handleCommentSubmit(event, ticketId));
    }

    if (replyForm) {
        replyForm.addEventListener('submit', (event) => handleReplySubmit(event, ticketId));
    }
}

async function loadSession() {
    try {
        const { response, payload } = await apiFetch('/api/admin/session', { method: 'GET' });

        if (!response.ok) {
            showLoginState('Não foi possível verificar a sessão do painel agora.', 'error');
            return;
        }

        state.configured = payload.configured !== false;
        state.authenticated = Boolean(payload.authenticated);

        if (!state.configured) {
            showConfigState();
            return;
        }

        if (state.authenticated) {
            loggedUser.textContent = payload.username || 'Painel LECO';
            showAppState();
            await loadTickets({ preserveSelection: false });
            return;
        }

        showLoginState();
    } catch (error) {
        console.error(error);
        showLoginState('Não foi possível carregar o painel agora. Tente novamente em instantes.', 'error');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    hideSessionFeedback();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showSessionFeedback('Informe usuário e senha para continuar.', 'error');
        return;
    }

    setButtonLoading(loginButton, true, 'Entrando...', 'Entrar no painel');

    try {
        const { response, payload } = await apiFetch('/api/admin/session', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            showSessionFeedback(payload.mensagem || 'Não foi possível entrar no painel agora.', 'error');
            return;
        }

        loggedUser.textContent = payload.username || username;
        showAppState();
        await loadTickets({ preserveSelection: false });
    } catch (error) {
        console.error(error);
    } finally {
        setButtonLoading(loginButton, false, 'Entrando...', 'Entrar no painel');
    }
}

async function handleLogout() {
    hideSessionFeedback();
    logoutButton.disabled = true;

    try {
        await apiFetch('/api/admin/session', { method: 'DELETE' });
    } catch (error) {
        console.error(error);
    } finally {
        logoutButton.disabled = false;
        state.selectedTicketId = null;
        state.selectedTicket = null;
        showLoginState('Sessão encerrada com sucesso.', 'success');
    }
}

function attachTableEvents() {
    tableBody.addEventListener('click', (event) => {
        const row = event.target.closest('.admin-ticket-row');
        if (!row) return;
        const ticketId = row.getAttribute('data-ticket-id');
        if (!ticketId) return;
        loadTicketDetail(ticketId);
    });

    tableBody.addEventListener('keydown', (event) => {
        const row = event.target.closest('.admin-ticket-row');
        if (!row) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const ticketId = row.getAttribute('data-ticket-id');
        if (!ticketId) return;
        loadTicketDetail(ticketId);
    });
}

loginForm.addEventListener('submit', handleLoginSubmit);
logoutButton.addEventListener('click', handleLogout);

filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadTickets({ preserveSelection: false });
});

clearFiltersButton.addEventListener('click', async () => {
    filtersForm.reset();
    hideInlineFeedback(listFeedback);
    await loadTickets({ preserveSelection: false });
});

refreshButton.addEventListener('click', async () => {
    await loadTickets({ preserveSelection: true });
});

attachTableEvents();
loadSession();
