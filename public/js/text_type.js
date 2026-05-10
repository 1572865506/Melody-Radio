/**
 * text_type.js - Vanilla JS Port of TextType from React Bits
 */
const TextType = {
  /**
   * Initialize a TextType instance on a container
   * @param {HTMLElement} container 
   * @param {Object} options 
   */
  init(container, options = {}) {
    if (!container) return null;

    const defaults = {
      text: [], // string or array of strings
      typingSpeed: 50,
      initialDelay: 0,
      pauseDuration: 2000,
      deletingSpeed: 30,
      loop: true,
      className: '',
      showCursor: true,
      hideCursorWhileTyping: false,
      cursorCharacter: '|',
      cursorBlinkDuration: 0.5,
      cursorClassName: '',
      textColors: [],
      variableSpeed: null, // { min, max }
      onSentenceComplete: null,
      startOnVisible: false,
      reverseMode: false,
    };

    const p = { ...defaults, ...options };
    const textArray = Array.isArray(p.text) ? p.text : [p.text];
    
    // State
    let displayedText = '';
    let currentCharIndex = 0;
    let isDeleting = false;
    let currentTextIndex = 0;
    let isVisible = !p.startOnVisible;
    let timeout = null;

    // Build DOM
    container.classList.add('text-type');
    if (p.className) container.classList.add(p.className);
    
    container.innerHTML = `<span class="text-type__content"></span>`;
    const contentEl = container.querySelector('.text-type__content');
    
    let cursorEl = null;
    if (p.showCursor) {
      cursorEl = document.createElement('span');
      cursorEl.className = `text-type__cursor ${p.cursorClassName}`;
      cursorEl.textContent = p.cursorCharacter;
      
      // Cursor animation with GSAP
      if (window.gsap) {
        gsap.to(cursorEl, {
          opacity: 0,
          duration: p.cursorBlinkDuration,
          repeat: -1,
          yoyo: true,
          ease: 'power2.inOut'
        });
      }
    }

    const getRandomSpeed = () => {
      if (!p.variableSpeed) return p.typingSpeed;
      const { min, max } = p.variableSpeed;
      return Math.random() * (max - min) + min;
    };

    const updateUI = () => {
      contentEl.textContent = displayedText;
      if (cursorEl) {
        contentEl.appendChild(cursorEl);
        if (p.hideCursorWhileTyping) {
          const isCurrentlyTyping = currentCharIndex < textArray[currentTextIndex].length || isDeleting;
          cursorEl.style.display = isCurrentlyTyping ? 'none' : 'inline';
        }
      }
      
      if (p.textColors.length > 0) {
        contentEl.style.color = p.textColors[currentTextIndex % p.textColors.length];
      }
    };

    const executeTypingAnimation = () => {
      const currentFullText = textArray[currentTextIndex];
      const processedText = p.reverseMode ? currentFullText.split('').reverse().join('') : currentFullText;

      if (isDeleting) {
        if (displayedText === '') {
          isDeleting = false;
          
          if (currentTextIndex === textArray.length - 1 && !p.loop) {
            return; // End of typing
          }

          if (p.onSentenceComplete) {
            p.onSentenceComplete(textArray[currentTextIndex], currentTextIndex);
          }

          currentTextIndex = (currentTextIndex + 1) % textArray.length;
          currentCharIndex = 0;
          timeout = setTimeout(executeTypingAnimation, p.pauseDuration);
        } else {
          displayedText = displayedText.slice(0, -1);
          updateUI();
          timeout = setTimeout(executeTypingAnimation, p.deletingSpeed);
        }
      } else {
        if (currentCharIndex < processedText.length) {
          displayedText += processedText[currentCharIndex];
          updateUI();
          currentCharIndex++;
          
          const speed = p.variableSpeed ? getRandomSpeed() : p.typingSpeed;
          timeout = setTimeout(executeTypingAnimation, speed);
        } else if (textArray.length >= 1) {
          if (!p.loop && currentTextIndex === textArray.length - 1) return;
          
          timeout = setTimeout(() => {
            isDeleting = true;
            executeTypingAnimation();
          }, p.pauseDuration);
        }
      }
    };

    const start = () => {
      if (currentCharIndex === 0 && !isDeleting && displayedText === '') {
        timeout = setTimeout(executeTypingAnimation, p.initialDelay);
      } else {
        executeTypingAnimation();
      }
    };

    if (p.startOnVisible) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            isVisible = true;
            start();
            observer.disconnect();
          }
        });
      }, { threshold: 0.1 });
      observer.observe(container);
    } else {
      start();
    }

    return {
      destroy: () => {
        if (timeout) clearTimeout(timeout);
        if (cursorEl && window.gsap) gsap.killTweensOf(cursorEl);
      },
      updateText: (newText) => {
        if (timeout) clearTimeout(timeout);
        p.text = newText;
        const newTextArray = Array.isArray(newText) ? newText : [newText];
        // Reset
        displayedText = '';
        currentCharIndex = 0;
        isDeleting = false;
        currentTextIndex = 0;
        executeTypingAnimation();
      }
    };
  }
};
