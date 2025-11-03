document.addEventListener('DOMContentLoaded', () => {
    const landingPage = document.getElementById('landing-page');
    if (!landingPage) return; // Se não houver a div principal, não faz nada

    // --- Carrossel de Imagens de Fundo ---
    // CORREÇÃO: Substituímos os links quebrados por caminhos locais.
    const images = [
        '/imagens/carrossel/jogo1.jpg',
        '/imagens/carrossel/jogo2.jpg',
        '/imagens/carrossel/jogo3.jpg'
    ];
    let currentImageIndex = 0;

    function changeBackgroundImage() {
        if (images.length === 0) return;
        landingPage.style.backgroundImage = `url('${images[currentImageIndex]}')`;
        currentImageIndex = (currentImageIndex + 1) % images.length;
    }

    if (images.length > 0) {
        changeBackgroundImage();
        setInterval(changeBackgroundImage, 7000);
    }

    // --- Efeito Máquina de Escrever (Apenas para a página inicial) ---
    const typewriterElement = document.getElementById('typewriter');
    // SÓ EXECUTA O CÓTODO SE O ELEMENTO EXISTIR
    if (typewriterElement) {
        const texts = [
            "Encontre o squad perfeito.",
            "Comunicação em tempo real.",
            "Descubra novos jogos e amigos.",
        ];
        let textIndex = 0;
        let charIndex = 0;
        let isDeleting = false;

        function typeWriter() {
            const currentText = texts[textIndex];
            if (isDeleting) {
                typewriterElement.textContent = currentText.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typewriterElement.textContent = currentText.substring(0, charIndex + 1);
                charIndex++;
            }

            if (!isDeleting && charIndex === currentText.length) {
                isDeleting = true;
                setTimeout(typeWriter, 2000);
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                textIndex = (textIndex + 1) % texts.length;
                setTimeout(typeWriter, 500);
            } else {
                const typingSpeed = isDeleting ? 50 : 120;
                setTimeout(typeWriter, typingSpeed);
            }
        }
        typeWriter();
    }
});