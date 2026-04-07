document.addEventListener('DOMContentLoaded', function () {
    const body = document.body;
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenuDrawer = document.getElementById('mobile-menu');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-nav a, .mobile-menu-actions a');

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

});
