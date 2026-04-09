const SUPPORT_CATEGORIES = new Set([
    'problemas-tecnicos',
    'acesso-e-conta',
    'assinatura-e-planos',
    'outros-assuntos',
]);

const supportForm = document.getElementById('support-form');
const formState = document.getElementById('form-state');
const successState = document.getElementById('success-state');
const successDetails = document.getElementById('success-details');
const supportProtocol = document.getElementById('support-protocol');
const feedback = document.getElementById('form-feedback');
const submitButton = document.getElementById('submit-button');
const celularInput = document.getElementById('celular');
const backendNotice = document.getElementById('backend-notice');

function formatCelular(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function collectFormData() {
    return {
        nome: document.getElementById('nome').value.trim(),
        email: document.getElementById('email').value.trim(),
        celular: document.getElementById('celular').value.trim(),
        categoria: document.getElementById('categoria').value,
        descricao: document.getElementById('descricao').value.trim(),
        aceite_termos: document.getElementById('aceite_termos').checked,
    };
}

function clearErrors() {
    document.querySelectorAll('[data-error-for]').forEach((item) => {
        item.textContent = '';
    });
    document.querySelectorAll('.support-field, .support-terms').forEach((item) => {
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
            const terms = document.querySelector('.support-terms');
            if (terms) terms.classList.add('has-error');
            return;
        }

        const container = fieldElement ? fieldElement.closest('.support-field') : null;
        if (container) {
            container.classList.add('has-error');
        }
    });
}

function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `support-feedback ${type}`;
    feedback.classList.remove('is-hidden');
}

function hideFeedback() {
    feedback.textContent = '';
    feedback.className = 'support-feedback is-hidden';
}

function showBackendNotice(message) {
    backendNotice.textContent = message;
    backendNotice.classList.remove('is-hidden');
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Enviando seu chamado...' : 'Enviar chamado';
}

function renderSuccessState(result) {
    formState.classList.add('is-hidden');
    successState.classList.remove('is-hidden');
    supportProtocol.textContent = result.protocolo || '--';
    successDetails.textContent = 'Você receberá a resposta no e-mail informado. Guarde o número do protocolo para futuras referências.';
}

function validateForm(data) {
    const errors = {};

    if (!data.nome || data.nome.length < 3) {
        errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = ['Informe um e-mail válido.'];
    }
    if (data.celular && !/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(data.celular)) {
        errors.celular = ['Use o formato (11) 99999-9999.'];
    }
    if (!SUPPORT_CATEGORIES.has(data.categoria)) {
        errors.categoria = ['Selecione o assunto do chamado.'];
    }
    if (!data.descricao || data.descricao.length < 20) {
        errors.descricao = ['Descreva a solicitação com pelo menos 20 caracteres.'];
    }
    if (!data.aceite_termos) {
        errors.aceite_termos = ['Você precisa concordar com os termos para continuar.'];
    }

    return errors;
}

async function loadStatus() {
    try {
        const response = await fetch('/api/suporte', { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok || data.backend_configured === false) {
            showBackendNotice('No momento estamos finalizando este canal. Se precisar, envie um e-mail para suporte@lecoapp.com.br.');
        }
    } catch (error) {
        console.error(error);
        showBackendNotice('No momento estamos finalizando este canal. Se precisar, envie um e-mail para suporte@lecoapp.com.br.');
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    clearErrors();
    hideFeedback();

    const data = collectFormData();
    const errors = validateForm(data);

    if (Object.keys(errors).length > 0) {
        showFieldErrors(errors);
        showFeedback('Revise os campos obrigatórios e verifique se as informações foram preenchidas corretamente.', 'error');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/api/suporte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.status === 'validacao' && result.errors) {
            showFieldErrors(result.errors);
            showFeedback('Revise os campos obrigatórios e verifique se as informações foram preenchidas corretamente.', 'error');
            return;
        }

        if (!response.ok) {
            showFeedback(result.mensagem || 'Não foi possível concluir seu cadastro agora. Tente novamente em instantes.', 'error');
            return;
        }

        renderSuccessState(result);
    } catch (error) {
        console.error(error);
        showFeedback('Houve uma instabilidade ao enviar seus dados. Tente novamente em alguns instantes.', 'error');
    } finally {
        setLoading(false);
    }
}

celularInput.addEventListener('input', (event) => {
    event.target.value = formatCelular(event.target.value);
});

supportForm.addEventListener('submit', handleSubmit);

loadStatus();
