(function () {
    const CAMPAIGN_PATH = '/familias-fundadoras/';
    const CAMPAIGN_FORM_HASH = '#campanha-formulario';
    const MODAL_DELAY_MIN = 1500;
    const MODAL_DELAY_RANGE = 1500;
    const MODAL_FREQUENCY_MS = 24 * 60 * 60 * 1000;
    const STORAGE_KEYS = {
        modalSeenAt: 'leco_campaign_modal_seen_at',
        leadSubmitted: 'leco_campaign_lead_submitted',
        topbarHidden: 'leco_campaign_topbar_hidden_session',
    };

    const currentPath = normalizePath(window.location.pathname);
    const isHome = currentPath === '/';
    const isLanding = currentPath === CAMPAIGN_PATH;

    function normalizePath(pathname) {
        if (!pathname || pathname === '/index.html') {
            return '/';
        }

        return pathname.endsWith('/') ? pathname : `${pathname}/`;
    }

    function safeStorage(action, type, key, value) {
        try {
            const storage = window[type];
            if (!storage) return null;
            if (action === 'get') return storage.getItem(key);
            if (action === 'set') {
                storage.setItem(key, value);
                return value;
            }
            if (action === 'remove') {
                storage.removeItem(key);
                return null;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function getStorage(key) {
        return safeStorage('get', 'localStorage', key);
    }

    function setStorage(key, value) {
        return safeStorage('set', 'localStorage', key, value);
    }

    function getSessionStorage(key) {
        return safeStorage('get', 'sessionStorage', key);
    }

    function setSessionStorage(key, value) {
        return safeStorage('set', 'sessionStorage', key, value);
    }

    function hasLeadSubmitted() {
        return Boolean(getStorage(STORAGE_KEYS.leadSubmitted));
    }

    function markLeadSubmitted(payload) {
        const serialized = typeof payload === 'string'
            ? payload
            : JSON.stringify({
                at: new Date().toISOString(),
                ...(payload || {}),
            });

        setStorage(STORAGE_KEYS.leadSubmitted, serialized);
    }

    function trackEvent(name, params) {
        const detail = {
            event: name,
            campaign: '2_meses_lancamento',
            ...(params || {}),
        };

        window.lecoAnalyticsQueue = window.lecoAnalyticsQueue || [];
        window.lecoAnalyticsQueue.push(detail);

        if (Array.isArray(window.dataLayer)) {
            window.dataLayer.push(detail);
        }

        if (typeof window.gtag === 'function') {
            window.gtag('event', name, params || {});
        }

        if (typeof window.fbq === 'function') {
            window.fbq('trackCustom', name, detail);
        }

        document.dispatchEvent(new CustomEvent('leco:analytics', { detail }));
    }

    window.lecoTrackEvent = trackEvent;
    window.lecoCampaign = {
        markLeadSubmitted,
        hasLeadSubmitted,
    };

    function updateTopbarOffset(bar) {
        const height = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
        document.documentElement.style.setProperty('--campaign-topbar-height', `${height}px`);
        document.body.classList.toggle('has-campaign-topbar', height > 0);
    }

    function createTopbar() {
        if (getSessionStorage(STORAGE_KEYS.topbarHidden) === '1') {
            updateTopbarOffset(null);
            return;
        }

        const targetHref = isLanding ? CAMPAIGN_FORM_HASH : CAMPAIGN_PATH;
        const topbar = document.createElement('div');
        topbar.className = 'leco-campaign-topbar';
        topbar.innerHTML = `
            <div class="leco-campaign-topbar-inner">
                <div class="leco-campaign-topbar-copy">
                    <span class="leco-campaign-topbar-icon" aria-hidden="true">🎁</span>
                    <div class="leco-campaign-topbar-text">
                        <span class="leco-campaign-topbar-title">50 primeiras famílias ganham 2 meses de LECO grátis</span>
                        <span class="leco-campaign-topbar-note">Válido para novos usuários elegíveis</span>
                    </div>
                </div>
                <a href="${targetHref}" class="leco-campaign-topbar-button" data-campaign-topbar-cta>Garantir minha vaga</a>
                <button type="button" class="leco-campaign-topbar-close" aria-label="Fechar aviso da campanha">×</button>
            </div>
        `;

        document.body.prepend(topbar);
        updateTopbarOffset(topbar);

        const resize = () => updateTopbarOffset(topbar);
        window.addEventListener('resize', resize);

        if (window.ResizeObserver) {
            const observer = new ResizeObserver(resize);
            observer.observe(topbar);
        }

        const cta = topbar.querySelector('[data-campaign-topbar-cta]');
        const closeButton = topbar.querySelector('.leco-campaign-topbar-close');

        cta.addEventListener('click', function () {
            trackEvent('campaign_topbar_click', {
                location: isLanding ? 'landing' : currentPath,
                destination: targetHref,
            });
        });

        closeButton.addEventListener('click', function () {
            topbar.remove();
            setSessionStorage(STORAGE_KEYS.topbarHidden, '1');
            updateTopbarOffset(null);
        });
    }

    function shouldShowModal() {
        if (!isHome || isLanding || hasLeadSubmitted()) {
            return false;
        }

        const seenAt = Number(getStorage(STORAGE_KEYS.modalSeenAt) || 0);

        if (seenAt && Date.now() - seenAt < MODAL_FREQUENCY_MS) {
            return false;
        }

        return true;
    }

    function closeModal(modal) {
        if (!modal || modal.hidden) {
            return;
        }

        modal.hidden = true;
        document.body.classList.remove('campaign-modal-open');
    }

    function createModal() {
        const modal = document.createElement('div');
        modal.className = 'leco-campaign-modal';
        modal.hidden = true;
        modal.innerHTML = `
            <div class="leco-campaign-modal-overlay" data-campaign-modal-overlay></div>
            <div class="leco-campaign-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-modal-title">
                <button type="button" class="leco-campaign-modal-close" aria-label="Fechar campanha" data-campaign-modal-close>×</button>
                <div class="leco-campaign-modal-body">
                    <div class="leco-campaign-modal-copy">
                        <div class="leco-campaign-modal-badges">
                            <span class="leco-campaign-modal-badge">50 vagas</span>
                            <span class="leco-campaign-modal-badge">2 meses grátis</span>
                            <span class="leco-campaign-modal-badge">Lançamento</span>
                        </div>
                        <h2 id="campaign-modal-title">50 famílias vão ganhar 2 meses de LECO grátis</h2>
                        <p>Participe do lançamento e conheça a plataforma que ajuda no desenvolvimento da rotina, da autonomia e da responsabilidade das crianças.</p>
                        <div class="leco-campaign-modal-actions">
                            <a href="${CAMPAIGN_PATH}" class="btn btn-primary" data-campaign-modal-primary>Garantir minha vaga</a>
                            <a href="${CAMPAIGN_PATH}#o-que-e-leco" class="btn btn-secondary" data-campaign-modal-secondary>Entender como funciona</a>
                        </div>
                    </div>
                    <div class="leco-campaign-modal-visual">
                        <div class="leco-campaign-modal-visual-card">
                            <strong>Lançamento LECO</strong>
                            <p>Campanha válida para novos usuários elegíveis, sujeita às regras da promoção.</p>
                            <a href="/regulamento-campanha-bonus-2-meses/" class="leco-campaign-modal-rule">Ver regulamento completo</a>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const overlay = modal.querySelector('[data-campaign-modal-overlay]');
        const closeButton = modal.querySelector('[data-campaign-modal-close]');
        const primaryButton = modal.querySelector('[data-campaign-modal-primary]');
        const secondaryButton = modal.querySelector('[data-campaign-modal-secondary]');

        const closeAndTrack = (reason) => {
            trackEvent('campaign_modal_close', { reason });
            closeModal(modal);
        };

        closeButton.addEventListener('click', () => closeAndTrack('button'));
        overlay.addEventListener('click', () => closeAndTrack('overlay'));

        document.addEventListener('keydown', function handleEscape(event) {
            if (event.key === 'Escape' && !modal.hidden) {
                closeAndTrack('escape');
            }
        });

        primaryButton.addEventListener('click', function () {
            trackEvent('campaign_modal_cta_click', {
                cta: 'primary',
                destination: CAMPAIGN_PATH,
            });
            closeModal(modal);
        });

        secondaryButton.addEventListener('click', function () {
            trackEvent('campaign_modal_cta_click', {
                cta: 'secondary',
                destination: `${CAMPAIGN_PATH}#o-que-e-leco`,
            });
            closeModal(modal);
        });

        return modal;
    }

    function openModal(modal) {
        if (!modal) {
            return;
        }

        setStorage(STORAGE_KEYS.modalSeenAt, String(Date.now()));
        modal.hidden = false;
        document.body.classList.add('campaign-modal-open');
        trackEvent('campaign_modal_view', { location: 'home' });

        const closeButton = modal.querySelector('[data-campaign-modal-close]');
        if (closeButton) {
            closeButton.focus();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        createTopbar();

        if (shouldShowModal()) {
            const modal = createModal();
            const delay = MODAL_DELAY_MIN + Math.floor(Math.random() * MODAL_DELAY_RANGE);
            window.setTimeout(function () {
                if (!hasLeadSubmitted()) {
                    openModal(modal);
                }
            }, delay);
        }
    });
})();
