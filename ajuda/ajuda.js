const KNOWLEDGE_CATEGORIES = [
    { key: 'all', label: 'Todas' },
    { key: 'conta-e-acesso', label: 'Conta e acesso' },
    { key: 'assinatura', label: 'Assinatura' },
    { key: 'uso-do-app', label: 'Uso do app' },
    { key: 'problemas-comuns', label: 'Problemas comuns' },
];

const KNOWLEDGE_ARTICLES = [
    {
        id: 'recuperar-acesso',
        category: 'conta-e-acesso',
        categoryLabel: 'Conta e acesso',
        title: 'Como recuperar o acesso à sua conta',
        excerpt: 'Veja os passos mais rápidos para voltar a acessar sua conta com segurança.',
        searchTerms: ['senha', 'login', 'entrar', 'acesso', 'recuperar'],
        content: [
            {
                type: 'paragraph',
                text: 'Se você perdeu o acesso à conta, comece conferindo se o e-mail informado no login é o mesmo cadastrado no LECO.',
            },
            {
                type: 'list',
                items: [
                    'Use a opção de recuperação de acesso disponível na tela de login.',
                    'Verifique a caixa de entrada e também a pasta de spam ou promoções.',
                    'Se o e-mail não chegar, confira se não houve erro de digitação no endereço informado.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Se mesmo assim o acesso não for restabelecido, abra um chamado no suporte informando o e-mail da conta e o que já foi tentado.',
            },
        ],
    },
    {
        id: 'nao-recebi-email',
        category: 'conta-e-acesso',
        categoryLabel: 'Conta e acesso',
        title: 'Não recebi o e-mail de confirmação ou acesso',
        excerpt: 'Entenda o que verificar antes de acionar o suporte.',
        searchTerms: ['email', 'confirmacao', 'spam', 'codigo', 'mensagem'],
        content: [
            {
                type: 'paragraph',
                text: 'Em muitos casos, o e-mail pode levar alguns minutos para chegar ou ser direcionado para outra pasta da sua caixa postal.',
            },
            {
                type: 'list',
                items: [
                    'Confirme se o endereço informado está correto.',
                    'Procure a mensagem nas pastas de spam, lixo eletrônico e promoções.',
                    'Espere alguns minutos e tente solicitar novamente apenas uma vez.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Se a mensagem não chegar, abra um chamado com o e-mail usado na tentativa para que o time possa verificar.',
            },
        ],
    },
    {
        id: 'como-funciona-assinatura',
        category: 'assinatura',
        categoryLabel: 'Assinatura',
        title: 'Como funciona a assinatura do LECO',
        excerpt: 'Resumo do modelo de acesso, renovação e acompanhamento do plano.',
        searchTerms: ['assinatura', 'plano', 'renovacao', 'cobranca'],
        content: [
            {
                type: 'paragraph',
                text: 'A assinatura do LECO libera o acesso às funcionalidades conforme o plano contratado. O valor, a forma de pagamento e a regra de renovação dependem da oferta ativa no momento da contratação.',
            },
            {
                type: 'paragraph',
                text: 'Sempre que houver cobrança recorrente ou renovação programada, recomendamos acompanhar as informações do plano e guardar os comprovantes de contratação.',
            },
            {
                type: 'paragraph',
                text: 'Se você tiver dúvida sobre cobrança, período contratado ou status do plano, abra um chamado e informe o e-mail da conta.',
            },
        ],
    },
    {
        id: 'cancelar-ou-alterar-plano',
        category: 'assinatura',
        categoryLabel: 'Assinatura',
        title: 'Como cancelar ou alterar o plano',
        excerpt: 'Saiba quando o suporte deve ser acionado e quais dados ajudam nessa solicitação.',
        searchTerms: ['cancelar', 'plano', 'trocar', 'assinatura', 'upgrade'],
        content: [
            {
                type: 'paragraph',
                text: 'Mudanças de plano, cancelamento e dúvidas de cobrança devem ser tratadas pelo canal oficial de suporte para garantir rastreabilidade do pedido.',
            },
            {
                type: 'list',
                items: [
                    'Informe o e-mail da conta principal.',
                    'Explique se deseja cancelar, ajustar ou revisar a assinatura.',
                    'Se possível, inclua o contexto da cobrança ou do plano atual.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Quanto mais completo for o chamado, mais rápido o time consegue analisar e orientar o próximo passo.',
            },
        ],
    },
    {
        id: 'acompanhar-rotina',
        category: 'uso-do-app',
        categoryLabel: 'Uso do app',
        title: 'Como acompanhar rotina, tarefas e recompensas',
        excerpt: 'Entenda como o LECO organiza o dia a dia da família de forma visual.',
        searchTerms: ['rotina', 'tarefas', 'recompensas', 'metas', 'acompanhar'],
        content: [
            {
                type: 'paragraph',
                text: 'O LECO foi pensado para concentrar combinados, tarefas e evolução da criança em uma experiência simples para a família acompanhar.',
            },
            {
                type: 'list',
                items: [
                    'Use tarefas e objetivos para dar clareza ao que precisa ser feito.',
                    'Acompanhe a evolução para entender constância e progresso.',
                    'Utilize recompensas e combinados de forma coerente com a rotina da casa.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Se você estiver em dúvida sobre como configurar o fluxo ideal, abra um chamado com o contexto da sua família e o objetivo principal de uso.',
            },
        ],
    },
    {
        id: 'gerenciar-perfis',
        category: 'uso-do-app',
        categoryLabel: 'Uso do app',
        title: 'Como organizar o uso para mais de uma criança',
        excerpt: 'Boas práticas para acompanhar mais de um perfil sem perder clareza.',
        searchTerms: ['criancas', 'perfil', 'familia', 'conta', 'gerenciar'],
        content: [
            {
                type: 'paragraph',
                text: 'O LECO pode ser usado para acompanhar múltiplas crianças na mesma gestão familiar, mantendo mais organização entre tarefas, objetivos e acompanhamento.',
            },
            {
                type: 'list',
                items: [
                    'Mantenha identificações claras por criança.',
                    'Evite misturar objetivos muito diferentes no mesmo fluxo.',
                    'Use o acompanhamento de forma individual, mesmo dentro da visão familiar.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Se precisar de apoio para estruturar a conta da família, o suporte pode orientar o melhor formato.',
            },
        ],
    },
    {
        id: 'app-nao-carrega',
        category: 'problemas-comuns',
        categoryLabel: 'Problemas comuns',
        title: 'O app não carrega ou ficou lento',
        excerpt: 'Veja verificações simples antes de abrir um chamado técnico.',
        searchTerms: ['lento', 'carregando', 'travando', 'erro', 'app'],
        content: [
            {
                type: 'paragraph',
                text: 'Algumas falhas temporárias podem ser resolvidas com verificações rápidas, principalmente quando há oscilação de conexão ou atualização do app.',
            },
            {
                type: 'list',
                items: [
                    'Feche e abra o aplicativo novamente.',
                    'Confirme se sua conexão com a internet está estável.',
                    'Verifique se há atualização pendente do app.',
                    'Tente repetir a ação alguns minutos depois.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Se o problema continuar, abra um chamado informando o que aconteceu, em qual tela ocorreu e se a falha se repete.',
            },
        ],
    },
    {
        id: 'chamado-bem-descrito',
        category: 'problemas-comuns',
        categoryLabel: 'Problemas comuns',
        title: 'O que enviar para o suporte analisar mais rápido',
        excerpt: 'Descubra quais informações ajudam nosso time a atender seu caso com mais agilidade.',
        searchTerms: ['suporte', 'chamado', 'descricao', 'print', 'ajuda'],
        content: [
            {
                type: 'paragraph',
                text: 'Quando um chamado vem bem descrito, o tempo de análise tende a ser menor e a resposta fica mais objetiva.',
            },
            {
                type: 'list',
                items: [
                    'Explique o que aconteceu e quando aconteceu.',
                    'Informe o e-mail da conta e, se possível, o celular de contato.',
                    'Diga se o problema acontece sempre ou apenas em uma situação específica.',
                    'Se houver print, imagem ou contexto adicional, mencione isso no chamado.',
                ],
            },
            {
                type: 'paragraph',
                text: 'Esse cuidado ajuda a equipe a entender o cenário real antes de responder.',
            },
        ],
    },
];

const categoryContainer = document.getElementById('knowledge-categories');
const searchInput = document.getElementById('knowledge-search');
const articlesContainer = document.getElementById('knowledge-articles');
const resultsLabel = document.getElementById('knowledge-results');
const emptyState = document.getElementById('knowledge-empty');

let activeCategory = 'all';

function normalizeText(value) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function buildSearchText(article) {
    const contentText = article.content
        .map((block) => (block.type === 'list' ? block.items.join(' ') : block.text))
        .join(' ');

    return normalizeText([
        article.title,
        article.excerpt,
        article.categoryLabel,
        article.searchTerms.join(' '),
        contentText,
    ].join(' '));
}

function renderCategories() {
    categoryContainer.innerHTML = '';

    KNOWLEDGE_CATEGORIES.forEach((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `knowledge-category-button${category.key === activeCategory ? ' is-active' : ''}`;
        button.textContent = category.label;
        button.addEventListener('click', () => {
            activeCategory = category.key;
            renderCategories();
            renderArticles();
        });
        categoryContainer.appendChild(button);
    });
}

function createContentBlock(block) {
    if (block.type === 'list') {
        const list = document.createElement('ul');
        block.items.forEach((item) => {
            const listItem = document.createElement('li');
            listItem.textContent = item;
            list.appendChild(listItem);
        });
        return list;
    }

    const paragraph = document.createElement('p');
    paragraph.textContent = block.text;
    return paragraph;
}

function createArticleCard(article) {
    const details = document.createElement('details');
    details.className = 'knowledge-article support-card';

    const summary = document.createElement('summary');
    const summaryShell = document.createElement('div');
    summaryShell.className = 'knowledge-article-summary';

    const topline = document.createElement('div');
    topline.className = 'knowledge-article-topline';

    const category = document.createElement('span');
    category.className = 'knowledge-category-pill';
    category.textContent = article.categoryLabel;

    const openLabel = document.createElement('span');
    openLabel.className = 'knowledge-open-label';
    openLabel.textContent = 'Ler artigo';

    topline.append(category, openLabel);

    const title = document.createElement('h3');
    title.textContent = article.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt;

    summaryShell.append(topline, title, excerpt);
    summary.appendChild(summaryShell);

    const body = document.createElement('div');
    body.className = 'knowledge-article-body';
    article.content.forEach((block) => {
        body.appendChild(createContentBlock(block));
    });

    details.append(summary, body);
    return details;
}

function getFilteredArticles() {
    const query = normalizeText(searchInput.value);

    return KNOWLEDGE_ARTICLES.filter((article) => {
        const matchesCategory = activeCategory === 'all' || article.category === activeCategory;
        if (!matchesCategory) return false;

        if (!query) return true;

        return buildSearchText(article).includes(query);
    });
}

function renderArticles() {
    const filtered = getFilteredArticles();
    articlesContainer.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.classList.remove('is-hidden');
    } else {
        emptyState.classList.add('is-hidden');
        filtered.forEach((article) => {
            articlesContainer.appendChild(createArticleCard(article));
        });
    }

    const articleWord = filtered.length === 1 ? 'artigo encontrado' : 'artigos encontrados';
    resultsLabel.textContent = `${filtered.length} ${articleWord}`;
}

searchInput.addEventListener('input', renderArticles);

renderCategories();
renderArticles();
