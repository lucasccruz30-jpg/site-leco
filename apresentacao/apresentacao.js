const ESTADOS = new Set([
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const TIPOS_INSTITUICAO = new Set([
    'escola-privada',
    'escola-publica',
    'rede-de-ensino',
    'instituicao-social',
    'outro',
]);

const form = document.getElementById('request-form');
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
        cargo: document.getElementById('cargo').value.trim(),
        instituicao: document.getElementById('instituicao').value.trim(),
        email: document.getElementById('email').value.trim(),
        celular: document.getElementById('celular').value.trim(),
        tipo_instituicao: document.getElementById('tipo_instituicao').value,
        quantidade_alunos: document.getElementById('quantidade_alunos').value,
        cidade: document.getElementById('cidade').value.trim(),
        estado: document.getElementById('estado').value,
        mensagem: document.getElementById('mensagem').value.trim(),
        aceite_contato: document.getElementById('aceite_contato').checked,
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

        if (field === 'aceite_contato') {
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
    submitButton.textContent = isLoading ? 'Enviando...' : 'Solicitar apresentacao';
}

function renderSuccessState(emailStatus) {
    formState.classList.add('is-hidden');
    successState.classList.remove('is-hidden');

    if (emailStatus === 'enviado') {
        successCopy.textContent = 'Sua solicitacao foi recebida e um e-mail de confirmacao ja foi enviado. Em breve nosso time entrara em contato.';
        return;
    }

    successCopy.textContent = 'Sua solicitacao foi recebida com sucesso. Em breve nosso time entrara em contato.';
}

function validateForm(data) {
    const errors = {};
    const quantidadeAlunos = Number(data.quantidade_alunos);

    if (!data.nome || data.nome.length < 3) {
        errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
    }
    if (!data.cargo || data.cargo.length < 2) {
        errors.cargo = ['Informe o cargo ou funcao responsavel pela solicitacao.'];
    }
    if (!data.instituicao || data.instituicao.length < 2) {
        errors.instituicao = ['Informe o nome da instituicao.'];
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = ['Informe um e-mail valido.'];
    }
    if (!/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(data.celular)) {
        errors.celular = ['Use o formato (11) 99999-9999.'];
    }
    if (!TIPOS_INSTITUICAO.has(data.tipo_instituicao)) {
        errors.tipo_instituicao = ['Selecione o tipo de instituicao.'];
    }
    if (!Number.isInteger(quantidadeAlunos) || quantidadeAlunos < 1 || quantidadeAlunos > 50000) {
        errors.quantidade_alunos = ['Informe um numero inteiro entre 1 e 50000.'];
    }
    if (!data.cidade || data.cidade.length < 2) {
        errors.cidade = ['Informe a cidade da instituicao.'];
    }
    if (!ESTADOS.has(data.estado)) {
        errors.estado = ['Selecione um estado valido.'];
    }
    if (!data.mensagem || data.mensagem.length < 20) {
        errors.mensagem = ['Descreva o contexto da solicitacao com pelo menos 20 caracteres.'];
    }
    if (data.mensagem.length > 1500) {
        errors.mensagem = ['Resuma a mensagem em ate 1500 caracteres.'];
    }
    if (!data.aceite_contato) {
        errors.aceite_contato = ['Voce precisa autorizar o contato para continuar.'];
    }

    return errors;
}

async function loadStatus() {
    try {
        const response = await fetch('/api/apresentacao', { cache: 'no-store' });
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
        const response = await fetch('/api/apresentacao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                quantidade_alunos: Number(data.quantidade_alunos),
            }),
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
