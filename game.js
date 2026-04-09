// ============================================================
// TAN TIME! - Andrea's Birthday Game
// ============================================================

(() => {
  'use strict';

  // --- DOM refs ---
  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $('screen-start'),
    levelIntro: $('screen-level-intro'),
    game: $('screen-game'),
    levelComplete: $('screen-level-complete'),
    gameover: $('screen-gameover'),
    leaderboard: $('screen-leaderboard'),
  };

  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');

  // --- Game state ---
  let playerName = '';
  let currentLevel = 0;
  let score = 0;
  let tanMeter = 0;
  let timeLeft = 0;
  let gameLoop = null;
  let timerInterval = null;
  let items = [];
  let andrea = { x: 0, y: 0, w: 60, h: 60 };
  let touchX = null;
  let particles = [];
  let combo = 0;
  let lastTime = 0;
  let spawnTimer = 0;
  let canvasW = 0;
  let canvasH = 0;
  let bgElements = [];

  // --- Level config ---
  const levels = [
    {
      name: 'Pool Party',
      emoji: '\u{1F3CA}',
      desc: 'Catch sun rays and sunscreen by the pool!\nAvoid clouds and pool splashes.',
      time: 35,
      tanGoal: 100,
      bgColor1: '#87CEEB',
      bgColor2: '#4FC3F7',
      groundColor: '#29B6F6',
      groundAccent: '#0288D1',
      goodItems: [
        { emoji: '\u2600\uFE0F', points: 10, tan: 8, speed: 2.5, size: 52 },
        { emoji: '\u{1F576}\uFE0F', points: 15, tan: 5, speed: 2, size: 48 },
        { emoji: '\u{1F9F4}', points: 20, tan: 12, speed: 1.8, size: 46 },
      ],
      badItems: [
        { emoji: '\u2601\uFE0F', points: -10, tan: -8, speed: 2, size: 54 },
        { emoji: '\u{1F4A6}', points: -5, tan: -5, speed: 3, size: 44 },
      ],
      spawnRate: 0.025,
      bgEmojis: ['\u{1F334}', '\u{1F3D6}\uFE0F', '\u{1F459}'],
    },
    {
      name: 'Beach Day',
      emoji: '\u{1F3D6}\uFE0F',
      desc: 'Harder! Catch those rays on the beach!\nWatch out for seagulls and waves.',
      time: 40,
      tanGoal: 130,
      bgColor1: '#64B5F6',
      bgColor2: '#42A5F5',
      groundColor: '#FFE082',
      groundAccent: '#FFD54F',
      goodItems: [
        { emoji: '\u2600\uFE0F', points: 10, tan: 7, speed: 3, size: 52 },
        { emoji: '\u{1F576}\uFE0F', points: 15, tan: 5, speed: 2.5, size: 48 },
        { emoji: '\u{1F9F4}', points: 25, tan: 15, speed: 2, size: 46 },
        { emoji: '\u{1F379}', points: 20, tan: 10, speed: 2.2, size: 50 },
      ],
      badItems: [
        { emoji: '\u2601\uFE0F', points: -10, tan: -8, speed: 2.5, size: 54 },
        { emoji: '\u{1F99C}', points: -15, tan: -10, speed: 3.5, size: 50 },
        { emoji: '\u{1F30A}', points: -8, tan: -6, speed: 3, size: 52 },
        { emoji: '\u2602\uFE0F', points: -20, tan: -15, speed: 1.8, size: 56 },
      ],
      spawnRate: 0.032,
      bgEmojis: ['\u{1F41A}', '\u{1F40B}', '\u{1F3C4}'],
    },
  ];

  // --- Screen management ---
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // --- Google Sheets API ---
  // REPLACE THIS with your deployed Google Apps Script web app URL
  const SHEET_API = 'https://script.google.com/macros/s/AKfycbxW4N9vuhy4PloV7t2M3XXKyz1fm0-zllj-cAJzvuLIwFVnpWu2pSjdiYTzXbI0iahjIg/exec';

  const sheetsEnabled = SHEET_API !== 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';

  // --- Leaderboard ---
  function getLocalScores() {
    try {
      return JSON.parse(localStorage.getItem('tantime_scores') || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalScores(scores) {
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('tantime_scores', JSON.stringify(scores.slice(0, 20)));
  }

  async function fetchRemoteScores() {
    if (!sheetsEnabled) return null;
    try {
      const res = await fetch(SHEET_API, { redirect: 'follow' });
      const data = await res.json();
      return data.scores || [];
    } catch (err) {
      console.warn('Failed to fetch remote scores:', err);
      return null;
    }
  }

  async function saveScore(name, scoreVal) {
    // Always save locally
    const local = getLocalScores();
    local.push({ name, score: scoreVal, date: new Date().toISOString() });
    saveLocalScores(local);

    // Save to Google Sheet via GET workaround (Apps Script redirects break POST CORS)
    if (sheetsEnabled) {
      try {
        const params = new URLSearchParams({ action: 'save', name, score: scoreVal });
        await fetch(`${SHEET_API}?${params}`, { redirect: 'follow' });
      } catch (err) {
        console.warn('Failed to save remote score:', err);
      }
    }
  }

  async function renderLeaderboard() {
    const list = $('leaderboard-list');
    list.innerHTML = '<p class="lb-empty">Loading...</p>';

    // Try remote first, fall back to local
    let scores = await fetchRemoteScores();
    if (!scores) {
      scores = getLocalScores();
    }

    if (scores.length === 0) {
      list.innerHTML = '<p class="lb-empty">No scores yet. Be the first!</p>';
      return;
    }

    scores.sort((a, b) => b.score - a.score);
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const classes = ['gold', 'silver', 'bronze'];
    list.innerHTML = scores
      .slice(0, 10)
      .map((s, i) => {
        const cls = i < 3 ? classes[i] : '';
        const rank = i < 3 ? medals[i] : `${i + 1}`;
        return `<div class="lb-entry ${cls}">
          <span class="lb-rank">${rank}</span>
          <span class="lb-name">${escapeHtml(s.name)}</span>
          <span class="lb-score">${s.score}</span>
        </div>`;
      })
      .join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Canvas sizing ---
  function resizeCanvas() {
    const hud = $('game-hud');
    const hudH = hud.getBoundingClientRect().height;
    canvasW = window.innerWidth;
    canvasH = window.innerHeight - hudH;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    andrea.y = canvasH - 90;
    andrea.x = Math.min(Math.max(andrea.x, 30), canvasW - 30);
  }

  // --- Background elements ---
  function initBgElements(level) {
    bgElements = [];
    for (let i = 0; i < 5; i++) {
      bgElements.push({
        emoji: level.bgEmojis[Math.floor(Math.random() * level.bgEmojis.length)],
        x: Math.random() * canvasW,
        y: canvasH * 0.15 + Math.random() * canvasH * 0.4,
        size: 20 + Math.random() * 16,
        alpha: 0.15 + Math.random() * 0.1,
        drift: 0.2 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // --- Particles ---
  function spawnParticles(x, y, good) {
    const count = good ? 6 : 4;
    const colors = good
      ? ['#FFD700', '#FFA500', '#FF6B35', '#FFEB3B']
      : ['#90A4AE', '#607D8B', '#455A64'];
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 4 - 1,
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // --- Spawn falling items ---
  function spawnItem(level) {
    const allItems = [...level.goodItems, ...level.badItems];
    // Weighted toward good items (60/40)
    const isGood = Math.random() < 0.6;
    const pool = isGood ? level.goodItems : level.badItems;
    const template = pool[Math.floor(Math.random() * pool.length)];
    const wobble = Math.random() < 0.3;

    items.push({
      x: 20 + Math.random() * (canvasW - 40),
      y: -40,
      emoji: template.emoji,
      points: template.points,
      tan: template.tan,
      speed: template.speed * (0.85 + Math.random() * 0.3),
      size: template.size,
      good: isGood,
      wobble,
      wobblePhase: Math.random() * Math.PI * 2,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.05,
    });
  }

  // --- Drawing ---
  function drawGame(level, dt) {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
    skyGrad.addColorStop(0, level.bgColor1);
    skyGrad.addColorStop(0.7, level.bgColor2);
    skyGrad.addColorStop(1, level.groundColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Ground
    const groundY = canvasH - 60;
    ctx.fillStyle = level.groundColor;
    ctx.fillRect(0, groundY, canvasW, 60);

    // Ground accent line
    ctx.fillStyle = level.groundAccent;
    ctx.fillRect(0, groundY, canvasW, 3);

    // Water shimmer for pool level
    if (currentLevel === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 6; i++) {
        const sx = (Date.now() * 0.02 + i * 80) % (canvasW + 100) - 50;
        ctx.beginPath();
        ctx.ellipse(sx, groundY + 30, 30, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sand texture for beach level
    if (currentLevel === 1) {
      ctx.fillStyle = 'rgba(210,180,100,0.3)';
      for (let i = 0; i < 8; i++) {
        const sx = (i * 57 + 20) % canvasW;
        ctx.beginPath();
        ctx.arc(sx, groundY + 15 + (i % 3) * 12, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Background elements (floating decorations)
    const now = Date.now() * 0.001;
    bgElements.forEach((el) => {
      ctx.globalAlpha = el.alpha;
      ctx.font = `${el.size}px serif`;
      ctx.textAlign = 'center';
      const bx = el.x + Math.sin(now * el.drift + el.phase) * 15;
      ctx.fillText(el.emoji, bx, el.y);
    });
    ctx.globalAlpha = 1;

    // Falling items
    items.forEach((item) => {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);

      // Glowing backdrop circle
      const radius = item.size * 0.65;
      const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      if (item.good) {
        glow.addColorStop(0, 'rgba(255, 235, 59, 0.5)');
        glow.addColorStop(0.6, 'rgba(255, 193, 7, 0.25)');
        glow.addColorStop(1, 'rgba(255, 193, 7, 0)');
      } else {
        glow.addColorStop(0, 'rgba(100, 100, 120, 0.45)');
        glow.addColorStop(0.6, 'rgba(80, 80, 100, 0.2)');
        glow.addColorStop(1, 'rgba(80, 80, 100, 0)');
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `${item.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, 0, 0);
      ctx.restore();
    });

    // Andrea — colored platform + large emojis
    // Platform base so she's always visible
    ctx.fillStyle = 'rgba(255, 180, 100, 0.6)';
    ctx.beginPath();
    ctx.roundRect(andrea.x - 40, andrea.y - 5, 80, 35, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 120, 50, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '56px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u{1F6CB}\uFE0F', andrea.x, andrea.y + 12);
    ctx.font = '44px serif';
    ctx.fillText('\u{1F469}', andrea.x, andrea.y - 20);

    // Combo display
    if (combo >= 3) {
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText(`${combo}x COMBO!`, andrea.x, andrea.y - 50);
    }

    // Particles
    particles.forEach((p) => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Score popup text
    scorePopups.forEach((pop) => {
      ctx.globalAlpha = pop.life;
      ctx.font = `bold ${pop.size}px -apple-system, sans-serif`;
      ctx.fillStyle = pop.color;
      ctx.textAlign = 'center';
      ctx.fillText(pop.text, pop.x, pop.y);
    });
    ctx.globalAlpha = 1;
  }

  let scorePopups = [];

  function addScorePopup(x, y, text, good) {
    scorePopups.push({
      x,
      y,
      text,
      color: good ? '#FFD700' : '#EF5350',
      life: 1,
      size: good ? 22 : 18,
      vy: -2,
    });
  }

  // --- Update ---
  function updateGame(dt, level) {
    // Spawn items
    spawnTimer += dt;
    const spawnInterval = 1 / (level.spawnRate * 60);
    if (spawnTimer > spawnInterval) {
      spawnItem(level);
      spawnTimer = 0;
    }

    // Move items
    items.forEach((item) => {
      item.y += item.speed * dt * 60;
      item.rotation += item.rotSpeed;
      if (item.wobble) {
        item.wobblePhase += 0.05;
        item.x += Math.sin(item.wobblePhase) * 1.2;
      }
    });

    // Collision detection
    const hitDist = 55;
    items = items.filter((item) => {
      if (item.y > canvasH + 50) return false;

      const dx = item.x - andrea.x;
      const dy = item.y - andrea.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitDist) {
        if (item.good) {
          combo++;
          const multiplier = combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1;
          const pts = Math.round(item.points * multiplier);
          score += pts;
          tanMeter = Math.min(tanMeter + item.tan, levels[currentLevel].tanGoal);
          spawnParticles(item.x, item.y, true);
          addScorePopup(item.x, item.y - 20, `+${pts}`, true);
        } else {
          combo = 0;
          score = Math.max(0, score + item.points);
          tanMeter = Math.max(0, tanMeter + item.tan);
          spawnParticles(item.x, item.y, false);
          addScorePopup(item.x, item.y - 20, `${item.points}`, false);
        }
        return false;
      }
      return true;
    });

    // Update particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= p.decay;
    });
    particles = particles.filter((p) => p.life > 0);

    // Score popups
    scorePopups.forEach((p) => {
      p.y += p.vy;
      p.life -= 0.025;
    });
    scorePopups = scorePopups.filter((p) => p.life > 0);

    // HUD
    $('hud-score').textContent = score;
    const pct = Math.min(100, (tanMeter / levels[currentLevel].tanGoal) * 100);
    $('tan-meter-fill').style.width = pct + '%';
  }

  // --- Game loop ---
  function startGameLoop() {
    lastTime = performance.now();
    spawnTimer = 0;

    function frame(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const level = levels[currentLevel];
      updateGame(dt, level);
      drawGame(level, dt);

      gameLoop = requestAnimationFrame(frame);
    }
    gameLoop = requestAnimationFrame(frame);
  }

  function stopGameLoop() {
    if (gameLoop) {
      cancelAnimationFrame(gameLoop);
      gameLoop = null;
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // --- Start a level ---
  function startLevel(levelIdx) {
    currentLevel = levelIdx;
    const level = levels[levelIdx];

    // Reset state for this level (keep cumulative score)
    tanMeter = 0;
    timeLeft = level.time;
    items = [];
    particles = [];
    scorePopups = [];
    combo = 0;
    spawnTimer = 0;

    // Show game screen
    showScreen('game');
    $('hud-level').textContent = `Level ${levelIdx + 1}`;
    $('hud-score').textContent = score;
    $('hud-time').textContent = timeLeft;
    $('tan-meter-fill').style.width = '0%';

    resizeCanvas();
    andrea.x = canvasW / 2;
    andrea.y = canvasH - 90;

    initBgElements(level);

    // Timer
    timerInterval = setInterval(() => {
      timeLeft--;
      $('hud-time').textContent = Math.max(0, timeLeft);

      if (timeLeft <= 5) {
        $('hud-time').style.color = '#FF5252';
      } else {
        $('hud-time').style.color = '';
      }

      if (timeLeft <= 0) {
        endLevel();
      }
    }, 1000);

    startGameLoop();
  }

  // --- End level ---
  function endLevel() {
    stopGameLoop();
    const level = levels[currentLevel];
    const tanPct = Math.round((tanMeter / level.tanGoal) * 100);
    const passed = tanMeter >= level.tanGoal * 0.7; // 70% to pass

    if (passed && currentLevel < levels.length - 1) {
      // Level complete, more levels to go
      $('complete-title').textContent = 'Level Complete!';
      $('complete-score').textContent = `Score: ${score}`;
      $('complete-tan').textContent = `Tan: ${tanPct}% ${tanPct >= 100 ? '- Perfect tan!' : '- Looking golden!'}`;
      $('btn-next-level').style.display = 'block';
      showScreen('levelComplete');
    } else if (passed) {
      // Beat the final level!
      saveScore(playerName, score);
      $('gameover-emoji').textContent = '\u{1F389}';
      $('gameover-title').textContent = 'You Did It!';
      $('gameover-msg').textContent = `Andrea's got the perfect tan! Happy Birthday Andrea!`;
      $('gameover-score').textContent = score;
      showScreen('gameover');
    } else {
      // Didn't pass
      saveScore(playerName, score);
      $('gameover-emoji').textContent = '\u{1F625}';
      $('gameover-title').textContent = 'Too Cloudy!';
      $('gameover-msg').textContent = `Only ${tanPct}% tan. Andrea needs at least 70%! Try again?`;
      $('gameover-score').textContent = score;
      showScreen('gameover');
    }
  }

  // --- Touch / mouse controls ---
  function getEventX(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
    return e.clientX;
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchX = getEventX(e);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const x = getEventX(e);
    if (touchX !== null) {
      const dx = x - touchX;
      andrea.x = Math.min(Math.max(andrea.x + dx, 30), canvasW - 30);
      touchX = x;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    touchX = null;
  });

  // Mouse fallback for testing
  let mouseDown = false;
  canvas.addEventListener('mousedown', (e) => {
    mouseDown = true;
    touchX = e.clientX;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    const x = e.clientX;
    const dx = x - touchX;
    andrea.x = Math.min(Math.max(andrea.x + dx, 30), canvasW - 30);
    touchX = x;
  });
  canvas.addEventListener('mouseup', () => {
    mouseDown = false;
    touchX = null;
  });

  // --- Resize ---
  window.addEventListener('resize', () => {
    if (screens.game.classList.contains('active')) {
      resizeCanvas();
    }
  });

  // --- Button handlers ---
  const nameInput = $('player-name');
  const btnPlay = $('btn-play');

  nameInput.addEventListener('input', () => {
    btnPlay.disabled = nameInput.value.trim().length === 0;
  });

  btnPlay.addEventListener('click', () => {
    playerName = nameInput.value.trim();
    if (!playerName) return;
    score = 0;
    showLevelIntro(0);
  });

  function showLevelIntro(levelIdx) {
    const level = levels[levelIdx];
    $('level-emoji').textContent = level.emoji;
    $('level-title').textContent = `Level ${levelIdx + 1}: ${level.name}`;
    $('level-desc').textContent = level.desc;
    showScreen('levelIntro');
  }

  $('btn-start-level').addEventListener('click', () => {
    startLevel(currentLevel);
  });

  $('btn-next-level').addEventListener('click', () => {
    showLevelIntro(currentLevel + 1);
    currentLevel = currentLevel + 1;
  });

  $('btn-replay').addEventListener('click', () => {
    score = 0;
    currentLevel = 0;
    showLevelIntro(0);
  });

  $('btn-leaderboard').addEventListener('click', () => {
    renderLeaderboard();
    showScreen('leaderboard');
  });

  $('btn-go-leaderboard').addEventListener('click', () => {
    renderLeaderboard();
    showScreen('leaderboard');
  });

  $('btn-back').addEventListener('click', () => {
    showScreen('start');
  });
})();
