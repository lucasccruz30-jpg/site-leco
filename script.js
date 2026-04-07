document.addEventListener('DOMContentLoaded', function () {
    const body = document.body;
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenuDrawer = document.getElementById('mobile-menu');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-nav a, .mobile-menu-actions a');
    const billingToggleButtons = document.querySelectorAll('[data-billing-toggle]');
    const lecoPrice = document.getElementById('leco-price');
    const lecoSubline = document.getElementById('leco-subline');
    const lecoNote = document.getElementById('leco-note');
    const familyPrice = document.getElementById('family-price');
    const familySubline = document.getElementById('family-subline');
    const familyNote = document.getElementById('family-note');

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Close all other items
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            // Open the clicked item if it wasn't already active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    if (mobileMenuToggle && mobileMenuDrawer && mobileMenuOverlay && mobileMenuClose) {
        const closeMobileMenu = () => {
            body.classList.remove('menu-open');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
            mobileMenuDrawer.setAttribute('aria-hidden', 'true');
        };

        const openMobileMenu = () => {
            body.classList.add('menu-open');
            mobileMenuToggle.setAttribute('aria-expanded', 'true');
            mobileMenuDrawer.setAttribute('aria-hidden', 'false');
        };

        mobileMenuToggle.addEventListener('click', () => {
            if (body.classList.contains('menu-open')) {
                closeMobileMenu();
                return;
            }

            openMobileMenu();
        });

        mobileMenuClose.addEventListener('click', closeMobileMenu);
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
        mobileMenuLinks.forEach((link) => {
            link.addEventListener('click', closeMobileMenu);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeMobileMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                closeMobileMenu();
            }
        });
    }

    if (
        billingToggleButtons.length > 0 &&
        lecoPrice &&
        lecoSubline &&
        lecoNote &&
        familyPrice &&
        familySubline &&
        familyNote
    ) {
        const billingPlans = {
            mensal: {
                leco: {
                    className: 'price',
                    html: 'R$ 29,90<span>/mês</span>',
                    subline: 'por criança',
                    note: 'Cobrança mensal de R$ 29,90 por criança no cartão.',
                },
                familia: {
                    className: 'price',
                    html: 'R$ 26,90<span>/mês</span>',
                    subline: 'por criança, para famílias com até 4 crianças',
                    note: 'Cobrança mensal no cartão, conforme a quantidade de crianças no plano.',
                },
            },
            anual: {
                leco: {
                    className: 'price',
                    html: 'R$ 26,90<span>/mês</span>',
                    subline: 'por criança',
                    note: 'Cobrança anual de R$ 322,80 por criança no cartão.',
                },
                familia: {
                    className: 'price price-installment',
                    html: '<span class="price-prefix">12x de</span>R$ 91,66<span>/mês</span>',
                    subline: 'para até 4 crianças',
                    note: 'Cobrança anual de R$ 1.099,90 no cartão.',
                },
            },
        };

        const applyBillingMode = (mode) => {
            const selectedMode = billingPlans[mode] ? mode : 'anual';
            const selected = billingPlans[selectedMode];

            lecoPrice.className = selected.leco.className;
            lecoPrice.innerHTML = selected.leco.html;
            lecoSubline.textContent = selected.leco.subline;
            lecoNote.textContent = selected.leco.note;

            familyPrice.className = selected.familia.className;
            familyPrice.innerHTML = selected.familia.html;
            familySubline.textContent = selected.familia.subline;
            familyNote.textContent = selected.familia.note;

            billingToggleButtons.forEach((button) => {
                const isActive = button.dataset.billingToggle === selectedMode;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        };

        billingToggleButtons.forEach((button) => {
            button.addEventListener('click', () => {
                applyBillingMode(button.dataset.billingToggle);
            });
        });

        applyBillingMode('anual');
    }

});
