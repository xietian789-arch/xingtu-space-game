/**
 * HomeIntro.classic.js
 * ------------------------------------------------------------
 * 启动首页的 2.5D 分层动效控制器。
 * - GSAP 时间线负责入场与可控循环
 * - Canvas 只绘制少量补充星点
 * - ESC 在启动页切换动效暂停，不干扰进入游戏后的 Pointer Lock 暂停
 */
(function () {
  'use strict';

  var overlay = document.getElementById('start-overlay');
  var startBtn = document.getElementById('start-btn');
  var canvas = document.getElementById('home-star-canvas');
  var statusEl = document.getElementById('home-motion-status');
  var gsap = window.gsap;

  if (!overlay || !startBtn || !canvas || !gsap) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  var mm = gsap.matchMedia();
  var introTimeline = null;
  var exitTimeline = null;
  var ambientTweens = [];
  var stars = [];
  var rafId = 0;
  var canvasWidth = 0;
  var canvasHeight = 0;
  var dpr = 1;
  var lastFrame = 0;
  var userPaused = false;
  var visibilityPaused = false;
  var reduceMotion = false;
  var exiting = false;
  var destroyed = false;

  var parallaxLayers = Array.prototype.slice.call(
    overlay.querySelectorAll('.home-parallax')
  );
  var parallaxDrivers = [];

  function resizeCanvas() {
    if (destroyed) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvasWidth = Math.max(1, window.innerWidth);
    canvasHeight = Math.max(1, window.innerHeight);
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  }

  function buildStars() {
    var area = canvasWidth * canvasHeight;
    var count = reduceMotion ? 0 : Math.max(46, Math.min(105, Math.round(area / 18500)));
    stars = [];
    for (var i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        radius: 0.25 + Math.random() * 0.9,
        alpha: 0.08 + Math.random() * 0.38,
        speed: 0.00045 + Math.random() * 0.0012,
        phase: Math.random() * Math.PI * 2,
        cool: Math.random() > 0.18,
      });
    }
  }

  function drawStars(timestamp) {
    rafId = window.requestAnimationFrame(drawStars);
    if (destroyed || exiting || reduceMotion || userPaused || visibilityPaused) return;
    if (timestamp - lastFrame < 32) return; // 约 30fps，足够完成低频闪烁
    lastFrame = timestamp;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    for (var i = 0; i < stars.length; i += 1) {
      var star = stars[i];
      var pulse = 0.45 + 0.55 * Math.sin(timestamp * star.speed + star.phase);
      var alpha = star.alpha * (0.45 + pulse * 0.55);
      ctx.beginPath();
      ctx.fillStyle = star.cool
        ? 'rgba(188, 226, 255, ' + alpha.toFixed(3) + ')'
        : 'rgba(255, 218, 170, ' + (alpha * 0.65).toFixed(3) + ')';
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function clearAmbientTweens() {
    ambientTweens.forEach(function (tween) { tween.kill(); });
    ambientTweens = [];
  }

  function addAmbientTween(target, vars) {
    ambientTweens.push(gsap.to(target, vars));
  }

  function buildAmbientAnimations() {
    clearAmbientTweens();
    if (reduceMotion || exiting) return;

    addAmbientTween('.home-layer--astronaut img', {
      y: -16,
      x: 6,
      rotation: 1.4,
      duration: 5.2,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
    addAmbientTween('.home-layer--tiangong img', {
      y: 3,
      x: -2,
      rotation: -0.28,
      duration: 11.2,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
    addAmbientTween('.home-layer--shenzhou img', {
      y: -5,
      x: 4,
      rotation: 0.5,
      duration: 8.1,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
    addAmbientTween('.home-layer--dongfanghong img', {
      y: 4,
      rotation: 0.8,
      duration: 9.4,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
    addAmbientTween('.home-layer--change img', {
      y: -2,
      x: -1,
      duration: 12.4,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
    addAmbientTween('.home-layer--earth img', {
      scale: 1.004,
      duration: 10.8,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      transformOrigin: '80% 80%',
    });
    addAmbientTween('.home-scanline', {
      yPercent: 115,
      duration: 7,
      ease: 'none',
      repeat: -1,
      repeatDelay: 2.2,
    });
  }

  function buildIntroTimeline() {
    if (introTimeline) introTimeline.kill();

    var copyParts = overlay.querySelectorAll(
      '.home-kicker, .home-title-shell, .home-title-meta, .start-subtitle, .home-date-row, #start-btn, .start-hint'
    );
    var layers = overlay.querySelectorAll('.home-layer');
    var corners = overlay.querySelectorAll('.home-corner, .home-frame-tick');

    if (reduceMotion) {
      gsap.set(copyParts, { autoAlpha: 1, clearProps: 'transform' });
      gsap.set(layers, { autoAlpha: 1, clearProps: 'transform' });
      gsap.set(corners, { autoAlpha: 1, clearProps: 'transform' });
      gsap.set('.home-backdrop', { autoAlpha: 1, clearProps: 'transform' });
      buildAmbientAnimations();
      return;
    }

    gsap.set('.home-backdrop', { autoAlpha: 0, scale: 1.035 });
    gsap.set(layers, { autoAlpha: 0 });
    gsap.set(corners, { autoAlpha: 0, scale: 0.92 });
    gsap.set(copyParts, { autoAlpha: 0, y: 18 });

    introTimeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: buildAmbientAnimations,
    });

    introTimeline
      .addLabel('scene', 0)
      .to('.home-backdrop', { autoAlpha: 1, scale: 1, duration: 1.35 }, 'scene')
      .to(layers, {
        autoAlpha: 1,
        duration: 0.9,
        stagger: { amount: 0.65, from: 'start' },
      }, 'scene+=0.16')
      .to(corners, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.65,
        stagger: 0.06,
      }, 'scene+=0.25')
      .addLabel('interface', 0.48)
      .to(copyParts, {
        autoAlpha: 1,
        y: 0,
        duration: 0.68,
        stagger: 0.11,
      }, 'interface')
      .fromTo('.home-title-shell', {
        filter: 'brightness(0.72)',
      }, {
        filter: 'brightness(1)',
        duration: 0.9,
        ease: 'power2.out',
        immediateRender: false,
      }, 'interface+=0.05')
      .fromTo('#start-btn', {
        boxShadow: '0 0 0 rgba(110, 224, 255, 0)',
      }, {
        boxShadow: '0 0 28px rgba(80, 196, 255, 0.26), inset 0 0 24px rgba(90, 210, 255, 0.08)',
        duration: 0.85,
        ease: 'power2.out',
        immediateRender: false,
      }, 'interface+=0.42');
  }

  function setMotionPaused(paused, announce) {
    if (introTimeline) introTimeline.paused(paused);
    ambientTweens.forEach(function (tween) { tween.paused(paused); });
    overlay.classList.toggle('motion-paused', paused);

    if (announce && statusEl) {
      statusEl.textContent = paused ? '动效已暂停 · 再按 ESC 继续' : '动效已继续';
      statusEl.classList.add('is-visible');
      window.setTimeout(function () {
        if (!destroyed) statusEl.classList.remove('is-visible');
      }, paused ? 2200 : 1200);
    }
  }

  function toggleUserPause() {
    userPaused = !userPaused;
    setMotionPaused(userPaused || visibilityPaused, true);
  }

  function clearParallaxDrivers() {
    parallaxDrivers.forEach(function (driver) {
      driver.xTo.tween.kill();
      driver.yTo.tween.kill();
    });
    parallaxDrivers = [];
  }

  function createParallaxDrivers() {
    clearParallaxDrivers();
    parallaxDrivers = parallaxLayers.map(function (layer) {
      return {
        layer: layer,
        depth: parseFloat(layer.getAttribute('data-depth') || '0.2'),
        xTo: gsap.quickTo(layer, 'x', { duration: 0.82, ease: 'power2.out' }),
        yTo: gsap.quickTo(layer, 'y', { duration: 0.82, ease: 'power2.out' }),
      };
    });
  }

  function handlePointerMove(event) {
    if (reduceMotion || userPaused || visibilityPaused || exiting) return;
    var nx = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    var ny = event.clientY / Math.max(1, window.innerHeight) - 0.5;

    parallaxDrivers.forEach(function (driver) {
      driver.xTo(nx * driver.depth * 36);
      driver.yTo(ny * driver.depth * 24);
    });
  }

  function handleKeyDown(event) {
    if (event.code !== 'Escape' || exiting || destroyed) return;
    if (overlay.classList.contains('hidden') || overlay.classList.contains('fade-out')) return;
    event.preventDefault();
    toggleUserPause();
  }

  function handleVisibilityChange() {
    visibilityPaused = document.hidden;
    setMotionPaused(userPaused || visibilityPaused, false);
  }

  function bindButtonMotion() {
    startBtn.addEventListener('pointerenter', function () {
      if (userPaused || exiting) return;
      gsap.to(startBtn, {
        y: -2,
        scale: 1.018,
        duration: 0.28,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    });
    startBtn.addEventListener('pointerleave', function () {
      gsap.to(startBtn, {
        y: 0,
        scale: 1,
        duration: 0.32,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    });
    startBtn.addEventListener('pointerdown', function () {
      gsap.to(startBtn, {
        scale: 0.985,
        duration: 0.11,
        ease: 'power1.out',
        overwrite: 'auto',
      });
    });
    startBtn.addEventListener('pointerup', function () {
      gsap.to(startBtn, {
        scale: 1.018,
        duration: 0.2,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    });
  }

  function exit() {
    if (exiting || destroyed) return;
    exiting = true;
    clearAmbientTweens();
    userPaused = false;
    visibilityPaused = false;

    exitTimeline = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
    exitTimeline
      .to('.home-copy', { autoAlpha: 0, x: -24, duration: 0.38 }, 0)
      .to('.home-frame', { autoAlpha: 0, duration: 0.3 }, 0)
      .to('.home-layer--astronaut', { x: 28, scale: 1.025, duration: 0.5 }, 0)
      .to('.home-scene', { scale: 1.018, duration: 0.55 }, 0);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearAmbientTweens();
    if (introTimeline) introTimeline.kill();
    if (exitTimeline) exitTimeline.kill();
    mm.revert();
    window.cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('pointermove', handlePointerMove);
    clearParallaxDrivers();
    window.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  mm.add({
    isDesktop: '(min-width: 900px)',
    reduceMotion: '(prefers-reduced-motion: reduce)',
  }, function (mediaContext) {
    reduceMotion = !!mediaContext.conditions.reduceMotion;
    overlay.classList.toggle('reduce-motion', reduceMotion);
    resizeCanvas();
    buildIntroTimeline();

    if (!reduceMotion && mediaContext.conditions.isDesktop) {
      createParallaxDrivers();
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
    }

    return function () {
      window.removeEventListener('pointermove', handlePointerMove);
      clearParallaxDrivers();
      clearAmbientTweens();
    };
  });

  bindButtonMotion();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  overlay.classList.add('home-ready');
  rafId = window.requestAnimationFrame(drawStars);

  window.XINGTU_HOME = {
    exit: exit,
    destroy: destroy,
    pause: function () {
      userPaused = true;
      setMotionPaused(true, false);
    },
    resume: function () {
      userPaused = false;
      setMotionPaused(visibilityPaused, false);
    },
  };
})();


