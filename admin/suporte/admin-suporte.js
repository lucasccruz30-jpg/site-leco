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
const closedTableBody = document.getElementById('closed-ticket-table-body');
const detailContainer = document.getElementById('ticket-detail');
const detailFeedback = document.getElementById('detail-feedback');
const listFeedback = document.getElementById('list-feedback');
const closedListFeedback = document.getElementById('closed-list-feedback');
const listSummary = document.getElementById('list-summary');
const closedListSummary = document.getElementById('closed-list-summary');
const ticketCount = document.getElementById('ticket-count');
const loggedUser = document.getElementById('logged-user');
const statusFilter = document.getElementById('filter-status');
const priorityFilter = document.getElementById('filter-priority');
const typeFilter = document.getElementById('filter-type');

const dashboardFiltersForm = document.getElementById('dashboard-filters-form');
const dashboardPeriodFilter = document.getElementById('dashboard-period');
const dashboardFromFilter = document.getElementById('dashboard-from');
const dashboardToFilter = document.getElementById('dashboard-to');
const dashboardTypeFilter = document.getElementById('dashboard-type');
const dashboardPriorityFilter = document.getElementById('dashboard-priority');
const dashboardClearFiltersButton = document.getElementById('dashboard-clear-filters-button');
const dashboardFeedback = document.getElementById('dashboard-feedback');
const dashboardAlerts = document.getElementById('dashboard-alerts');
const dashboardKpis = document.getElementById('dashboard-kpis');
const dashboardVolumeChart = document.getElementById('dashboard-volume-chart');
const dashboardCategoryChart = document.getElementById('dashboard-category-chart');
const dashboardPriorityChart = document.getElementById('dashboard-priority-chart');
const dashboardPeriodLabel = document.getElementById('dashboard-period-label');
const dashboardGeneratedAt = document.getElementById('dashboard-generated-at');
const volumeDrilldownButton = document.getElementById('volume-drilldown-button');
const listCard = document.querySelector('.admin-list-card');
const closedListCard = document.querySelector('.admin-closed-list-card');
const adminMainGrid = document.getElementById('admin-main-grid');

const state = {
    authenticated: false,
    configured: true,
    meta: {
        statuses: [],
        priorities: [],
        types: [],
    },
    tickets: [],
    closedTickets: [],
    selectedTicketId: null,
    selectedTicket: null,
    selectedTicketGroup: 'active',
    detailOpen: false,
    listDrilldown: null,
    dashboard: {
        filters: {
            period: '30d',
            from: '',
            to: '',
            tipo: '',
            prioridade: '',
        },
        data: null,
    },
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

function formatDateLabel(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
    }).format(date);
}

function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function formatPercent(value) {
    return `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: value % 1 ? 1 : 0,
        maximumFractionDigits: 1,
    }).format(Number(value) || 0)}%`;
}

