document.addEventListener('DOMContentLoaded', function () {

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

    // Note: A more complex implementation for a responsive burger menu 
    // would go here, but is omitted for this initial build.

});
