/**
 * magic_rings.js - Vanilla JS Port of MagicRings from React Bits
 */

const MagicRings = {
  instance: null,

  init(container, options = {}) {
    if (!container || !window.THREE) return null;

    const defaults = {
      color: '#fc42ff',
      colorTwo: '#42fcff',
      speed: 1,
      ringCount: 6,
      attenuation: 10,
      lineThickness: 2,
      baseRadius: 0.35,
      radiusStep: 0.1,
      scaleRate: 0.1,
      opacity: 1,
      blur: 0,
      noiseAmount: 0.1,
      rotation: 0,
      ringGap: 1.5,
      fadeIn: 0.7,
      fadeOut: 0.5,
      followMouse: false,
      mouseInfluence: 0.2,
      hoverScale: 1.2,
      parallax: 0.05,
      clickBurst: false,
    };

    const p = { ...defaults, ...options };
    
    const vertexShader = `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      uniform float uTime, uAttenuation, uLineThickness;
      uniform float uBaseRadius, uRadiusStep, uScaleRate;
      uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
      uniform float uFadeIn, uFadeOut;
      uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;
      uniform vec2 uResolution, uMouse;
      uniform vec3 uColor, uColorTwo;
      uniform int uRingCount;

      const float HP = 1.5707963;
      const float CYCLE = 3.45;

      float fade(float t) {
        return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t);
      }

      float ring(vec2 p, float ri, float cut, float t0, float px) {
        float t = mod(uTime + t0, CYCLE);
        float r = ri + t / CYCLE * uScaleRate;
        float d = abs(length(p) - r);
        float a = atan(abs(p.y), abs(p.x)) / HP;
        float th = max(1.0 - a, 0.5) * px * uLineThickness;
        float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
        d += pow(cut * a, 3.0) * r;
        return h * exp(-uAttenuation * d) * fade(t);
      }

      void main() {
        float px = 1.0 / min(uResolution.x, uResolution.y);
        vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) * px;
        float cr = cos(uRotation), sr = sin(uRotation);
        p = mat2(cr, -sr, sr, cr) * p;
        p -= uMouse * uMouseInfluence;
        float sc = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.3;
        p /= sc;
        vec3 c = vec3(0.0);
        float rcf = max(float(uRingCount) - 1.0, 1.0);
        for (int i = 0; i < 10; i++) {
          if (i >= uRingCount) break;
          float fi = float(i);
          vec2 pr = p - fi * uParallax * uMouse;
          vec3 rc = mix(uColor, uColorTwo, fi / rcf);
          c = mix(c, rc, vec3(ring(pr, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 2.95 * fi, px)));
        }
        c *= 1.0 + uBurst * 2.0;
        float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
        c += (n - 0.5) * uNoiseAmount;
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)) * uOpacity);
      }
    `;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (e) {
      return null;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;

    const uniforms = {
      uTime: { value: 0 },
      uAttenuation: { value: p.attenuation },
      uResolution: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color(p.color) },
      uColorTwo: { value: new THREE.Color(p.colorTwo) },
      uLineThickness: { value: p.lineThickness },
      uBaseRadius: { value: p.baseRadius },
      uRadiusStep: { value: p.radiusStep },
      uScaleRate: { value: p.scaleRate },
      uRingCount: { value: p.ringCount },
      uOpacity: { value: p.opacity },
      uNoiseAmount: { value: p.noiseAmount },
      uRotation: { value: (p.rotation * Math.PI) / 180 },
      uRingGap: { value: p.ringGap },
      uFadeIn: { value: p.fadeIn },
      uFadeOut: { value: p.fadeOut },
      uMouse: { value: new THREE.Vector2() },
      uMouseInfluence: { value: p.followMouse ? p.mouseInfluence : 0 },
      uHoverAmount: { value: 0 },
      uHoverScale: { value: p.hoverScale },
      uParallax: { value: p.parallax },
      uBurst: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    scene.add(quad);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio, 2);
      renderer.setSize(w, h);
      renderer.setPixelRatio(dpr);
      uniforms.uResolution.value.set(w * dpr, h * dpr);
    };
    resize();
    
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let mouse = [0, 0];
    let smoothMouse = [0, 0];
    let isHovered = false;
    let hoverAmount = 0;
    let burst = 0;

    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouse[0] = (e.clientX - rect.left) / rect.width - 0.5;
      mouse[1] = -((e.clientY - rect.top) / rect.height - 0.5);
    };
    const onMouseEnter = () => { isHovered = true; };
    const onMouseLeave = () => {
      isHovered = false;
      mouse[0] = 0;
      mouse[1] = 0;
    };
    const onClick = () => { burst = 1; };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('click', onClick);

    if (p.blur > 0) {
      container.style.filter = `blur(${p.blur}px)`;
    }

    let frameId;
    const animate = (t) => {
      frameId = requestAnimationFrame(animate);

      smoothMouse[0] += (mouse[0] - smoothMouse[0]) * 0.08;
      smoothMouse[1] += (mouse[1] - smoothMouse[1]) * 0.08;
      hoverAmount += ((isHovered ? 1 : 0) - hoverAmount) * 0.08;
      burst *= 0.92; // Slightly faster fade for burst
      if (burst < 0.001) burst = 0;

      uniforms.uTime.value = t * 0.001 * p.speed;
      uniforms.uMouse.value.set(smoothMouse[0], smoothMouse[1]);
      uniforms.uHoverAmount.value = hoverAmount;
      uniforms.uBurst.value = p.clickBurst ? burst : 0;

      // Read CSS variables for dynamic coloring
      const style = getComputedStyle(container);
      const c1 = style.getPropertyValue('--ring-color-1').trim();
      const c2 = style.getPropertyValue('--ring-color-2').trim();
      if (c1) uniforms.uColor.value.set(c1);
      if (c2) uniforms.uColorTwo.value.set(c2);

      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(animate);

    const instance = {
      handleExternalMouseMove: (clientX, clientY) => {
        const rect = container.getBoundingClientRect();
        mouse[0] = (clientX - rect.left) / rect.width - 0.5;
        mouse[1] = -((clientY - rect.top) / rect.height - 0.5);
      },
      handleExternalClick: () => {
        burst = 1;
      },
      setHover: (hover) => {
        isHovered = hover;
      },
      destroy: () => {
        cancelAnimationFrame(frameId);
        ro.disconnect();
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mouseenter', onMouseEnter);
        container.removeEventListener('mouseleave', onMouseLeave);
        container.removeEventListener('click', onClick);
        if (renderer.domElement.parentNode) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
        material.dispose();
      }
    };
    
    MagicRings.instance = instance;
    return instance;
  }
};
