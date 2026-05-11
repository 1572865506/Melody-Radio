/**
 * player.js - 音频播放器控制模块
 */
const Player = {
  audio: null,
  isPlaying: false,
  playMode: 'sequence',
  volume: 0.8,
  audioCtx: null,
  analyser: null,
  dataArray: null,
  els: {},

  init() {
    this.audio = document.getElementById('audioPlayer');
    console.log('Player initializing, audio element:', this.audio);
    this.els = {
      btnPlay: document.getElementById('btnPlay'),
      btnPrev: document.getElementById('btnPrev'),
      btnNext: document.getElementById('btnNext'),
      btnPlayMode: document.getElementById('btnPlayMode'),
      btnPlayModeMobile: document.getElementById('btnPlayMode_mobile'),
      btnMute: document.getElementById('btnMute'),
      progressBar: document.getElementById('progressBar'),
      progressFilled: document.getElementById('progressFilled'),
      progressBuffered: document.getElementById('progressBuffered'),
      progressHandle: document.getElementById('progressHandle'),
      timeCurrent: document.getElementById('timeCurrent'),
      timeTotal: document.getElementById('timeTotal'),
      timeRemaining: document.getElementById('timeRemaining'),
      timerScrubber: document.getElementById('timerScrubber'),
      timerProgress: document.getElementById('timerProgress'),
      timerTooltip: document.getElementById('timerTooltip'),
      volumeBar: document.getElementById('volumeBar'),
      volumeFilled: document.getElementById('volumeFilled'),
      volumeHandle: document.getElementById('volumeHandle'),
      // Hero
      heroTitle: document.getElementById('heroTitle'),
      heroSubtitle: document.getElementById('heroSubtitle'),
      heroBgImg: document.getElementById('heroBgImg'),
      heroCoverImg: document.getElementById('heroCoverImg'),
      // AI Host Section
      aiHostContainer: document.getElementById('aiHostContainer'),
      aiPlaceholder: document.getElementById('aiPlaceholder'),
      // Mini Player Bar
      miniTitle: document.getElementById('miniTitle'),
      miniArtist: document.getElementById('miniArtist'),
      miniCover: document.getElementById('miniCover'),
      // Dynamic Background
      dynamicBackground: document.getElementById('dynamicBgImg'),
      // Icons
      iconsPlay: document.querySelectorAll('.icon-play'),
      iconsPause: document.querySelectorAll('.icon-pause'),
      iconVolume: document.querySelector('.icon-volume'),
      iconMuted: document.querySelector('.icon-muted'),
      iconsSequence: document.querySelectorAll('.play-mode-icon.sequence'),
      iconsShuffle: document.querySelectorAll('.play-mode-icon.shuffle'),
      iconsRepeatOne: document.querySelectorAll('.play-mode-icon.repeat-one'),
      // Waveform
      waveformContainer: document.getElementById('waveformContainer'),
      dockWaveform: document.getElementById('dockWaveform'),
      dockDynamicWaveform: document.getElementById('dockDynamicWaveform'),
    };

    // Generate waveform bars
    this.generateWaveform();

    const state = Storage.loadPlayerState();
    this.playMode = state.playMode || 'sequence';
    this.volume = state.volume ?? 0.8;
    if (this.audio) {
      this.audio.volume = this.volume;
      this.bindEvents();
    }
    this.updateVolumeUI();
    this.updatePlayModeUI();
  },

  generateWaveform() {
    const containers = [this.els.waveformContainer, this.els.dockWaveform, this.els.dockDynamicWaveform];
    containers.forEach(container => {
      if (!container) return;

      let count = 20;
      if (container.id === 'dockWaveform') count = 12;
      if (container.id === 'dockDynamicWaveform') count = 64;
      if (container.id === 'waveformContainer') count = 3;

      let html = '';
      const mid = (count - 1) / 2;
      for (let i = 0; i < count; i++) {
        // Bell-curve height factor: higher in mid, lower at edges
        const dist = Math.abs(i - mid);
        const heightFactor = Math.max(0.25, 1 - (dist / mid) * 0.75);
        
        let opacity = 1;
        if (container.id === 'dockDynamicWaveform') {
          opacity = 1 - Math.pow(dist / mid, 1.5);
        }

        const baseH = (8 + Math.random() * 8) * heightFactor;
        const style = `height: ${baseH.toFixed(1)}px; opacity: ${opacity.toFixed(2)}`;
        html += `<div class="waveform-bar" style="${style}" data-index="${i}"></div>`;
      }
      container.innerHTML = html;
    });

    // Initialize bar containers
    this._barContainers = containers.filter(Boolean);
  },

  bindEvents() {
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('loadedmetadata', () => this.onLoaded());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('play', () => { this.setPlayingState(true); this.saveState(); });
    this.audio.addEventListener('pause', () => { this.setPlayingState(false); this.saveState(); });
    this.audio.addEventListener('progress', () => this.updateBuffered());
    this.audio.addEventListener('error', (e) => {
      const error = this.audio.error;
      let msg = 'Unknown audio error';
      if (error) {
        switch (error.code) {
          case 1: msg = 'MEDIA_ERR_ABORTED: Fetching process aborted by user'; break;
          case 2: msg = 'MEDIA_ERR_NETWORK: Network error'; break;
          case 3: msg = 'MEDIA_ERR_DECODE: Decoding error'; break;
          case 4: msg = 'MEDIA_ERR_SRC_NOT_SUPPORTED: Format not supported or source unreachable'; break;
        }
      }
      console.error('Audio Error Details:', { 
        code: error ? error.code : 'N/A', 
        message: msg, 
        src: this.audio.src,
        event: e 
      });
      this.setPlayingState(false);
    });

    if (this.els.btnPlay) this.els.btnPlay.addEventListener('click', () => this.toggle());
    if (this.els.btnPrev) this.els.btnPrev.addEventListener('click', () => {
      const idx = Playlist.prevSong();
      if (idx >= 0) Playlist.playSong(idx);
    });
    if (this.els.btnNext) this.els.btnNext.addEventListener('click', () => {
      const idx = Playlist.nextSong(this.playMode);
      if (idx >= 0) Playlist.playSong(idx);
    });

    // Handle auto-play block: try to play on first user interaction
    const resumeOnInteraction = () => {
      if (this.playPending) {
        this.playPending = false;
        console.log('User interacted, resuming pending playback...');
        this.audio.play().catch(err => console.error('Delayed play failed:', err));
      }
    };
    document.addEventListener('click', resumeOnInteraction, { once: true });
    document.addEventListener('keydown', resumeOnInteraction, { once: true });
    document.addEventListener('touchstart', resumeOnInteraction, { once: true });

    // Timer Scrubber Seek
    if (this.els.timerScrubber) {
      const handleSeek = (e) => {
        const rect = this.els.timerScrubber.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        if (this.audio.duration && isFinite(this.audio.duration)) {
          this.audio.currentTime = pct * this.audio.duration;
        }
      };
      let isDragging = false;
      this.els.timerScrubber.addEventListener('mousedown', (e) => {
        isDragging = true;
        // Don't seek immediately on click
      });
      window.addEventListener('mousemove', (e) => {
        if (isDragging) {
          handleSeek(e);
          // Prevent any accidental selection or other defaults
          e.preventDefault();
        }
      });
      window.addEventListener('mouseup', () => { isDragging = false; });
    }

    if (this.els.btnPlayMode) this.els.btnPlayMode.addEventListener('click', () => this.cyclePlayMode());
    if (this.els.btnPlayModeMobile) this.els.btnPlayModeMobile.addEventListener('click', () => this.cyclePlayMode());
    if (this.els.btnMute) this.els.btnMute.addEventListener('click', () => this.toggleMute());

    // Progress bar seeking (waveform)
    if (this.els.progressBar) {
      this.setupSlider(this.els.progressBar, (pct) => {
        if (this.audio.duration) this.audio.currentTime = pct * this.audio.duration;
      });
    }
    // Volume slider
    if (this.els.volumeBar) {
      this.setupSlider(this.els.volumeBar, (pct) => {
        this.volume = pct;
        this.audio.volume = pct;
        this.audio.muted = false;
        this.updateVolumeUI();
        this.saveState();
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveState();
    });
    window.addEventListener('beforeunload', () => this.saveState());

    // 使用定时器持续保存状态，比 timeupdate 更可靠
    setInterval(() => {
      if (this.audio && !this.audio.paused && this.audio.currentTime > 0) {
        this.saveState();
        // 双重保险：单独存一份进度，防止被其他模块覆盖
        localStorage.setItem('biliradio_last_pos', this.audio.currentTime);
      }
    }, 1000);
  },

  updateWaveformColors(pct) {
    // Update waveform bar progress colors for each container independently
    const containers = [this.els.waveformContainer, this.els.dockWaveform, this.els.dockDynamicWaveform];
    containers.forEach(container => {
      if (!container) return;
      const bars = container.querySelectorAll('.waveform-bar');
      const activeCount = Math.floor((pct / 100) * bars.length);
      bars.forEach((bar, i) => {
        bar.classList.toggle('past', i < activeCount);
      });
    });
  },

  saveState() {
    if (!this.audio) return;
    const state = {
      playMode: this.playMode,
      volume: this.volume,
      currentTime: this.audio.currentTime,
      currentIndex: Playlist.currentIndex,
      lastSaved: Date.now()
    };
    Storage.savePlayerState(state);
  },

  setupSlider(barEl, onChange) {
    let dragging = false;
    const calc = (e) => {
      const rect = barEl.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    };
    barEl.addEventListener('mousedown', (e) => { dragging = true; onChange(calc(e)); });
    document.addEventListener('mousemove', (e) => { if (dragging) onChange(calc(e)); });
    document.addEventListener('mouseup', () => { dragging = false; });
    barEl.addEventListener('touchstart', (e) => { dragging = true; onChange(calc(e.touches[0])); }, { passive: true });
    document.addEventListener('touchmove', (e) => { if (dragging) onChange(calc(e.touches[0])); }, { passive: true });
    document.addEventListener('touchend', () => { dragging = false; });
  },

  loadSong(song, seekTime = 0, startPlay = true) {
    if (!song) return;
    this.audio.src = `/api/audio-stream?bvid=${song.bvid}&cid=${song.cid}`;
    // 核心逻辑：使用更兼容的方式进行跳转（适配 Safari 和 Chrome 的不同行为）
    const performSeek = () => {
      if (seekTime > 0 && this.audio.duration && this.audio.duration > seekTime) {
        console.log('Final attempt to seek to:', seekTime);
        this.audio.currentTime = seekTime;
      }
    };

    const onCanPlay = () => {
      this.audio.removeEventListener('canplay', onCanPlay);
      
      if (startPlay) {
        this.audio.play()
          .then(() => {
            // 在播放启动后再次尝试跳转，这是 Safari 和某些移动端最稳健的做法
            setTimeout(performSeek, 100);
          })
          .catch(e => {
            console.warn('Auto-play blocked, wait for user interaction');
            this.playPending = true;
            // 如果自动播放被拦截，依然尝试在元数据加载后跳转进度
            performSeek();
          });
      } else {
        setTimeout(performSeek, 100);
      }
    };
    
    this.audio.addEventListener('canplay', onCanPlay);
    // 同时也监听 loadedmetadata 作为双重保险
    this.audio.addEventListener('loadedmetadata', performSeek, { once: true });

    // Cover images
    const coverUrl = `/api/cover-proxy?url=${encodeURIComponent(song.cover)}`;

    // Update Hero
    if (this.els.heroTitle) {
      this.els.heroTitle.textContent = song.title;
      // Initialize Variable Proximity Effect (Restored for all platforms)
      if (typeof VariableProximity !== 'undefined') {
        VariableProximity.init(this.els.heroTitle, {
          radius: 200,
          falloff: 'gaussian',
          fromFontVariationSettings: "'wght' 400, 'opsz' 9",
          toFontVariationSettings: "'wght' 1000, 'opsz' 40"
        });
      }
    }
    if (this.els.heroSubtitle) this.els.heroSubtitle.textContent = song.artist;
    if (this.els.heroCoverImg) {
      this.els.heroCoverImg.crossOrigin = "Anonymous"; 
      this.els.heroCoverImg.onload = () => this.updateMagicRingsColor(this.els.heroCoverImg);
      this.els.heroCoverImg.src = coverUrl;
      // If cached, trigger manually
      if (this.els.heroCoverImg.complete) {
        this.updateMagicRingsColor(this.els.heroCoverImg);
      }
    }
    if (this.els.heroBgImg) this.els.heroBgImg.src = coverUrl;
    if (this.els.dynamicBackground) this.els.dynamicBackground.src = coverUrl;

    // Load AI Host Script
    this.fetchAiScript(song);

    // Mini dock update
    if (this.els.miniTitle) this.els.miniTitle.textContent = song.title;
    if (this.els.miniArtist) this.els.miniArtist.textContent = song.artist;
    if (this.els.miniCover) this.els.miniCover.src = coverUrl;

    // Update dynamic background
    if (this.els.dynamicBackground) {
      this.els.dynamicBackground.src = coverUrl;
    }

    // Update detail description
    if (this.els.detailDescription) {
      this.els.detailDescription.textContent = song.description || `这是“${song.title}”，一个陪伴你放松、愈合与思考的电台。我们相信音乐拥有温柔的力量。`;
    }

    // Update listener count (randomized for flavor if not provided)
    const listenerEl = document.getElementById('listenerCount');
    if (listenerEl) {
      const base = 800 + Math.floor(Math.random() * 500);
      listenerEl.textContent = base.toLocaleString();
    }

    document.title = `${song.title} - BiliRadio`;
  },

  _setCover(container, src) {
    if (!container) return;
    const placeholder = container.querySelector('svg, .now-playing-cover-placeholder, .player-bar-cover-placeholder');
    let img = container.querySelector('img');
    if (!img) { img = document.createElement('img'); img.alt = ''; container.appendChild(img); }
    img.src = src;
    img.onload = () => { if (placeholder) placeholder.style.display = 'none'; img.style.display = ''; };
    img.onerror = () => { if (placeholder) placeholder.style.display = ''; img.style.display = 'none'; };
  },

  play() {
    if (!this.audio.src) return;
    this.audio.play().catch(e => console.warn('Play blocked:', e.message));
  },
  pause() { this.audio.pause(); },
  toggle() {
    if (this.isPlaying) { this.pause(); }
    else {
      if (!this.audio.src && Playlist.songs.length > 0) Playlist.playSong(0);
      else this.play();
    }
  },

  setPlayingState(playing) {
    this.isPlaying = playing;

    // Resume AudioContext on first play
    if (playing && !this.audioCtx) {
      this.setupVisualizer();
    }
    if (playing && this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    // Update all play/pause icons
    if (this.els.iconsPlay) {
      this.els.iconsPlay.forEach(icon => icon.classList.toggle('hidden', playing));
    }
    if (this.els.iconsPause) {
      this.els.iconsPause.forEach(icon => icon.classList.toggle('hidden', !playing));
    }

    // Toggle waveform animation for ALL bars
    this._barContainers.forEach(container => {
      container.querySelectorAll('.waveform-bar').forEach(bar => {
        bar.classList.toggle('animating', playing);
      });
    });
  },

  onTimeUpdate() {
    const { currentTime, duration } = this.audio;
    if (!duration) return;
    const pct = (currentTime / duration) * 100;
    // 进度条和时间 UI 更新
    if (this.els.progressFilled) this.els.progressFilled.style.width = pct + '%';
    if (this.els.progressHandle) this.els.progressHandle.style.left = pct + '%';
    if (this.els.timeCurrent) this.els.timeCurrent.textContent = this.formatTime(currentTime);

    // 更新波形图颜色 (统一调用，避免重复)
    this.updateWaveformColors(pct);

    // Update countdown timer
    if (this.els.timeRemaining) {
      const remaining = Math.max(0, duration - currentTime);
      this.els.timeRemaining.textContent = `- ${this.formatTime(remaining)}`;
    }

    // Update mini scrubber background
    if (this.els.timerProgress) {
      this.els.timerProgress.style.width = pct + '%';
    }
  },

  onLoaded() { if (this.els.timeTotal) this.els.timeTotal.textContent = this.formatTime(this.audio.duration); },
  onEnded() {
    const nextIdx = Playlist.nextSong(this.playMode);
    if (nextIdx >= 0) Playlist.playSong(nextIdx);
  },

  updateBuffered() {
    if (this.audio.buffered.length > 0 && this.audio.duration && this.els.progressBuffered) {
      const end = this.audio.buffered.end(this.audio.buffered.length - 1);
      this.els.progressBuffered.style.width = (end / this.audio.duration * 100) + '%';
    }
  },

  cyclePlayMode() {
    const modes = ['sequence', 'shuffle', 'repeat-one'];
    const idx = modes.indexOf(this.playMode);
    this.playMode = modes[(idx + 1) % modes.length];
    this.updatePlayModeUI();
    this.saveState();
  },

  updatePlayModeUI() {
    if (this.els.iconsSequence) this.els.iconsSequence.forEach(el => el.classList.toggle('hidden', this.playMode !== 'sequence'));
    if (this.els.iconsShuffle) this.els.iconsShuffle.forEach(el => el.classList.toggle('hidden', this.playMode !== 'shuffle'));
    if (this.els.iconsRepeatOne) this.els.iconsRepeatOne.forEach(el => el.classList.toggle('hidden', this.playMode !== 'repeat-one'));

    const btns = [this.els.btnPlayMode, this.els.btnPlayModeMobile];
    btns.forEach(btn => {
      if (btn) {
        btn.classList.toggle('active', this.playMode !== 'sequence');
        const titles = { 'sequence': '顺序播放', 'shuffle': '随机播放', 'repeat-one': '单曲循环' };
        btn.title = titles[this.playMode] || '';
      }
    });
  },

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.updateVolumeUI();
  },

  updateVolumeUI() {
    const muted = this.audio.muted;
    const vol = muted ? 0 : this.volume;
    if (this.els.volumeFilled) this.els.volumeFilled.style.width = (vol * 100) + '%';
    if (this.els.volumeHandle) this.els.volumeHandle.style.left = (vol * 100) + '%';
    if (this.els.iconVolume) this.els.iconVolume.classList.toggle('hidden', muted);
    if (this.els.iconMuted) this.els.iconMuted.classList.toggle('hidden', !muted);

    // Update volume icon based on mute state
    if (this.els.btnMute) {
      this.els.btnMute.textContent = muted ? 'volume_off' : 'volume_up';
    }
  },

  formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  setupVisualizer() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      const source = this.audioCtx.createMediaElementSource(this.audio);
      source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.5; // More snappy movement
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.visualize();
    } catch (e) {
      console.warn('Visualizer setup failed:', e);
    }
  },

  visualize() {
    requestAnimationFrame(() => this.visualize());
    if (!this.isPlaying || !this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    this._barContainers.forEach(container => {
      if (!container) return;
      const bars = container.querySelectorAll('.waveform-bar');
      const midIdx = (bars.length - 1) / 2;
      
      // 特殊处理：AI 主播板块的 3 个条条对应高中低音
      if (container.id === 'waveformContainer' && bars.length === 3) {
        const ranges = [
          { start: 0, end: 10 },    // 低音
          { start: 20, end: 60 },   // 中音
          { start: 100, end: 200 }  // 高音
        ];
        
        bars.forEach((bar, i) => {
          const range = ranges[i];
          let sum = 0;
          for (let j = range.start; j < range.end; j++) sum += this.dataArray[j] || 0;
          const avg = sum / (range.end - range.start);
          
          const h = 4 + (avg / 255) * 24;
          bar.style.height = `${h.toFixed(1)}px`;
        });
        return;
      }

      bars.forEach((bar, i) => {
        // 根据容器大小分配采样点
        const step = Math.floor(this.dataArray.length / bars.length);
        const val = this.dataArray[i * step] || 0;
        
        // 波峰系数：中间高，两侧低
        const dist = Math.abs(i - midIdx);
        const peakFactor = Math.max(0.3, 1 - (dist / midIdx) * 0.7);
        
        // 动态高度计算
        const baseH = 8 * peakFactor;
        const dynamicH = (val / 255) * 60 * peakFactor;
        
        bar.style.height = `${(baseH + dynamicH).toFixed(1)}px`;
      });
    });
  },

  async fetchAiScript(song) {
    if (!this.els.aiHostContainer) return;

    // Show typing indicator
    this.els.aiHostContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10">
        <div class="flex gap-1 mb-4">
          <div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 0s"></div>
          <div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
          <div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
        </div>
        <p class="text-[11px] text-primary/40 font-bold tracking-widest uppercase">Melody 正在准备导播词...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/ai-script?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`);
      const data = await resp.json();

      if (data.script) {
        this.renderAiScript(data.script);
      }
    } catch (err) {
      console.error('AI Script error:', err);
      this.els.aiHostContainer.innerHTML = `<p class="text-center text-xs opacity-40">主播暂时离开了麦克风...</p>`;
    }
  },

  renderAiScript(text) {
    if (this._aiTextType) this._aiTextType.destroy();

    this.els.aiHostContainer.innerHTML = `
      <div class="px-6 py-4 bg-primary/5 rounded-[2rem] border border-primary/10 shadow-sm relative">
        <span class="absolute -top-3 -left-2 text-[40px] text-primary/10 font-serif">“</span>
        <p id="aiScriptText" class="text-[15px] lg:text-[16px] text-on-surface/80 leading-relaxed italic text-center min-h-[3em]"></p>
        <span class="absolute -bottom-8 -right-2 text-[40px] text-primary/10 font-serif">”</span>
      </div>
    `;

    const el = document.getElementById('aiScriptText');
    if (el && typeof TextType !== 'undefined') {
      this._aiTextType = TextType.init(el, {
        text: text,
        typingSpeed: 50,
        pauseDuration: 3000,
        loop: false,
        showCursor: true,
        cursorCharacter: '_',
        cursorBlinkDuration: 0.6,
        variableSpeed: { min: 30, max: 100 }
      });
    }
  },

  async updateMagicRingsColor(imgEl) {
    const ringContainer = document.getElementById('magicRingsContainer');
    const heroSection = document.getElementById('viewRadio');
    if (!ringContainer || typeof FastAverageColor === 'undefined') return;
    
    try {
      const fac = new FastAverageColor();
      const color = await fac.getColorAsync(imgEl, { 
        algorithm: 'dominant',
        step: 1
      });
      
      const [r, g, b] = color.value;
      const c1 = `rgb(${r}, ${g}, ${b})`;
      const c2 = `rgb(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)})`;
      
      // Update MagicRings
      ringContainer.style.setProperty('--ring-color-1', c1);
      ringContainer.style.setProperty('--ring-color-2', c2);
      
      if (heroSection) {
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const isDarkTheme = luminance < 0.6;
        
        // 1. Text for mix-blend-mode (Always white base)
        const adaptiveTextColor = '#ffffff';
        const adaptiveSubTextColor = 'rgba(255, 255, 255, 0.85)';
        
        // 2. Text for standard UI elements (True adaptive color)
        const adaptiveUiColor = isDarkTheme ? '#ffffff' : '#1a1a1a';
        const adaptiveUiSubColor = isDarkTheme ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.65)';
        
        heroSection.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
        heroSection.style.setProperty('--hero-text-color', adaptiveTextColor);
        heroSection.style.setProperty('--hero-subtext-color', adaptiveSubTextColor);
        heroSection.style.setProperty('--hero-ui-color', adaptiveUiColor);
        heroSection.style.setProperty('--hero-ui-subcolor', adaptiveUiSubColor);
        heroSection.style.setProperty('--hero-accent', c1);
        heroSection.style.setProperty('--hero-accent-soft', isDarkTheme ? `rgba(${r}, ${g}, ${b}, 0.25)` : 'rgba(0, 0, 0, 0.05)');
        
        const title = document.getElementById('heroTitle');
        const subtitle = document.getElementById('heroSubtitle');
        if (title) title.style.color = adaptiveTextColor;
        if (subtitle) subtitle.style.color = adaptiveSubTextColor;
        
        console.log(`[Color] Pure Contrast (Difference Mode): ${c1}, Lum: ${luminance.toFixed(2)}`);
      }
    } catch (e) {
      console.warn('Hero color extraction failed:', e);
    }
  }
};
