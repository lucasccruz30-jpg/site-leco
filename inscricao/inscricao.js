const MAX_VAGAS = 50;
const ESTADOS = new Set([
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const form = document.getElementById('signup-form');
const progressCard = document.getElementById('progress-card');
const progressCount = document.getElementById('progress-count');
const progressBar = document.getElementById('progress-bar');
const progressCaption = document.getElementById('progress-caption');
const backendNotice = document.getElementById('backend-notice');
const formState = document.getElementById('form-state');
const successState = document.getElementById('success-state');
const closedState = document.getElementById('closed-state');
const feedback = document.getElementById('form-feedback');
const submitButton = document.getElementById('submit-button');
const celularInput = document.getElementById('celular');
const valorMesadaGroup = document.getElementById('valor-mesada-group');
const pretendeInvestirGroup = document.getElementById('pretende-investir-group');
const successTitle = document.getElementById('success-title');
const successCopy = document.getElementById('success-copy');

function formatCelular(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function getSelectedMesada() {
    const checked = document.querySelector('input[name="paga_mesada"]:checked');
    return checked ? checked.value : '';
}

function toggleConditionalFields() {
    const pagaMesada = getSelectedMesada();
    valorMesadaGroup.classList.toggle('is-hidden', pagaMesada !== 'sim');
    pretendeInvestirGroup.classList.toggle('is-hidden', pagaMesada !== 'nao');
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
        if (field === 'aceite_termos') {
            const terms = document.querySelector('.terms');
            if (terms) terms.classList.add('has-error');
            return;
        }
        if (field === 'paga_mesada') {
            const radioField = document.querySelector('fieldset.field');
            if (radioField) radioField.classList.add('has-error');
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
    backendNotice.innerHTML = message;
    backendNotice.classList.remove('is-hidden');
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Enviando...' : 'Garantir minha vaga gratuita';
}

function updateProgress(total) {
    const vagasRestantes = Math.max(0, MAX_VAGAS - total);
    const percentual = Math.min(100, (total / MAX_VAGAS) * 100);
    progressCount.textContent = `${total} / ${MAX_VAGAS}`;
    progressBar.style.width = `${percentual}%`;
    progressCaption.textContent = `${vagasRestantes} ${vagasRestantes === 1 ? 'vaga restante' : 'vagas restantes'}`;
}

function renderClosedState() {
    progressCard.classList.add('is-hidden');
    formState.classList.add('is-hidden');
    successState.classList.add('is-hidden');
    closedState.classList.remove('is-hidden');
}

function renderSuccessState(numero) {
    const dentro50 = numero <= MAX_VAGAS;
    progressCard.classList.add('is-hidden');
    formState.classList.add('is-hidden');
    closedState.classList.add('is-hidden');
    successState.classList.remove('is-hidden');
    successTitle.textContent = dentro50 ? 'Vaga garantida!' : 'Cadastro recebido';
    successCopy.textContent = dentro50
        ? `Voce esta na posicao #${numero} da lista e esta entre as 50 familias que receberao 3 meses gratuitos do LECO.`
        : `Voce esta na posicao #${numero} da lista. As vagas foram preenchidas durante o processamento, e seu cadastro ficou na espera.`;
}

function collectFormData() {
    return {
        nome: document.getElementById('nome').value.trim(),
        email: document.getElementById('email').value.trim(),
        celular: document.getElementById('celular').value.trim(),
        quantidade_criancas: document.getElementById('quantidade_criancas').value,
        cidade: document.getElementById('cidade').value.trim(),
        estado: document.getElementById('estado').value,
        paga_mesada: getSelectedMesada(),
        valor_mesada: document.getElementById('valor_mesada').value.trim(),
        pretende_investir: document.getElementById('pretende_investir').value.trim(),
        aceite_termos: document.getElementById('aceite_termos').checked,
    };
}

function validateForm(data) {
    const errors = {};

    if (!data.nome || data.nome.length < 3) {
        errors.nome = ['Informe um nome com pelo menos 3 caracteres.'];
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = ['Informe um e-mail valido.'];
    }
    if (!/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(data.celular)) {
        errors.celular = ['Use o formato (11) 99999-9999.'];
    }

    const quantidade = Number(data.quantidade_criancas);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
        errors.quantidade_criancas = ['Informe um numero inteiro entre 1 e 20.'];
    }
    if (!data.cidade || data.cidade.length < 2) {
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

    return errors;
}

async function loadStatus() {
    try {
        const response = await fetch('/api/inscricao', { cache: 'no-store' });
        const data = await response.json();

        if (data.backend_configured === false) {
            showBackendNotice('A pagina de inscricao ja esta publicada. Para liberar os envios, configure na Vercel a variavel <strong>DATABASE_URL</strong> do Neon.');
        }

        if (!response.ok) {
            throw new Error(data.mensagem || 'Nao foi possivel carregar a disponibilidade.');
        }

        updateProgress(data.total || 0);
        if (data.vagas_esgotadas) {
            renderClosedState();
        }
    } catch (error) {
        updateProgress(0);
        showBackendNotice('Nao foi possivel consultar a disponibilidade agora. A pagina continua publicada, mas o backend precisa ser revisado antes de liberar as inscricoes.');
        console.error(error);
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    clearErrors();
    hideFeedback();
    toggleConditionalFields();

    const data = collectFormData();
    const errors = validateForm(data);
    if (Object.keys(errors).length > 0) {
        showFieldErrors(errors);
        showFeedback('Revise os campos destacados e tente novamente.', 'error');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/api/inscricao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                quantidade_criancas: Number(data.quantidade_criancas),
            }),
        });

        const result = await response.json();

        if (result.status === 'sucesso') {
            renderSuccessState(result.numero);
            return;
        }

        if (result.status === 'vagas_esgotadas') {
            renderClosedState();
            return;
        }

        if (result.status === 'email_duplicado') {
            showFeedback('Este e-mail ja esta cadastrado na campanha.', 'warning');
            return;
        }

        if (result.status === 'validacao' && result.errors) {
            showFieldErrors(result.errors);
            showFeedback('Alguns dados precisam ser corrigidos antes do envio.', 'error');
            return;
        }

        showFeedback(result.mensagem || 'Nao foi possivel concluir seu cadastro agora.', 'error');
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

document.querySelectorAll('input[name="paga_mesada"]').forEach((radio) => {
    radio.addEventListener('change', toggleConditionalFields);
});

form.addEventListener('submit', handleSubmit);

toggleConditionalFields();
loadStatus();
