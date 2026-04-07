document.addEventListener('DOMContentLoaded', function () {
    const body = document.body;
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenuDrawer = document.getElementById('mobile-menu');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-nav a, .mobile-menu-actions a');
    const billingToggleButtons = document.querySelectorAll('[data-billing-toggle]');
    const familyPicker = document.querySelector('[data-family-picker]');
    const familyCountTrigger = document.getElementById('family-count-trigger');
    const familyCountValue = document.getElementById('family-count-value');
    const familyCountMenu = document.getElementById('family-count-menu');
    const familyCountOptions = document.querySelectorAll('[data-family-count]');
    const lecoPrice = document.getElementById('leco-price');
    const lecoSubline = document.getElementById('leco-subline');
    const lecoNote = document.getElementById('leco-note');
    const familyDescription = document.getElementById('family-description');
    const familyPrice = document.getElementById('family-price');
    const familySubline = document.getElementById('family-subline');
    const familyNote = document.getElementById('family-note');

    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach((item) => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            faqItems.forEach((otherItem) => {
                otherItem.classList.remove('active');
            });

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
        familyPicker &&
        familyCountTrigger &&
        familyCountValue &&
        familyCountMenu &&
        familyCountOptions.length > 0 &&
        lecoPrice &&
        lecoSubline &&
        lecoNote &&
        familyDescription &&
        familyPrice &&
        familySubline &&
        familyNote
    ) {
        const childPricing = {
            mensal: {
                1: 29.9,
                2: 27.9,
                3: 25.9,
                4: 23.9,
                5: 23.9,
                6: 23.9,
                7: 23.9,
                8: 23.9,
            },
            anual: {
                1: 26.9,
                2: 25.9,
                3: 23.9,
                4: 21.9,
                5: 21.9,
                6: 21.9,
                7: 21.9,
                8: 21.9,
            },
        };

        const formatMoney = (value) => value.toFixed(2).replace('.', ',');
        const formatCountLabel = (count) => `${count} ${count === 1 ? 'criança' : 'crianças'}`;
        const closeFamilyPicker = () => {
            familyPicker.classList.remove('is-open');
            familyCountTrigger.setAttribute('aria-expanded', 'false');
            familyCountMenu.hidden = true;
        };

        const openFamilyPicker = () => {
            familyPicker.classList.add('is-open');
            familyCountTrigger.setAttribute('aria-expanded', 'true');
            familyCountMenu.hidden = false;
        };

        let currentBillingMode = 'anual';
        let currentFamilyCount = '4';

        const applyPricingState = () => {
            const selectedMode = childPricing[currentBillingMode] ? currentBillingMode : 'anual';
            const selectedCount = childPricing[selectedMode][currentFamilyCount] ? Number(currentFamilyCount) : 4;

            const lecoMonthlyValue = childPricing[selectedMode][1];
            const lecoAnnualCharge = childPricing.anual[1] * 12;

            lecoPrice.className = 'price';
            lecoPrice.innerHTML = `R$ ${formatMoney(lecoMonthlyValue)}<span>/mês</span>`;
            lecoSubline.textContent = 'por criança';
            lecoNote.textContent = selectedMode === 'anual'
                ? `Cobrança anual de R$ ${formatMoney(lecoAnnualCharge)} por criança no cartão.`
                : `Cobrança mensal de R$ ${formatMoney(lecoMonthlyValue)} por criança no cartão.`;

            const familyPerChildValue = childPricing[selectedMode][selectedCount];
            const familyMonthlyEquivalent = familyPerChildValue * selectedCount;
            const familyAnnualCharge = childPricing.anual[selectedCount] * selectedCount * 12;
            const familyCountLabel = formatCountLabel(selectedCount);

            familyDescription.textContent = `Economia progressiva para famílias com ${familyCountLabel} em um único plano.`;
            familyPrice.className = selectedMode === 'anual' ? 'price price-installment' : 'price';
            familyPrice.innerHTML = selectedMode === 'anual'
                ? `<span class="price-prefix">12x de</span>R$ ${formatMoney(familyMonthlyEquivalent)}<span>/mês</span>`
                : `R$ ${formatMoney(familyMonthlyEquivalent)}<span>/mês</span>`;
            familySubline.textContent = `equivale a R$ ${formatMoney(familyPerChildValue)} por criança para ${familyCountLabel}`;
            familyNote.textContent = selectedMode === 'anual'
                ? `Cobrança anual de R$ ${formatMoney(familyAnnualCharge)} no cartão.`
                : `Cobrança mensal de R$ ${formatMoney(familyMonthlyEquivalent)} no cartão.`;

            billingToggleButtons.forEach((button) => {
                const isActive = button.dataset.billingToggle === selectedMode;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });

            familyCountValue.textContent = familyCountLabel;
            familyCountOptions.forEach((option) => {
                const isActive = option.dataset.familyCount === String(selectedCount);
                option.classList.toggle('is-active', isActive);
                option.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        };

        billingToggleButtons.forEach((button) => {
            button.addEventListener('click', () => {
                currentBillingMode = button.dataset.billingToggle;
                applyPricingState();
            });
        });

        familyCountTrigger.addEventListener('click', () => {
            if (familyPicker.classList.contains('is-open')) {
                closeFamilyPicker();
                return;
            }

            openFamilyPicker();
        });

        familyCountOptions.forEach((option) => {
            option.addEventListener('click', () => {
                currentFamilyCount = option.dataset.familyCount;
                applyPricingState();
                closeFamilyPicker();
            });
        });

        document.addEventListener('click', (event) => {
            if (!familyPicker.contains(event.target)) {
                closeFamilyPicker();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeFamilyPicker();
            }
        });

        applyPricingState();
    }
});
