(function () {
    function normalizePath(pathname) {
        if (!pathname || pathname === '/index.html') {
            return '/';
        }

        return pathname.endsWith('/') ? pathname : `${pathname}/`;
    }

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function getCampaignTopbarHeight() {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue('--campaign-topbar-height')
            .trim()
            .replace('px', '');
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function getStickyOffset() {
        const stickyShell = document.querySelector('.sticky-top-shell');
        const stickyHeight = stickyShell ? stickyShell.getBoundingClientRect().height : 0;
        return Math.max(0, Math.ceil(stickyHeight + getCampaignTopbarHeight() + 8));
    }

    function scrollToTarget(target, hash) {
        if (!target) {
            return;
        }

        const top = window.scrollY + target.getBoundingClientRect().top - getStickyOffset();
        window.scrollTo({
            top: Math.max(0, top),
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });

        if (typeof hash === 'string') {
            if (hash && hash !== '#') {
                window.history.pushState(null, '', hash);
            } else {
                const cleanUrl = `${window.location.pathname}${window.location.search}`;
                window.history.pushState(null, '', cleanUrl);
            }
        }
    }

    function initMobileMenu() {
        const body = document.body;
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const mobileMenuDrawer = document.getElementById('mobile-menu');
        const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
        const mobileMenuClose = document.querySelector('.mobile-menu-close');
        const mobileMenuLinks = document.querySelectorAll('.mobile-menu-nav a, .mobile-menu-actions a');

        if (!mobileMenuToggle || !mobileMenuDrawer || !mobileMenuOverlay || !mobileMenuClose) {
            return {
                close: function () { },
                isOpen: function () { return false; },
            };
        }

        let lastFocusedElement = null;

        function closeMobileMenu(restoreFocus) {
            body.classList.remove('menu-open');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
            mobileMenuDrawer.setAttribute('aria-hidden', 'true');

            if (restoreFocus && lastFocusedElement instanceof HTMLElement) {
                lastFocusedElement.focus({ preventScroll: true });
            }
        }

        function openMobileMenu() {
            lastFocusedElement = document.activeElement;
            body.classList.add('menu-open');
            mobileMenuToggle.setAttribute('aria-expanded', 'true');
            mobileMenuDrawer.setAttribute('aria-hidden', 'false');

            const firstFocusable = mobileMenuDrawer.querySelector('a, button');
            if (firstFocusable instanceof HTMLElement) {
                firstFocusable.focus({ preventScroll: true });
            }
        }

        mobileMenuToggle.addEventListener('click', function () {
            if (body.classList.contains('menu-open')) {
                closeMobileMenu(true);
                return;
            }

            openMobileMenu();
        });

        mobileMenuClose.addEventListener('click', function () {
            closeMobileMenu(true);
        });

        mobileMenuOverlay.addEventListener('click', function () {
            closeMobileMenu(true);
        });

        mobileMenuLinks.forEach((link) => {
            link.addEventListener('click', function () {
                closeMobileMenu(false);
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && body.classList.contains('menu-open')) {
                closeMobileMenu(true);
            }
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768 && body.classList.contains('menu-open')) {
                closeMobileMenu(false);
            }
        });

        return {
            close: closeMobileMenu,
            isOpen: function () {
                return body.classList.contains('menu-open');
            },
        };
    }

    function initFaqAccordion() {
        const faqItems = document.querySelectorAll('.faq-item');

        faqItems.forEach((item, index) => {
            const question = item.querySelector('.faq-question');
            const answer = item.querySelector('.faq-answer');

            if (!question || !answer) {
                return;
            }

            const answerId = answer.id || `faq-answer-${index + 1}`;
            answer.id = answerId;
            question.setAttribute('role', 'button');
            question.setAttribute('tabindex', '0');
            question.setAttribute('aria-controls', answerId);
            question.setAttribute('aria-expanded', item.classList.contains('active') ? 'true' : 'false');

            function toggleItem() {
                const isActive = item.classList.contains('active');

                faqItems.forEach((otherItem) => {
                    otherItem.classList.remove('active');
                    const otherQuestion = otherItem.querySelector('.faq-question');
                    if (otherQuestion) {
                        otherQuestion.setAttribute('aria-expanded', 'false');
                    }
                });

                if (!isActive) {
                    item.classList.add('active');
                    question.setAttribute('aria-expanded', 'true');
                }
            }

            question.addEventListener('click', toggleItem);
            question.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleItem();
                }
            });
        });
    }

    function initSmoothAnchors(mobileMenuApi) {
        const currentPath = normalizePath(window.location.pathname);

        document.addEventListener('click', function (event) {
            const link = event.target.closest('a[href]');
            if (!link) {
                return;
            }

            const href = link.getAttribute('href');
            if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
                return;
            }

            let url;
            try {
                url = new URL(href, window.location.href);
            } catch (error) {
                return;
            }

            if (url.origin !== window.location.origin) {
                return;
            }

            const targetPath = normalizePath(url.pathname);
            const samePage = targetPath === currentPath;

            if (!samePage) {
                return;
            }

            const isTopLink = href === '#' || (!url.hash && href !== '' && targetPath === currentPath);
            const hash = url.hash;

            if (!isTopLink && !hash) {
                return;
            }

            const target = isTopLink
                ? document.getElementById('hero') || document.body
                : document.querySelector(hash);

            if (!target) {
                return;
            }

            event.preventDefault();

            if (mobileMenuApi && mobileMenuApi.isOpen()) {
                mobileMenuApi.close(false);
            }

            window.requestAnimationFrame(function () {
                scrollToTarget(target, isTopLink ? '' : hash);
            });
        });

        if (window.location.hash) {
            window.setTimeout(function () {
                const target = document.querySelector(window.location.hash);
                if (target) {
                    scrollToTarget(target);
                }
            }, 120);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const mobileMenuApi = initMobileMenu();
        initFaqAccordion();
        initSmoothAnchors(mobileMenuApi);
    });
})();
