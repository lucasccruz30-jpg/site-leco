const PERFIS = new Set([
    'familia',
    'escola',
    'outro',
]);

const form = document.getElementById('delete-form');
const formState = document.getElementById('form-state');
const successState = document.getElementById('success-state');
const successCopy = document.getElementById('success-copy');
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
        perfil: document.getElementById('perfil').value,
        referencia: document.getElementById('referencia').value.trim(),
        mensagem: document.getElementById('mensagem').value.trim(),
        confirmacao_exclusao: document.getElementById('confirmacao_exclusao').checked,
    };
}

function clearErrors() {
    document.querySelectorAll('[data-error-for]').forEach((item) => {
        item.textContent = '';
    });
    document.querySelectorAll('.field, .terms').forEach((item) => {
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

        if (field === 'confirmacao_exclusao') {
            const terms = document.querySelector('.terms');
            if (terms) terms.classList.add('has-error');
            return;
        }

        const container = fieldElement ? fieldElement.closest('.field') : null;
        if (container) {
            container.classList.add('has-error');
        }
    });
}

function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `feedback ${type}`;
    feedback.classList.remove('is-hidden');
}

function hideFeedback() {
    feedback.textContent = '';
    feedback.className = 'feedback is-hidden';
}

function showBackendNotice(message) {
    backendNotice.textContent = message;
    backendNotice.classList.remove('is-hidden');
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Enviando...' : 'Solicitar exclusao de dados';
}

function renderSuccessState(emailStatus) {
    formState.classList.add('is-hidden');
    successState.classList.remove('is-hidden');

    if (emailStatus === 'enviado') {
        successCopy.textContent = 'Seu pedido foi recebido e um e-mail de confirmacao ja foi enviado. Nosso time vai validar a solicitacao e seguir com o atendimento.';
        return;
    }

    successCopy.textContent = 'Seu pedido foi recebido com sucesso. Nosso time vai validar a solicitacao e seguir com o atendimento.';
}

function validateForm(data) {
    const errors = {};

    if (!data.nome || data.nome.length < 3) {
        errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = ['Informe um e-mail valido.'];
    }
    if (data.celular && !/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(data.celular)) {
        errors.celular = ['Use o formato (11) 99999-9999.'];
    }
    if (!PERFIS.has(data.perfil)) {
        errors.perfil = ['Selecione o perfil da conta.'];
    }
    if (!data.confirmacao_exclusao) {
        errors.confirmacao_exclusao = ['Voce precisa confirmar a solicitacao de exclusao.'];
    }

    return errors;
}

async function loadStatus() {
    try {
        const response = await fetch('/api/excluir-dados', { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok || data.backend_configured === false) {
            showBackendNotice('No momento estamos finalizando este canal. Se precisar, envie um e-mail para contato@lecoapp.com.br.');
        }
    } catch (error) {
        console.error(error);
        showBackendNotice('No momento estamos finalizando este canal. Se precisar, envie um e-mail para contato@lecoapp.com.br.');
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
        showFeedback('Revise os campos destacados e tente novamente.', 'error');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/api/excluir-dados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.status === 'validacao' && result.errors) {
            showFieldErrors(result.errors);
            showFeedback('Alguns dados precisam ser corrigidos antes do envio.', 'error');
            return;
        }

        if (!response.ok) {
            showFeedback(result.mensagem || 'Nao foi possivel concluir sua solicitacao agora.', 'error');
            return;
        }

        renderSuccessState(result.email_status);
    } catch (error) {
        console.error(error);
        showFeedback('Falha de conexao. Tente novamente em alguns instantes.', 'error');
    } finally {
        setLoading(false);
    }
}

celularInput.addEventListener('input', (event) => {
    event.target.value = formatCelular(event.target.value);
});

form.addEventListener('submit', handleSubmit);

loadStatus();
