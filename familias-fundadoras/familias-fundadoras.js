const ESTADOS = new Set([
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const form = document.getElementById('campaign-form');
const backendNotice = document.getElementById('campaign-backend-notice');
const feedback = document.getElementById('campaign-feedback');
const submitButton = document.getElementById('campaign-submit-button');
const celularInput = document.getElementById('campaign-celular');
const successState = document.getElementById('campaign-success-state');
const formCard = document.getElementById('campaign-form-card');
const successTitle = document.getElementById('campaign-success-title');
const successCopy = document.getElementById('campaign-success-copy');
const alreadySubmittedNotice = document.getElementById('campaign-submitted-notice');

function trackCampaign(eventName, payload) {
    if (typeof window.lecoTrackEvent === 'function') {
        window.lecoTrackEvent(eventName, payload);
    }
}

function markCampaignSubmitted(payload) {
    if (window.lecoCampaign && typeof window.lecoCampaign.markLeadSubmitted === 'function') {
        window.lecoCampaign.markLeadSubmitted(payload);
    }
}

function hasCampaignSubmitted() {
    return Boolean(window.lecoCampaign && typeof window.lecoCampaign.hasLeadSubmitted === 'function' && window.lecoCampaign.hasLeadSubmitted());
}

function formatCelular(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function clearErrors() {
    document.querySelectorAll('[data-error-for]').forEach((item) => {
        item.textContent = '';
    });

    document.querySelectorAll('.fundadoras-field, .fundadoras-terms').forEach((item) => {
        item.classList.remove('has-error');
    });
}

function showFieldErrors(errors) {
    Object.entries(errors).forEach(([field, messages]) => {
        const errorElement = document.querySelector(`[data-error-for="${field}"]`);
        const fieldElement = document.getElementById(field);

        if (errorElement) {
            errorElement.textContent = Array.isArray(messages) ? messages[0] : messages;
        }

        if (field === 'aceite_termos') {
            const terms = document.querySelector('.fundadoras-terms');
            if (terms) terms.classList.add('has-error');
            return;
        }

        const container = fieldElement ? fieldElement.closest('.fundadoras-field') : null;
        if (container) {
            container.classList.add('has-error');
        }
    });
}

function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `fundadoras-status ${type}`;
    element.classList.remove('is-hidden');
}

function hideStatus(element) {
    element.textContent = '';
    element.className = 'fundadoras-status is-hidden';
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Enviando seus dados...' : 'Quero participar da campanha';
}

function collectData() {
    return {
        nome: document.getElementById('campaign-nome').value.trim(),
        email: document.getElementById('campaign-email').value.trim(),
        celular: document.getElementById('campaign-celular').value.trim(),
        quantidade_criancas: Number(document.getElementById('campaign-quantidade').value),
        idades_criancas: document.getElementById('campaign-idades').value.trim(),
        cidade: document.getElementById('campaign-cidade').value.trim(),
        estado: document.getElementById('campaign-estado').value,
        aceite_termos: document.getElementById('campaign-aceite').checked,
        formulario: 'familias_fundadoras',
        campanha: '2_meses_lancamento',
        origem: 'familias_fundadoras',
        canal: 'site',
        status_lead: 'lead_campanha',
        elegivel_promocao: 'pendente',
    };
}

function validateData(data) {
    const errors = {};

    if (!data.nome || data.nome.length < 3) {
        errors.nome = ['Informe seu nome completo.'];
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = ['Informe um e-mail válido.'];
    }

    if (!/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(data.celular)) {
        errors.celular = ['Use o formato (11) 99999-9999.'];
    }

    if (!Number.isInteger(data.quantidade_criancas) || data.quantidade_criancas < 1 || data.quantidade_criancas > 20) {
        errors.quantidade_criancas = ['Informe a quantidade de filhos.'];
    }

    if (!data.idades_criancas || data.idades_criancas.length < 2) {
        errors.idades_criancas = ['Informe a idade das crianças.'];
    }

    if (!data.cidade || data.cidade.length < 2) {
        errors.cidade = ['Informe sua cidade.'];
    }

    if (!ESTADOS.has(data.estado)) {
        errors.estado = ['Selecione um estado válido.'];
    }

    if (!data.aceite_termos) {
        errors.aceite_termos = ['Você precisa aceitar os termos e a política para continuar.'];
    }

    return errors;
}

function renderSuccessState(title, copy) {
    formCard.classList.add('is-hidden');
    successState.classList.remove('is-hidden');
    successTitle.textContent = title;
    successCopy.textContent = copy;
}

function ensureInitialUIState() {
    hideStatus(backendNotice);
    hideStatus(feedback);
    hideStatus(alreadySubmittedNotice);
    formCard.classList.remove('is-hidden');
    successState.classList.add('is-hidden');
}

function bindTrackedLinks() {
    document.querySelectorAll('[data-campaign-cta]').forEach((link) => {
        link.addEventListener('click', () => {
            trackCampaign('campaign_landing_cta_click', {
                cta: link.dataset.campaignCta,
                destination: link.getAttribute('href') || '',
            });
        });
    });
}

async function loadStatus() {
    try {
        const response = await fetch('/api/inscricao', { cache: 'no-store' });
        const data = await response.json();

        if (data.backend_configured === false) {
            showStatus(
                backendNotice,
                'A landing da campanha já está publicada. Para liberar os envios, configure a variável DATABASE_URL do Neon na Vercel.',
                'warning'
            );
            return;
        }

        if (!response.ok) {
            throw new Error(data.mensagem || 'Não foi possível carregar o status da campanha.');
        }
    } catch (error) {
        console.error(error);
        showStatus(
            backendNotice,
            'Não foi possível consultar a disponibilidade da campanha agora. Você ainda pode navegar na página, mas o envio depende do backend estar disponível.',
            'warning'
        );
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    clearErrors();
    hideStatus(feedback);

    const data = collectData();
    const errors = validateData(data);

    if (Object.keys(errors).length > 0) {
        showFieldErrors(errors);
        trackCampaign('campaign_form_error', {
            form: 'familias_fundadoras',
            reason: 'validacao_front',
        });
        showStatus(feedback, 'Revise os campos obrigatórios e verifique se as informações foram preenchidas corretamente.', 'error');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/api/inscricao', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.status === 'sucesso') {
            markCampaignSubmitted({
                source: 'familias_fundadoras',
                numero: result.numero,
            });
            trackCampaign('campaign_form_submit', {
                form: 'familias_fundadoras',
                status: 'sucesso',
            });
            renderSuccessState(
                'Cadastro recebido com sucesso.',
                'Sua participação na campanha foi registrada. A concessão do benefício depende da elegibilidade, da ordem de validação e da criação da conta após o lançamento oficial, conforme as regras da campanha.'
            );
            return;
        }

        if (result.status === 'lead_existente' || result.status === 'email_duplicado') {
            markCampaignSubmitted({
                source: 'familias_fundadoras',
                status: 'lead_existente',
                duplicate_by: result.duplicate_by || 'email',
            });
            trackCampaign('campaign_form_duplicate', {
                form: 'familias_fundadoras',
                duplicate_by: result.duplicate_by || 'email',
            });
            renderSuccessState(
                'Seu cadastro já foi recebido anteriormente.',
                'Se você já participou da campanha, não é necessário enviar novamente.'
            );
            return;
        }

        if (result.status === 'validacao' && result.errors) {
            showFieldErrors(result.errors);
            trackCampaign('campaign_form_error', {
                form: 'familias_fundadoras',
                reason: 'validacao_api',
            });
            showStatus(feedback, 'Revise os campos obrigatórios e verifique se as informações foram preenchidas corretamente.', 'error');
            return;
        }

        trackCampaign('campaign_form_error', {
            form: 'familias_fundadoras',
            reason: result.status || 'erro',
        });
        showStatus(feedback, result.mensagem || 'Não foi possível concluir seu cadastro agora. Tente novamente em instantes.', 'error');
    } catch (error) {
        console.error(error);
        trackCampaign('campaign_form_error', {
            form: 'familias_fundadoras',
            reason: 'network',
        });
        showStatus(feedback, 'Houve uma instabilidade ao enviar seus dados. Tente novamente em alguns instantes.', 'error');
    } finally {
        setLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ensureInitialUIState();

    trackCampaign('campaign_landing_view', {
        location: 'familias_fundadoras',
    });

    bindTrackedLinks();
    loadStatus();

    if (hasCampaignSubmitted()) {
        showStatus(
            alreadySubmittedNotice,
            'Seu cadastro já foi recebido anteriormente. Se você já participou da campanha, não é necessário enviar novamente.',
            'info'
        );
    }
});

celularInput.addEventListener('input', (event) => {
    event.target.value = formatCelular(event.target.value);
});

form.addEventListener('submit', handleSubmit);
