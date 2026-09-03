/**
 * LaunchCinematic.classic.js
 * ------------------------------------------------------------
 * 首页与 3D 场景之间的启航过场：
 * 视频播放 → 淡入加载界面 → 进度完成 → 游戏画面渐显。
 */
(function () {
  'use strict';

  var overlay = document.getElementById('launch-cinematic');
  var video = document.getElementById('launch-video');
  var blackout = overlay && overlay.querySelector('.launch-cinematic__blackout');
  var status = overlay && overlay.querySelector('.launch-cinematic__status');
  var loader = blackout && blackout.querySelector('.launch-loader');
  var loaderParts = loader && loader.querySelectorAll('[data-loader-part]');
  var loaderProgressText = document.getElementById('launch-loader-progress');
  var loaderProgressFill = document.getElementById('launch-loader-fill');
  var loaderProgressMarker = document.getElementById('launch-loader-marker');
  var loaderProgressTrack = loader && loader.querySelector('.launch-loader__track');
  var loaderOrbit = loader && loader.querySelector('.launch-loader__orbit');
  var gsap = window.gsap;

  if (!overlay || !video || !blackout || !status || !gsap) return;

  var active = false;
  var phase = 'idle';
  var callbacks = {};
  var introTimeline = null;
  var transitionTimeline = null;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var blackStartedAt = 0;
  var loaderProgress = { value: 0 };

  function skipCinematic() {
    if (!active) return;
    if (introTimeline) introTimeline.kill();
    if (transitionTimeline) transitionTimeline.kill();
    resetVideo();
    gsap.set(overlay, { autoAlpha: 0 });
    completeSequence();
  }

  function onTabDown(e) {
    if (e.code === 'Tab' && active) {
      e.preventDefault();
      skipCinematic();
    }
  }

  document.addEventListener('keydown', onTabDown);

  function setPhase(nextPhase) {
    phase = nextPhase;
    overlay.setAttribute('data-phase', nextPhase);
    overlay.setAttribute('data-phase-at', String(Math.round(performance.now())));
  }

  function callSafely(name) {
    if (typeof callbacks[name] !== 'function') return;
    try {
      callbacks[name]();
    } catch (error) {
      console.error('[LaunchCinematic] 回调执行失败:', name, error);
    }
  }

  function resetVideo() {
    video.pause();
    try { video.currentTime = 0; } catch (_) {}
  }

  function updateLoaderProgress() {
    if (!loaderProgressText) return;
    loaderProgressText.textContent = String(Math.round(loaderProgress.value)) + '%';
  }

  function getMarkerDistance() {
    if (!loaderProgressTrack) return 0;
    return Math.max(0, loaderProgressTrack.getBoundingClientRect().width);
  }

  function resetLoader() {
    if (!loader) return;
    loaderProgress.value = 0;
    updateLoaderProgress();
    blackout.setAttribute('aria-hidden', 'true');
    gsap.set(loader, { autoAlpha: 0, y: 8 });
    if (loaderParts) gsap.set(loaderParts, { autoAlpha: 0, y: 6 });
    if (loaderProgressFill) gsap.set(loaderProgressFill, { scaleX: 0, transformOrigin: 'left center' });
    if (loaderProgressMarker) gsap.set(loaderProgressMarker, { x: 0, xPercent: -50, yPercent: -50 });
    if (loaderOrbit) gsap.set(loaderOrbit, { rotation: 0, transformOrigin: '50% 60%' });
  }

  function completeSequence() {
    setPhase('complete');
    active = false;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    blackout.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('launch-transition-active');
    resetVideo();
    callSafely('onComplete');
  }

  function beginBlackout() {
    if (!active || phase !== 'video') return;
    setPhase('to-black');

    if (introTimeline) introTimeline.kill();
    var fadeToBlack = reducedMotion ? 0.12 : 0.42;
    var revealDuration = reducedMotion ? 0.22 : 0.65;
    var blackHold = Number(callbacks.blackHold);
    if (!Number.isFinite(blackHold)) blackHold = 2.1;
    blackHold = reducedMotion ? 0.6 : Math.max(1.6, Math.min(3, blackHold));
    var loaderDuration = reducedMotion ? 0.28 : Math.max(0.9, blackHold - 0.34);

    transitionTimeline = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
    transitionTimeline
      .addLabel('toBlack', 0)
      .to(blackout, { autoAlpha: 1, duration: fadeToBlack }, 'toBlack')
      .to(video, { autoAlpha: 0, duration: fadeToBlack * 0.86 }, 'toBlack')
      .to(status, { autoAlpha: 0, duration: Math.min(0.28, fadeToBlack) }, 'toBlack')
      .addLabel('black', 'toBlack+=' + fadeToBlack)
      .call(function () {
        setPhase('black');
        blackStartedAt = performance.now();
        blackout.setAttribute('aria-hidden', 'false');
        callSafely('onBlack');
      }, [], 'black');

    if (loader) {
      transitionTimeline
        .to(loader, { autoAlpha: 1, y: 0, duration: reducedMotion ? 0.08 : 0.24, ease: 'power2.out' }, 'black+=0.02')
        .to(loaderParts, {
          autoAlpha: 1,
          y: 0,
          duration: reducedMotion ? 0.08 : 0.28,
          stagger: reducedMotion ? 0 : 0.035,
          ease: 'power2.out',
        }, 'black+=0.04');

      if (loaderProgressFill) {
        transitionTimeline.to(loaderProgressFill, {
          scaleX: 1,
          duration: loaderDuration,
          ease: reducedMotion ? 'none' : 'power2.inOut',
        }, 'black+=0.12');
      }

      if (loaderProgressMarker) {
        transitionTimeline.to(loaderProgressMarker, {
          x: getMarkerDistance,
          duration: loaderDuration,
          ease: reducedMotion ? 'none' : 'power2.inOut',
        }, 'black+=0.12');
      }

      transitionTimeline.to(loaderProgress, {
        value: 100,
        duration: loaderDuration,
        ease: reducedMotion ? 'none' : 'power2.inOut',
        onUpdate: updateLoaderProgress,
      }, 'black+=0.12');

      if (loaderOrbit) {
        transitionTimeline.to(loaderOrbit, {
          rotation: reducedMotion ? 0 : 74,
          duration: loaderDuration,
          ease: 'none',
        }, 'black+=0.12');
      }
    }

    transitionTimeline
      .addLabel('reveal', 'black+=' + blackHold)
      .call(function () {
        loaderProgress.value = 100;
        updateLoaderProgress();
        setPhase('reveal');
        overlay.setAttribute(
          'data-black-hold-ms',
          String(Math.round(performance.now() - blackStartedAt))
        );
        document.body.classList.remove('launch-transition-active');
        callSafely('onReveal');
      }, [], 'reveal')
      .to(loader, { autoAlpha: 0, y: -5, duration: Math.min(0.3, revealDuration), ease: 'power2.in' }, 'reveal')
      .to(overlay, { autoAlpha: 0, duration: revealDuration }, 'reveal')
      .call(completeSequence);
  }

  function playVideo() {
    var playRequest;
    try {
      playRequest = video.play();
    } catch (_) {
      beginBlackout();
      return;
    }

    if (playRequest && typeof playRequest.catch === 'function') {
      playRequest.catch(function () {
        // 某些内嵌浏览器会禁止有声播放；保留画面并降级为静音重试。
        video.muted = true;
        var mutedRequest = video.play();
        if (mutedRequest && typeof mutedRequest.catch === 'function') {
          mutedRequest.catch(beginBlackout);
        }
      });
    }
  }

  function start(options) {
    if (active) return false;

    callbacks = options || {};
    active = true;
    setPhase('video');
    video.muted = false;
    video.volume = 1;
    resetVideo();

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('launch-transition-active');

    gsap.set(overlay, { autoAlpha: 1 });
    gsap.set(blackout, { autoAlpha: 0 });
    gsap.set(video, { autoAlpha: 0 });
    gsap.set(status, { autoAlpha: 0, y: 8 });
    resetLoader();

    introTimeline = gsap.timeline({ defaults: { ease: 'power2.out' } });
    introTimeline
      .to(video, { autoAlpha: 1, duration: reducedMotion ? 0.1 : 0.38 }, 0)
      .to(status, { autoAlpha: 0.72, y: 0, duration: reducedMotion ? 0.1 : 0.42 }, 0.25)
      .to(status, { autoAlpha: 0, duration: 0.42 }, 2.2);

    playVideo();
    return true;
  }

  video.addEventListener('ended', beginBlackout);
  video.addEventListener('error', function () {
    if (active) beginBlackout();
  });

  // 首页空闲时提前建立解码缓冲，避免首次点击后才开始拉取视频。
  var warmVideo = function () {
    if (video.readyState < 3) video.load();
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmVideo, { timeout: 1800 });
  } else {
    window.setTimeout(warmVideo, 500);
  }

  window.XINGTU_CINEMATIC = {
    start: start,
    isActive: function () { return active; },
    getPhase: function () { return phase; },
    getDuration: function () { return Number.isFinite(video.duration) ? video.duration : 0; },
  };
})();