function formatMinutes(value) {
    const minutes = Number(value) || 0;
    if (!minutes) return '—';

    if (minutes < 60) {
        return `${Math.round(minutes)} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);

    if (hours < 24) {
        return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (!remainingHours) {
        return `${days} dia${days > 1 ? 's' : ''}`;
    }

    return `${days}d ${remainingHours}h`;
}

function toDateInputValue(date) {
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 10);
}

function getPresetRange(period) {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end);

    if (period === '7d') {
        start.setDate(start.getDate() - 6);
    } else {
        start.setDate(start.getDate() - 29);
    }

    return {
        from: toDateInputValue(start),
        to: toDateInputValue(end),
    };
}

function getRangeLabel(filters) {
    if (filters.period === '7d') return 'Últimos 7 dias';
    if (filters.period === '30d') return 'Últimos 30 dias';
    if (filters.from && filters.to) {
        return `${formatDateLabel(filters.from)} até ${formatDateLabel(filters.to)}`;
    }
    return 'Período personalizado';
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
    setDetailMode(false);
    configState.classList.remove('is-hidden');
    loginState.classList.add('is-hidden');
    appState.classList.add('is-hidden');
}

function showLoginState(message, type = 'warning') {
    setDetailMode(false);
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

function setDetailMode(isOpen) {
    state.detailOpen = Boolean(isOpen);
    if (adminMainGrid) {
        adminMainGrid.classList.toggle('has-ticket-open', state.detailOpen);
    }
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

function syncDashboardRangeInputs() {
    const isCustom = dashboardPeriodFilter.value === 'custom';

    if (!isCustom) {
        const range = getPresetRange(dashboardPeriodFilter.value);
        dashboardFromFilter.value = range.from;
        dashboardToFilter.value = range.to;
    }

    dashboardFromFilter.disabled = !isCustom;
    dashboardToFilter.disabled = !isCustom;
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
    const currentDashboardPriority = dashboardPriorityFilter.value;
    const currentDashboardType = dashboardTypeFilter.value;

    statusFilter.innerHTML = buildOptions(state.meta.statuses, 'Todos');
    priorityFilter.innerHTML = buildOptions(state.meta.priorities, 'Todas');
    typeFilter.innerHTML = buildOptions(state.meta.types, 'Todos');
    dashboardPriorityFilter.innerHTML = buildOptions(state.meta.priorities, 'Todas');
    dashboardTypeFilter.innerHTML = buildOptions(state.meta.types, 'Todas');

    statusFilter.value = currentStatus;
    priorityFilter.value = currentPriority;
    typeFilter.value = currentType;
    dashboardPriorityFilter.value = currentDashboardPriority || state.dashboard.filters.prioridade || '';
    dashboardTypeFilter.value = currentDashboardType || state.dashboard.filters.tipo || '';
}

function getTicketStatusBadge(ticket) {
    return `<span class="admin-badge status-${escapeHtml(ticket.status)}">${escapeHtml(ticket.status_label)}</span>`;
}

function getPriorityBadge(ticket) {
    return `<span class="admin-badge priority-${escapeHtml(ticket.prioridade)}">${escapeHtml(ticket.prioridade_label)}</span>`;
}

function renderTagList(tags, emptyLabel = 'Sem tags') {
    if (!Array.isArray(tags) || !tags.length) {
        return `<span class="admin-tag-empty">${escapeHtml(emptyLabel)}</span>`;
    }

    return `
        <div class="admin-tag-list">
            ${tags.map((tag) => `<span class="admin-tag-pill">${escapeHtml(tag)}</span>`).join('')}
        </div>
    `;
}

function getListQueryOverrides(overrides = {}) {
    return {
        from: overrides.from ?? state.listDrilldown?.from ?? '',
        to: overrides.to ?? state.listDrilldown?.to ?? '',
        statusGroup: overrides.statusGroup ?? state.listDrilldown?.statusGroup ?? '',
        status: overrides.status ?? '',
        prioridade: overrides.prioridade ?? '',
        tipo: overrides.tipo ?? '',
        label: overrides.label ?? state.listDrilldown?.label ?? '',
    };
}

function getCurrentTicketFilters(overrides = {}) {
    const context = getListQueryOverrides(overrides);

    return {
        search: document.getElementById('ticket-search').value.trim(),
        status: statusFilter.value || context.status,
        prioridade: priorityFilter.value || context.prioridade,
        tipo: typeFilter.value || context.tipo,
        from: context.from,
        to: context.to,
        statusGroup: context.statusGroup,
    };
}

function buildTicketQuery(filters = {}) {
    const params = new URLSearchParams();

    if (filters.search) params.set('search', filters.search);
    if (filters.status) {
        params.set('status', filters.status);
    } else if (filters.statusGroup) {
        params.set('statusGroup', filters.statusGroup);
    }
    if (filters.prioridade) params.set('prioridade', filters.prioridade);
    if (filters.tipo) params.set('tipo', filters.tipo);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    return params.toString();
}

function buildListSummary(count, emptyText, defaultText, drilldownLabel) {
    if (!count) {
        return emptyText;
    }

    if (drilldownLabel) {
        return `${count} chamado(s) carregado(s) para ${drilldownLabel.toLowerCase()}.`;
    }

    return defaultText.replace('{count}', String(count));
}

function renderTicketRows(tickets, group) {
    return tickets.map((ticket) => `
        <tr
            class="admin-ticket-row${ticket.id === state.selectedTicketId && state.selectedTicketGroup === group ? ' is-selected' : ''}"
            data-ticket-id="${ticket.id}"
            data-ticket-group="${group}"
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
}

function renderTicketList() {
    tableBody.innerHTML = state.tickets.length
        ? renderTicketRows(state.tickets, 'active')
        : `
            <tr>
                <td colspan="7" class="admin-table-empty">Nenhum chamado ativo encontrado com os filtros atuais.</td>
            </tr>
        `;

    closedTableBody.innerHTML = state.closedTickets.length
        ? renderTicketRows(state.closedTickets, 'closed')
        : `
            <tr>
                <td colspan="7" class="admin-table-empty">Nenhum chamado fechado encontrado com os filtros atuais.</td>
            </tr>
        `;

    listSummary.textContent = buildListSummary(
        state.tickets.length,
        state.listDrilldown?.label
            ? `Nenhum chamado ativo encontrado para ${state.listDrilldown.label.toLowerCase()}.`
            : 'Nenhum chamado ativo encontrado.',
        '{count} chamado(s) ativo(s), com os mais recentes primeiro.',
        state.listDrilldown?.label
    );
    closedListSummary.textContent = buildListSummary(
        state.closedTickets.length,
        state.listDrilldown?.label
            ? `Nenhum chamado fechado encontrado para ${state.listDrilldown.label.toLowerCase()}.`
            : 'Nenhum chamado fechado encontrado.',
        '{count} chamado(s) concluído(s), com os mais recentes primeiro.',
        state.listDrilldown?.label
    );

    ticketCount.textContent = `${state.tickets.length + state.closedTickets.length} chamados`;
}

async function loadTickets({ preserveSelection = true, drilldown = undefined } = {}) {
    if (drilldown !== undefined) {
        state.listDrilldown = drilldown;
    }

    if (state.listDrilldown?.label) {
        showInlineFeedback(listFeedback, `Lista filtrada: ${state.listDrilldown.label}.`, 'success');
        showInlineFeedback(closedListFeedback, `Lista filtrada: ${state.listDrilldown.label}.`, 'success');
    } else {
        hideInlineFeedback(listFeedback);
        hideInlineFeedback(closedListFeedback);
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="admin-table-empty">Carregando chamados ativos...</td>
        </tr>
    `;
    closedTableBody.innerHTML = `
        <tr>
            <td colspan="7" class="admin-table-empty">Carregando chamados fechados...</td>
        </tr>
    `;

    try {
        const baseFilters = getCurrentTicketFilters();
        let activeFilters = null;

        if (baseFilters.status && baseFilters.status !== 'concluido') {
            activeFilters = {
                ...baseFilters,
                statusGroup: '',
            };
        } else if (!baseFilters.status) {
            activeFilters = {
                ...baseFilters,
                status: '',
                statusGroup: 'open',
            };
        }

        const closedFilters = {
            ...baseFilters,
            status: 'concluido',
            statusGroup: '',
        };

        const [activeResult, closedResult] = await Promise.all([
            activeFilters
                ? apiFetch(`/api/admin/suporte?${buildTicketQuery(activeFilters)}`, { method: 'GET' })
                : Promise.resolve({ response: { ok: true }, payload: { tickets: [], meta: null } }),
            apiFetch(`/api/admin/suporte?${buildTicketQuery(closedFilters)}`, { method: 'GET' }),
        ]);

        const { response: activeResponse, payload: activePayload } = activeResult;
        const { response: closedResponse, payload: closedPayload } = closedResult;

        if (!activeResponse.ok || !closedResponse.ok) {
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

        if (state.detailOpen && state.selectedTicketId) {
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
    setDetailMode(false);
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
    setDetailMode(true);

    detailContainer.innerHTML = `
        <div class="admin-detail-shell">
            <header class="admin-ticket-header">
                <div class="admin-ticket-header-main">
                    <button id="detail-back-button" type="button" class="admin-secondary-button admin-detail-back">Voltar para chamados recebidos</button>
                    <div>
                        <h2>${escapeHtml(ticket.protocolo)}</h2>
                        <p class="admin-ticket-subtitle">Chamado aberto em ${escapeHtml(formatDateTime(ticket.created_at))}. Última atualização em ${escapeHtml(formatDateTime(ticket.updated_at))}.</p>
                    </div>
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
                        <span>Categoria original</span>
                        <strong>${escapeHtml(ticket.categoria_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Assunto</span>
                        <strong>${escapeHtml(ticket.assunto || ticket.tipo_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Categoria automática</span>
                        <strong>${escapeHtml(ticket.categoria_automatica_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Prioridade sugerida</span>
                        <strong>${escapeHtml(ticket.prioridade_sugerida_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Categoria final</span>
                        <strong>${escapeHtml(ticket.tipo_label)}</strong>
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
                <div class="admin-classification-summary">
                    <div class="admin-data-item">
                        <span>Tags automáticas</span>
                        ${renderTagList(ticket.tags_automaticas, 'Sem tags automáticas')}
                    </div>
                    <div class="admin-data-item">
                        <span>Tags finais</span>
                        ${renderTagList(ticket.tags, 'Sem tags finais')}
                    </div>
                </div>
            </section>

            <section class="admin-ticket-grid">
                <article class="admin-actions-card">
                    <h3>Atualizar classificação e status</h3>
                    <form id="ticket-status-form" class="admin-status-form">
                        <div class="admin-field">
                            <label for="detail-status">Status</label>
                            <select id="detail-status" name="status">
                                ${state.meta.statuses.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.status ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-type">Categoria final</label>
                            <select id="detail-type" name="tipo">
                                ${state.meta.types.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.tipo ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-priority">Prioridade</label>
                            <select id="detail-priority" name="prioridade">
                                ${state.meta.priorities.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.prioridade ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-tags">Tags finais</label>
                            <input id="detail-tags" name="tags" type="text" value="${escapeHtml((ticket.tags || []).join(', '))}" placeholder="login, pagamento, bug">
                        </div>
                        <button id="save-status-button" type="submit" class="admin-primary-button">Salvar</button>
                    </form>
                    <p class="admin-helper-copy">A classificação automática organiza a triagem inicial, mas o time pode ajustar categoria, prioridade e tags manualmente conforme o contexto real do chamado.</p>
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
    if (!button) return;
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
    const tipo = document.getElementById('detail-type').value;
    const prioridade = document.getElementById('detail-priority').value;
    const tags = document.getElementById('detail-tags').value;
    setButtonLoading(button, true, 'Salvando...', 'Salvar');

    try {
        const { response, payload } = await apiFetch('/api/admin/suporte', {
            method: 'PATCH',
            body: JSON.stringify({ ticketId, status, prioridade, tipo, tags }),
        });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível atualizar o chamado agora.', 'error');
            return;
        }

        showInlineFeedback(detailFeedback, 'Classificação e status atualizados com sucesso.', 'success');
        renderTicketDetail(payload.ticket);
        await Promise.all([
            loadTickets({ preserveSelection: true }),
            loadDashboard({ silent: true }),
        ]);
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
        await Promise.all([
            loadTickets({ preserveSelection: true }),
            loadDashboard({ silent: true }),
        ]);
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
        await Promise.all([
            loadTickets({ preserveSelection: true }),
            loadDashboard({ silent: true }),
        ]);
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
    const backButton = document.getElementById('detail-back-button');

    if (statusForm) {
        statusForm.addEventListener('submit', (event) => handleStatusSubmit(event, ticketId));
    }

    if (commentForm) {
        commentForm.addEventListener('submit', (event) => handleCommentSubmit(event, ticketId));
    }

    if (replyForm) {
        replyForm.addEventListener('submit', (event) => handleReplySubmit(event, ticketId));
    }

    if (backButton) {
        backButton.addEventListener('click', () => {
            setDetailMode(false);
            renderTicketList();
            if (listCard) {
                listCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
}

function buildChartEmptyState(message) {
    return `<div class="admin-chart-empty">${escapeHtml(message)}</div>`;
}

function buildVolumeSeriesPoints(series) {
    if (!series.length) {
        return [];
    }

    const width = 620;
    const height = 220;
    const paddingX = 24;
    const paddingTop = 24;
    const paddingBottom = 48;
    const graphWidth = width - (paddingX * 2);
    const graphHeight = height - paddingTop - paddingBottom;
    const maxValue = Math.max(...series.map((item) => item.total), 1);

    return series.map((item, index) => {
        const ratioX = series.length === 1 ? 0.5 : index / (series.length - 1);
        const x = paddingX + (ratioX * graphWidth);
        const y = paddingTop + graphHeight - ((item.total / maxValue) * graphHeight);
        return {
            ...item,
            x,
            y,
        };
    });
}

function expandVolumeSeries(series, from, to) {
    const index = new Map(series.map((item) => [item.date, item.total]));

    if (!from || !to) {
        return series;
    }

    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    const expanded = [];

    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
        const key = toDateInputValue(current);
        expanded.push({
            date: key,
            total: Number(index.get(key) || 0),
            label: formatDateLabel(key),
        });
    }

    return expanded;
}

function renderVolumeChart(series, filters) {
    const expandedSeries = expandVolumeSeries(series, filters.from, filters.to);

    if (!expandedSeries.length) {
        dashboardVolumeChart.innerHTML = buildChartEmptyState('Ainda não há chamados suficientes para montar a curva deste período.');
        return;
    }

    const points = buildVolumeSeriesPoints(expandedSeries);
    const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
    const areaPoints = [
        '24,172',
        ...points.map((point) => `${point.x},${point.y}`),
        `${points[points.length - 1].x},172`,
    ].join(' ');
    const labels = [
        points[0],
        points[Math.floor(points.length / 2)],
        points[points.length - 1],
    ].filter((item, index, items) => items.findIndex((candidate) => candidate.date === item.date) === index);
    const maxValue = Math.max(...expandedSeries.map((item) => item.total), 1);

    dashboardVolumeChart.innerHTML = `
        <svg viewBox="0 0 620 220" class="admin-line-chart" role="img" aria-label="Gráfico de volume de chamados ao longo do tempo">
            <defs>
                <linearGradient id="volume-area" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="rgba(30, 94, 255, 0.28)"></stop>
                    <stop offset="100%" stop-color="rgba(30, 94, 255, 0.02)"></stop>
                </linearGradient>
            </defs>
            <line x1="24" y1="172" x2="596" y2="172" class="admin-line-chart-axis"></line>
            <line x1="24" y1="24" x2="24" y2="172" class="admin-line-chart-axis"></line>
            <text x="12" y="32" class="admin-line-chart-ylabel">${escapeHtml(formatNumber(maxValue))}</text>
            <text x="12" y="176" class="admin-line-chart-ylabel">0</text>
            <polygon points="${areaPoints}" fill="url(#volume-area)"></polygon>
            <polyline points="${polylinePoints}" class="admin-line-chart-path"></polyline>
            ${points.map((point) => `
                <g>
                    <circle cx="${point.x}" cy="${point.y}" r="4.5" class="admin-line-chart-dot"></circle>
                    <title>${escapeHtml(point.label || formatDateLabel(point.date))}: ${escapeHtml(formatNumber(point.total))} chamado(s)</title>
                </g>
            `).join('')}
            ${labels.map((label) => `
                <text x="${label.x}" y="202" class="admin-line-chart-xlabel" text-anchor="middle">${escapeHtml(label.label || formatDateLabel(label.date))}</text>
            `).join('')}
        </svg>
    `;
}

function renderCategoryChart(categories) {
    if (!categories.length) {
        dashboardCategoryChart.innerHTML = buildChartEmptyState('Nenhuma categoria foi registrada dentro do filtro atual.');
        return;
    }

    const maxValue = Math.max(...categories.map((item) => item.total), 1);

    dashboardCategoryChart.innerHTML = `
        <div class="admin-bar-chart">
            ${categories.map((item) => {
                const width = `${Math.max(12, (item.total / maxValue) * 100)}%`;
                return `
                    <button
                        type="button"
                        class="admin-bar-row"
                        data-drilldown='${escapeHtml(JSON.stringify({ tipo: item.value, label: `categoria ${item.label}` }))}'
                    >
                        <span class="admin-bar-label">${escapeHtml(item.label)}</span>
                        <span class="admin-bar-track">
                            <span class="admin-bar-fill" style="width:${width};"></span>
                        </span>
                        <strong class="admin-bar-value">${escapeHtml(formatNumber(item.total))}</strong>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function renderPriorityChart(priorities) {
    if (!priorities.length) {
        dashboardPriorityChart.innerHTML = buildChartEmptyState('Nenhuma prioridade foi registrada dentro do filtro atual.');
        return;
    }

    const palette = {
        alta: '#f04438',
        media: '#f5b83d',
        baixa: '#17c47f',
    };
    const total = priorities.reduce((sum, item) => sum + item.total, 0);
    let currentAngle = 0;
    const segments = priorities.map((item) => {
        const percentage = total ? (item.total / total) * 100 : 0;
        const start = currentAngle;
        currentAngle += percentage;
        return `${palette[item.value] || '#1e5eff'} ${start}% ${currentAngle}%`;
    });

    dashboardPriorityChart.innerHTML = `
        <div class="admin-priority-chart">
            <div class="admin-priority-donut" style="background: conic-gradient(${segments.join(', ')});">
                <div class="admin-priority-donut-core">
                    <strong>${escapeHtml(formatNumber(total))}</strong>
                    <span>no período</span>
                </div>
            </div>
            <div class="admin-priority-legend">
                ${priorities.map((item) => `
                    <button
                        type="button"
                        class="admin-priority-item"
                        data-drilldown='${escapeHtml(JSON.stringify({ prioridade: item.value, label: `prioridade ${item.label}` }))}'
                    >
                        <span class="admin-priority-swatch" style="background:${palette[item.value] || '#1e5eff'};"></span>
                        <span class="admin-priority-copy">
                            <strong>${escapeHtml(item.label)}</strong>
                            <small>${escapeHtml(formatNumber(item.total))} chamado(s)</small>
                        </span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function renderDashboardAlerts(alerts = []) {
    if (!alerts.length) {
        dashboardAlerts.innerHTML = '';
        dashboardAlerts.classList.add('is-hidden');
        return;
    }

    dashboardAlerts.innerHTML = alerts.map((alert) => `
        <button
            type="button"
            class="admin-alert-card ${escapeHtml(alert.severity || 'warning')}"
            data-drilldown='${escapeHtml(JSON.stringify(alert.drilldown || {}))}'
        >
            <strong>${escapeHtml(alert.title)}</strong>
            <span>${escapeHtml(alert.description)}</span>
        </button>
    `).join('');
    dashboardAlerts.classList.remove('is-hidden');
}

function buildKpiCards(metrics) {
    const currentRange = state.dashboard.filters;
    const range7 = getPresetRange('7d');
    const range30 = getPresetRange('30d');
    const todayRange = {
        from: currentRange.to,
        to: currentRange.to,
    };

    return [
        {
            label: 'Hoje',
            value: formatNumber(metrics.totals.day),
            hint: 'Chamados recebidos hoje',
            drilldown: {
                ...todayRange,
                prioridade: currentRange.prioridade,
                tipo: currentRange.tipo,
                label: 'chamados de hoje',
            },
        },
        {
            label: 'Últimos 7 dias',
            value: formatNumber(metrics.totals.week),
            hint: 'Volume recente de atendimento',
            drilldown: {
                ...range7,
                prioridade: currentRange.prioridade,
                tipo: currentRange.tipo,
                label: 'chamados dos últimos 7 dias',
            },
        },
        {
            label: 'Últimos 30 dias',
            value: formatNumber(metrics.totals.month),
            hint: 'Volume acumulado no mês móvel',
            drilldown: {
                ...range30,
                prioridade: currentRange.prioridade,
                tipo: currentRange.tipo,
                label: 'chamados dos últimos 30 dias',
            },
        },
        {
            label: 'Em aberto',
            value: formatNumber(metrics.totals.open),
            hint: 'Chamados ainda pendentes no filtro',
            drilldown: {
                ...currentRange,
                statusGroup: 'open',
                label: 'chamados em aberto',
            },
        },
        {
            label: 'Taxa de conclusão',
            value: formatPercent(metrics.totals.completionRate),
            hint: `${formatNumber(metrics.totals.completed)} chamado(s) concluído(s)`,
            drilldown: {
                ...currentRange,
                status: 'concluido',
                label: 'chamados concluídos',
            },
        },
        {
            label: '1ª resposta média',
            value: formatMinutes(metrics.totals.averageFirstResponseMinutes),
            hint: 'Tempo entre criação e primeira resposta',
            drilldown: {
                ...currentRange,
                label: 'chamados do período filtrado',
            },
        },
        {
            label: 'Resolução média',
            value: formatMinutes(metrics.totals.averageResolutionMinutes),
            hint: 'Tempo entre criação e conclusão',
            drilldown: {
                ...currentRange,
                status: 'concluido',
                label: 'chamados concluídos do período',
            },
        },
    ];
}

function renderDashboard(metrics) {
    const kpis = buildKpiCards(metrics);
    dashboardKpis.innerHTML = kpis.map((item) => `
        <button
            type="button"
            class="admin-kpi-card"
            data-drilldown='${escapeHtml(JSON.stringify(item.drilldown || {}))}'
        >
            <span class="admin-kpi-label">${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <small>${escapeHtml(item.hint)}</small>
        </button>
    `).join('');

    renderDashboardAlerts(metrics.alerts);
    renderVolumeChart(metrics.volumeSeries, state.dashboard.filters);
    renderCategoryChart(metrics.categories);
    renderPriorityChart(metrics.priorities);
}

function setDashboardLoadingState() {
    dashboardKpis.innerHTML = `
        <article class="admin-kpi-card admin-kpi-card-loading">
            <span class="admin-kpi-label">Atualizando métricas...</span>
            <strong>--</strong>
            <small>Buscando dados do suporte</small>
        </article>
    `;
    dashboardVolumeChart.innerHTML = buildChartEmptyState('Carregando gráfico de volume...');
    dashboardCategoryChart.innerHTML = buildChartEmptyState('Carregando categorias...');
    dashboardPriorityChart.innerHTML = buildChartEmptyState('Carregando prioridades...');
}

function getDashboardFiltersFromForm() {
    const period = dashboardPeriodFilter.value || '30d';
    const isCustom = period === 'custom';
    const range = isCustom
        ? {
            from: dashboardFromFilter.value,
            to: dashboardToFilter.value,
        }
        : getPresetRange(period);

    return {
        period,
        from: range.from,
        to: range.to,
        tipo: dashboardTypeFilter.value || '',
        prioridade: dashboardPriorityFilter.value || '',
    };
}

function syncDashboardForm(filters) {
    dashboardPeriodFilter.value = filters.period || '30d';
    dashboardTypeFilter.value = filters.tipo || '';
    dashboardPriorityFilter.value = filters.prioridade || '';
    syncDashboardRangeInputs();
    if (filters.from) dashboardFromFilter.value = filters.from;
    if (filters.to) dashboardToFilter.value = filters.to;
}

async function loadDashboard({ silent = false } = {}) {
    hideInlineFeedback(dashboardFeedback);
    if (!silent) {
        setDashboardLoadingState();
    }

    const filters = getDashboardFiltersFromForm();
    if (filters.period === 'custom' && (!filters.from || !filters.to)) {
        showInlineFeedback(dashboardFeedback, 'Selecione as datas inicial e final para carregar o dashboard personalizado.', 'error');
        return;
    }

    state.dashboard.filters = filters;
    dashboardPeriodLabel.textContent = getRangeLabel(filters);

    const params = new URLSearchParams({
        view: 'dashboard',
        from: filters.from,
        to: filters.to,
    });

    if (filters.tipo) params.set('tipo', filters.tipo);
    if (filters.prioridade) params.set('prioridade', filters.prioridade);

    try {
        const { response, payload } = await apiFetch(`/api/admin/suporte?${params.toString()}`, { method: 'GET' });

        if (!response.ok || !payload.dashboard) {
            showInlineFeedback(dashboardFeedback, payload.mensagem || 'Não foi possível carregar as métricas agora.', 'error');
            return;
        }

        syncFilterMeta(payload.meta);
        state.dashboard.data = payload.dashboard.metrics;
        dashboardGeneratedAt.textContent = `Atualizado em ${formatDateTime(new Date().toISOString())}`;
        renderDashboard(payload.dashboard.metrics);
    } catch (error) {
        console.error(error);
        showInlineFeedback(dashboardFeedback, 'Não foi possível carregar as métricas agora.', 'error');
    }
}

async function applyDashboardDrilldown(drilldown = {}) {
    const filters = {
        ...state.dashboard.filters,
        ...drilldown,
    };

    if (drilldown.tipo !== undefined) {
        typeFilter.value = drilldown.tipo || '';
    }
    if (drilldown.prioridade !== undefined) {
        priorityFilter.value = drilldown.prioridade || '';
    }
    if (drilldown.status !== undefined) {
        statusFilter.value = drilldown.status || '';
    } else if (drilldown.statusGroup) {
        statusFilter.value = '';
    }

    const listDrilldown = {
        from: filters.from || '',
        to: filters.to || '',
        statusGroup: drilldown.statusGroup || '',
        status: drilldown.status || '',
        prioridade: drilldown.prioridade || '',
        tipo: drilldown.tipo || '',
        label: drilldown.label || 'chamados do dashboard',
    };

    await loadTickets({
        preserveSelection: false,
        drilldown: listDrilldown,
    });

    if (listCard) {
        listCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function attachDashboardChartEvents() {
    [dashboardKpis, dashboardAlerts, dashboardCategoryChart, dashboardPriorityChart].forEach((container) => {
        container.addEventListener('click', async (event) => {
            const trigger = event.target.closest('[data-drilldown]');
            if (!trigger) return;

            try {
                const drilldown = JSON.parse(trigger.getAttribute('data-drilldown') || '{}');
                await applyDashboardDrilldown(drilldown);
            } catch (error) {
                console.error(error);
            }
        });
    });
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
            syncDashboardForm(state.dashboard.filters);
            await Promise.all([
                loadDashboard(),
                loadTickets({ preserveSelection: false }),
            ]);
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
        syncDashboardForm(state.dashboard.filters);
        await Promise.all([
            loadDashboard(),
            loadTickets({ preserveSelection: false }),
        ]);
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
        setDetailMode(false);
        state.listDrilldown = null;
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

function showTicketListSuccess(message, group = 'active') {
    const targetFeedback = group === 'closed' ? closedListFeedback : listFeedback;
    showInlineFeedback(targetFeedback, message, 'success');
}

function scrollToTicketList(group = 'active') {
    const targetCard = group === 'closed' ? closedListCard : listCard;
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function loadTickets({ preserveSelection = true, drilldown = undefined } = {}) {
    if (drilldown !== undefined) {
        state.listDrilldown = drilldown;
    }

    if (state.listDrilldown?.label) {
        showInlineFeedback(listFeedback, `Lista filtrada: ${state.listDrilldown.label}.`, 'success');
        showInlineFeedback(closedListFeedback, `Lista filtrada: ${state.listDrilldown.label}.`, 'success');
    } else {
        hideInlineFeedback(listFeedback);
        hideInlineFeedback(closedListFeedback);
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="admin-table-empty">Carregando chamados ativos...</td>
        </tr>
    `;
    closedTableBody.innerHTML = `
        <tr>
            <td colspan="7" class="admin-table-empty">Carregando chamados fechados...</td>
        </tr>
    `;

    try {
        const baseFilters = getCurrentTicketFilters();
        let activeFilters = null;

        if (baseFilters.status && baseFilters.status !== 'concluido') {
            activeFilters = {
                ...baseFilters,
                statusGroup: '',
            };
        } else if (!baseFilters.status) {
            activeFilters = {
                ...baseFilters,
                status: '',
                statusGroup: 'open',
            };
        }

        const closedFilters = {
            ...baseFilters,
            status: 'concluido',
            statusGroup: '',
        };

        const [activeResult, closedResult] = await Promise.all([
            activeFilters
                ? apiFetch(`/api/admin/suporte?${buildTicketQuery(activeFilters)}`, { method: 'GET' })
                : Promise.resolve({ response: { ok: true }, payload: { tickets: [], meta: null } }),
            apiFetch(`/api/admin/suporte?${buildTicketQuery(closedFilters)}`, { method: 'GET' }),
        ]);

        const { response: activeResponse, payload: activePayload } = activeResult;
        const { response: closedResponse, payload: closedPayload } = closedResult;

        if (!activeResponse.ok || !closedResponse.ok) {
            showInlineFeedback(listFeedback, activePayload.mensagem || closedPayload.mensagem || 'Não foi possível carregar os chamados agora.', 'error');
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="admin-table-empty">Não foi possível carregar os chamados agora.</td>
                </tr>
            `;
            closedTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="admin-table-empty">Não foi possível carregar os chamados fechados agora.</td>
                </tr>
            `;
            return;
        }

        syncFilterMeta(activePayload.meta || closedPayload.meta);
        state.tickets = Array.isArray(activePayload.tickets) ? activePayload.tickets : [];
        state.closedTickets = Array.isArray(closedPayload.tickets) ? closedPayload.tickets : [];

        const allTickets = [...state.tickets, ...state.closedTickets];
        if (!preserveSelection || !allTickets.some((ticket) => ticket.id === state.selectedTicketId)) {
            state.selectedTicketId = state.tickets[0]?.id || state.closedTickets[0]?.id || null;
            state.selectedTicketGroup = state.tickets[0]
                ? 'active'
                : (state.closedTickets[0] ? 'closed' : 'active');
        }

        renderTicketList();

        if (state.detailOpen && state.selectedTicketId) {
            await loadTicketDetail(state.selectedTicketId, {
                silent: true,
                group: state.selectedTicketGroup,
            });
        } else {
            renderEmptyDetail();
        }
    } catch (error) {
        console.error(error);
    }
}

function renderTicketDetail(ticket) {
    state.selectedTicket = ticket;
    setDetailMode(true);

    const isClosed = ticket.status === 'concluido';

    detailContainer.innerHTML = `
        <div class="admin-detail-shell">
            <header class="admin-ticket-header">
                <div class="admin-ticket-header-main">
                    <button id="detail-back-button" type="button" class="admin-secondary-button admin-detail-back">Voltar para chamados ${state.selectedTicketGroup === 'closed' ? 'fechados' : 'recebidos'}</button>
                    <div>
                        <h2>${escapeHtml(ticket.protocolo)}</h2>
                        <p class="admin-ticket-subtitle">Chamado aberto em ${escapeHtml(formatDateTime(ticket.created_at))}. Última atualização em ${escapeHtml(formatDateTime(ticket.updated_at))}.</p>
                    </div>
                </div>
                <div class="admin-ticket-meta-actions">
                    ${getTicketStatusBadge(ticket)}
                    ${getPriorityBadge(ticket)}
                    <button
                        id="toggle-close-ticket-button"
                        type="button"
                        class="admin-secondary-button admin-quick-close-button${isClosed ? ' reopen' : ''}"
                    >
                        ${isClosed ? 'Reabrir chamado' : 'Concluir chamado'}
                    </button>
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
                        <span>Categoria original</span>
                        <strong>${escapeHtml(ticket.categoria_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Assunto</span>
                        <strong>${escapeHtml(ticket.assunto || ticket.tipo_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Categoria automática</span>
                        <strong>${escapeHtml(ticket.categoria_automatica_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Prioridade sugerida</span>
                        <strong>${escapeHtml(ticket.prioridade_sugerida_label)}</strong>
                    </div>
                    <div class="admin-data-item">
                        <span>Categoria final</span>
                        <strong>${escapeHtml(ticket.tipo_label)}</strong>
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
                <div class="admin-classification-summary">
                    <div class="admin-data-item">
                        <span>Tags automáticas</span>
                        ${renderTagList(ticket.tags_automaticas, 'Sem tags automáticas')}
                    </div>
                    <div class="admin-data-item">
                        <span>Tags finais</span>
                        ${renderTagList(ticket.tags, 'Sem tags finais')}
                    </div>
                </div>
            </section>

            <section class="admin-ticket-grid">
                <article class="admin-actions-card">
                    <h3>Atualizar classificação e status</h3>
                    <form id="ticket-status-form" class="admin-status-form">
                        <div class="admin-field">
                            <label for="detail-status">Status</label>
                            <select id="detail-status" name="status">
                                ${state.meta.statuses.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.status ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-type">Categoria final</label>
                            <select id="detail-type" name="tipo">
                                ${state.meta.types.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.tipo ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-priority">Prioridade</label>
                            <select id="detail-priority" name="prioridade">
                                ${state.meta.priorities.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === ticket.prioridade ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="admin-field">
                            <label for="detail-tags">Tags finais</label>
                            <input id="detail-tags" name="tags" type="text" value="${escapeHtml((ticket.tags || []).join(', '))}" placeholder="login, pagamento, bug">
                        </div>
                        <button id="save-status-button" type="submit" class="admin-primary-button">Salvar</button>
                    </form>
                    <p class="admin-helper-copy">A classificação automática organiza a triagem inicial, mas o time pode ajustar categoria, prioridade e tags manualmente conforme o contexto real do chamado.</p>
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

async function loadTicketDetail(ticketId, { silent = false, group = 'active' } = {}) {
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
        state.selectedTicketGroup = group;
        renderTicketList();
        renderTicketDetail(payload.ticket);
    } catch (error) {
        console.error(error);
    }
}

async function handleQuickStatusAction(ticketId, nextStatus) {
    hideInlineFeedback(detailFeedback);

    const button = document.getElementById('toggle-close-ticket-button');
    const defaultLabel = nextStatus === 'concluido' ? 'Concluir chamado' : 'Reabrir chamado';
    const loadingLabel = nextStatus === 'concluido' ? 'Concluindo...' : 'Reabrindo...';
    setButtonLoading(button, true, loadingLabel, defaultLabel);

    try {
        const { response, payload } = await apiFetch('/api/admin/suporte', {
            method: 'PATCH',
            body: JSON.stringify({ ticketId, status: nextStatus }),
        });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível atualizar o chamado agora.', 'error');
            return;
        }

        state.selectedTicketId = payload.ticket.id;
        state.selectedTicketGroup = nextStatus === 'concluido' ? 'closed' : 'active';

        await Promise.all([
            loadTickets({ preserveSelection: true }),
            loadDashboard({ silent: true }),
        ]);

        setDetailMode(false);
        renderTicketList();
        showTicketListSuccess(
            nextStatus === 'concluido'
                ? 'Chamado concluído e movido para chamados fechados.'
                : 'Chamado reaberto e devolvido para chamados recebidos.',
            state.selectedTicketGroup
        );
        scrollToTicketList(state.selectedTicketGroup);
    } catch (error) {
        console.error(error);
    } finally {
        setButtonLoading(button, false, loadingLabel, defaultLabel);
    }
}

async function handleStatusSubmit(event, ticketId) {
    event.preventDefault();
    hideInlineFeedback(detailFeedback);

    const button = document.getElementById('save-status-button');
    const status = document.getElementById('detail-status').value;
    const tipo = document.getElementById('detail-type').value;
    const prioridade = document.getElementById('detail-priority').value;
    const tags = document.getElementById('detail-tags').value;
    const previousStatus = state.selectedTicket?.status || '';
    setButtonLoading(button, true, 'Salvando...', 'Salvar');

    try {
        const { response, payload } = await apiFetch('/api/admin/suporte', {
            method: 'PATCH',
            body: JSON.stringify({ ticketId, status, prioridade, tipo, tags }),
        });

        if (!response.ok || !payload.ticket) {
            showInlineFeedback(detailFeedback, payload.mensagem || 'Não foi possível atualizar o chamado agora.', 'error');
            return;
        }

        const movedGroup = (previousStatus === 'concluido') !== (payload.ticket.status === 'concluido');
        state.selectedTicketId = payload.ticket.id;
        state.selectedTicketGroup = payload.ticket.status === 'concluido' ? 'closed' : 'active';

        await Promise.all([
            loadTickets({ preserveSelection: true }),
            loadDashboard({ silent: true }),
        ]);

        if (movedGroup) {
            setDetailMode(false);
            renderTicketList();
            showTicketListSuccess(
                payload.ticket.status === 'concluido'
                    ? 'Chamado concluído e movido para chamados fechados.'
                    : 'Chamado reaberto e devolvido para chamados recebidos.',
                state.selectedTicketGroup
            );
            scrollToTicketList(state.selectedTicketGroup);
            return;
        }

        showInlineFeedback(detailFeedback, 'Classificação e status atualizados com sucesso.', 'success');
        renderTicketDetail(payload.ticket);
    } catch (error) {
        console.error(error);
    } finally {
        setButtonLoading(button, false, 'Salvando...', 'Salvar');
    }
}

function attachDetailEventHandlers(ticketId) {
    const statusForm = document.getElementById('ticket-status-form');
    const commentForm = document.getElementById('internal-comment-form');
    const replyForm = document.getElementById('reply-form');
    const backButton = document.getElementById('detail-back-button');
    const toggleCloseButton = document.getElementById('toggle-close-ticket-button');

    if (statusForm) {
        statusForm.addEventListener('submit', (event) => handleStatusSubmit(event, ticketId));
    }

    if (commentForm) {
        commentForm.addEventListener('submit', (event) => handleCommentSubmit(event, ticketId));
    }

    if (replyForm) {
        replyForm.addEventListener('submit', (event) => handleReplySubmit(event, ticketId));
    }

    if (backButton) {
        backButton.addEventListener('click', () => {
            setDetailMode(false);
            renderTicketList();
            scrollToTicketList(state.selectedTicketGroup);
        });
    }

    if (toggleCloseButton) {
        toggleCloseButton.addEventListener('click', () => {
            const nextStatus = state.selectedTicket?.status === 'concluido' ? 'aberto' : 'concluido';
            handleQuickStatusAction(ticketId, nextStatus);
        });
    }
}

function attachTicketRowEvents(container) {
    container.addEventListener('click', (event) => {
        const row = event.target.closest('.admin-ticket-row');
        if (!row) return;
        const ticketId = row.getAttribute('data-ticket-id');
        const group = row.getAttribute('data-ticket-group') || 'active';
        if (!ticketId) return;
        loadTicketDetail(ticketId, { group });
    });

    container.addEventListener('keydown', (event) => {
        const row = event.target.closest('.admin-ticket-row');
        if (!row) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const ticketId = row.getAttribute('data-ticket-id');
        const group = row.getAttribute('data-ticket-group') || 'active';
        if (!ticketId) return;
        loadTicketDetail(ticketId, { group });
    });
}

function attachTableEvents() {
    attachTicketRowEvents(tableBody);
    attachTicketRowEvents(closedTableBody);
}

loginForm.addEventListener('submit', handleLoginSubmit);
logoutButton.addEventListener('click', handleLogout);

filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadTickets({ preserveSelection: false });
});

clearFiltersButton.addEventListener('click', async () => {
    filtersForm.reset();
    state.listDrilldown = null;
    hideInlineFeedback(listFeedback);
    hideInlineFeedback(closedListFeedback);
    await loadTickets({ preserveSelection: false });
});

refreshButton.addEventListener('click', async () => {
    await Promise.all([
        loadDashboard({ silent: true }),
        loadTickets({ preserveSelection: true }),
    ]);
});

dashboardPeriodFilter.addEventListener('change', () => {
    syncDashboardRangeInputs();
});

dashboardFiltersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadDashboard();
});

dashboardClearFiltersButton.addEventListener('click', async () => {
    state.dashboard.filters = {
        period: '30d',
        ...getPresetRange('30d'),
        tipo: '',
        prioridade: '',
    };
    syncDashboardForm(state.dashboard.filters);
    await loadDashboard();
});

volumeDrilldownButton.addEventListener('click', async () => {
    await applyDashboardDrilldown({
        ...state.dashboard.filters,
        label: 'chamados do período selecionado',
    });
});

attachTableEvents();
attachDashboardChartEvents();
syncDashboardForm({
    period: '30d',
    ...getPresetRange('30d'),
    tipo: '',
    prioridade: '',
});
loadSession();
