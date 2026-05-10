/**
 * effects.js - Variable Proximity Text Effect
 * Ported from React Bits (VariableProximity) to Vanilla JS
 */

const VariableProximity = {
  instances: new Map(),

  init(element, options = {}) {
    if (!element) return;
    
    // Cleanup existing instance for this element
    if (this.instances.has(element)) {
      this.instances.get(element).destroy();
    }

    const {
      fromFontVariationSettings = "'wght' 400, 'opsz' 9",
      toFontVariationSettings = "'wght' 1000, 'opsz' 40",
      radius = 160,
      falloff = 'gaussian',
      className = 'variable-proximity'
    } = options;

    const label = element.textContent;
    element.innerHTML = '';
    element.classList.add(className);

    // Keep it responsive and aligned
    element.style.fontFamily = "'Roboto Flex', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', sans-serif";

    // Improved splitting logic: Split by spaces, but also treat each CJK character as a separate token
    // This allows natural wrapping for Chinese while keeping English words together.
    const tokens = label.split(/(\s+|[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af])/u).filter(Boolean);
    const letterRefs = [];

    tokens.forEach((token) => {
      if (/^\s+$/.test(token)) {
        // Whitespace token
        const space = document.createElement('span');
        space.style.display = 'inline-block';
        space.innerHTML = token.replace(/ /g, '&nbsp;');
        element.appendChild(space);
      } else if (/^[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]$/u.test(token)) {
        // Single CJK character with Layout Stability (Ghost technique)
        const charWrapper = document.createElement('span');
        charWrapper.style.display = 'inline-grid';
        charWrapper.style.gridTemplateColumns = '1fr';
        charWrapper.style.verticalAlign = 'bottom';

        // Invisible ghost at MAX weight to lock the width
        const ghost = document.createElement('span');
        ghost.style.gridArea = '1/1';
        ghost.style.visibility = 'hidden';
        ghost.style.fontFamily = "'Noto Sans SC', sans-serif";
        ghost.style.fontVariationSettings = toFontVariationSettings;
        ghost.textContent = token;
        charWrapper.appendChild(ghost);

        // Actual animating character
        const letterSpan = document.createElement('span');
        letterSpan.style.gridArea = '1/1';
        letterSpan.style.textAlign = 'center';
        letterSpan.textContent = token;
        letterSpan.style.fontFamily = "'Noto Sans SC', sans-serif";
        letterSpan.style.fontVariationSettings = fromFontVariationSettings;
        charWrapper.appendChild(letterSpan);
        
        element.appendChild(charWrapper);
        letterRefs.push(letterSpan);
      } else {
        // English word or other non-CJK sequence
        const wordSpan = document.createElement('span');
        wordSpan.style.display = 'inline-block';
        wordSpan.style.whiteSpace = 'nowrap'; 

        token.split('').forEach(letter => {
          const charWrapper = document.createElement('span');
          charWrapper.style.display = 'inline-grid';
          charWrapper.style.gridTemplateColumns = '1fr';
          charWrapper.style.verticalAlign = 'bottom';

          const ghost = document.createElement('span');
          ghost.style.gridArea = '1/1';
          ghost.style.visibility = 'hidden';
          ghost.style.fontFamily = "'Roboto Flex', sans-serif";
          ghost.style.fontVariationSettings = toFontVariationSettings;
          ghost.textContent = letter;
          charWrapper.appendChild(ghost);

          const letterSpan = document.createElement('span');
          letterSpan.style.gridArea = '1/1';
          letterSpan.style.textAlign = 'center';
          letterSpan.textContent = letter;
          letterSpan.style.fontFamily = "'Roboto Flex', sans-serif";
          letterSpan.style.fontVariationSettings = fromFontVariationSettings;
          charWrapper.appendChild(letterSpan);
          
          wordSpan.appendChild(charWrapper);
          letterRefs.push(letterSpan);
        });

        element.appendChild(wordSpan);
      }
    });

    const parseSettings = (str) => {
      const map = new Map();
      str.split(',').forEach(s => {
        const parts = s.trim().split(' ');
        if (parts.length >= 2) {
          const name = parts[0].replace(/['"]/g, '');
          const val = parseFloat(parts[1]);
          map.set(name, val);
        }
      });
      return map;
    };

    const fromSettings = parseSettings(fromFontVariationSettings);
    const toSettings = parseSettings(toFontVariationSettings);
    const axes = Array.from(fromSettings.keys()).map(axis => ({
      axis,
      from: fromSettings.get(axis),
      to: toSettings.get(axis) ?? fromSettings.get(axis)
    }));

    let mousePos = { x: -9999, y: -9999 };
    const handleMouseMove = (e) => {
      mousePos = { x: e.clientX, y: e.clientY };
    };
    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        mousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    let rafId;
    const update = () => {
      letterRefs.forEach(letter => {
        const lRect = letter.getBoundingClientRect();
        const centerX = lRect.left + lRect.width / 2;
        const centerY = lRect.top + lRect.height / 2;

        const dist = Math.sqrt((mousePos.x - centerX) ** 2 + (mousePos.y - centerY) ** 2);

        if (dist >= radius) {
          letter.style.fontVariationSettings = fromFontVariationSettings;
          return;
        }

        let falloffValue = 0;
        const norm = Math.min(Math.max(1 - dist / radius, 0), 1);
        if (falloff === 'exponential') {
          falloffValue = norm ** 2;
        } else if (falloff === 'gaussian') {
          falloffValue = Math.exp(-((dist / (radius / 2)) ** 2) / 2);
        } else {
          falloffValue = norm;
        }

        const settings = axes.map(a => {
          const val = a.from + (a.to - a.from) * falloffValue;
          return `'${a.axis}' ${val}`;
        }).join(', ');

        letter.style.fontVariationSettings = settings;
      });

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);

    const instance = {
      destroy: () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchmove', handleTouchMove);
        this.instances.delete(element);
      }
    };
    this.instances.set(element, instance);
  }
};
