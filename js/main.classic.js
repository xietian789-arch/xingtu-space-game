// main.js —— 经典脚本版本（适配 file:// 协议）
(function () {

const { Scene, PerspectiveCamera, WebGLRenderer, Clock, Color } = THREE;
const CSS2DRenderer = THREE.CSS2DRenderer;

const GameData = XINGTU.GameData;
const SpaceEnvironment = XINGTU.SpaceEnvironment;
const FutureBeacon = XINGTU.FutureBeacon;
const GameplayMusic = XINGTU.GameplayMusic;
const AstronautController = XINGTU.AstronautController;
const CameraController = XINGTU.CameraController;
const ExhibitManager = XINGTU.ExhibitManager;
const InteractionSystem = XINGTU.InteractionSystem;
const HUD = XINGTU.HUD;
const InfoPanel = XINGTU.InfoPanel;
const EditorPanel = XINGTU.EditorPanel;

/* ==================== 全局状态 ==================== */

/** 状态机：boot=启动 transitioning=转场 playing=游玩 paused=暂停 info=详情 editor=编辑 beacon=穿越终点 complete=完成 returning=返回首页 */
let state = 'boot';

/* ==================== 场景基础 ==================== */

const scene = new Scene();
scene.background = new Color(0x0a1626); // 带少量深蓝层次的太空，避免大面积死黑

const camera = new PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// 深空场景不使用阴影贴图：低分辨率阴影会在模型周围形成明显方形色块。
renderer.shadowMap.enabled = false;
document.getElementById('app').appendChild(renderer.domElement);

// CSS2DRenderer：叠加渲染中文名称标签，保证文字清晰
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.classList.add('css2d-layer');
document.body.appendChild(labelRenderer.domElement);

const clock = new Clock();

/* ==================== DOM 引用 ==================== */

const startOverlay = document.getElementById('start-overlay');
const startHint = document.querySelector('.start-hint');
const pauseOverlay = document.getElementById('pause-overlay');
const pauseDialog = pauseOverlay.querySelector('.pause-dialog');
const pauseActions = [...pauseOverlay.querySelectorAll('.pause-action')];
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const returnHomeBtn = document.getElementById('return-home-btn');
const futureBeaconPrompt = document.getElementById('future-beacon-prompt');
const futureBeaconDistance = document.getElementById('future-beacon-distance');
const futureBeaconStatus = document.getElementById('future-beacon-status');
const futureBeaconActionLabel = document.getElementById('future-beacon-action-label');
const futureBeaconActionEn = document.getElementById('future-beacon-action-en');
const beaconTransit = document.getElementById('beacon-transit');
const missionCompleteOverlay = document.getElementById('mission-complete-overlay');
const missionCompleteFrame = missionCompleteOverlay.querySelector('.mission-complete__frame');
const missionHomeBtn = document.getElementById('mission-home-btn');
const endingVideoOverlay = document.getElementById('ending-video-overlay');
const endingVideo = document.getElementById('ending-video');
const endingConfirmOverlay = document.getElementById('ending-confirm-overlay');
const endingStayBtn = document.getElementById('ending-stay-btn');
const endingHomeConfirmBtn = document.getElementById('ending-home-confirm-btn');
const pauseAudio = document.querySelector('.pause-audio');
const musicToggle = document.getElementById('music-toggle');
const musicToggleLabel = document.getElementById('music-toggle-label');
const musicVolume = document.getElementById('music-volume');
const musicVolumeValue = document.getElementById('music-volume-value');

/* ==================== 模块实例 ==================== */

const gameData = new GameData();
const hud = new HUD();
const gameMusic = new GameplayMusic();

let settings = {};
let environment, futureBeacon, astronaut, cameraCtrl, exhibitMgr, interaction, infoPanel, editorPanel, wormholeEditor;
let launchStarted = false;
let pauseTimeline = null;
let infoClosingByEscape = false;
let pendingEscapeRelock = false;
let suppressPauseUnlockUntil = 0;
let futureBeaconPromptVisible = false;
let futureBeaconReady = false;
let futureBeaconPromptTimeline = null;
let futureBeaconIdleTween = null;
let missionTimeline = null;
let endingVideoActive = false; // 终点视频播放期间暂停 3D 渲染，把 GPU/解码预算让给视频
let endingTransitionTimeline = null;
let endingTransitionFallback = 0;

/* ==================== 游戏音乐 ==================== */

function syncMusicControls() {
  const enabled = gameMusic.enabled;
  const percent = Math.round(gameMusic.volume * 100);
  pauseAudio.dataset.enabled = enabled ? 'true' : 'false';
  musicToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
  musicToggleLabel.textContent = enabled ? '音乐开启' : '音乐关闭';
  musicVolume.value = String(percent);
  musicVolumeValue.value = `${percent}%`;
  musicVolumeValue.textContent = `${percent}%`;
}

function bindMusicControls() {
  syncMusicControls();
  musicToggle.addEventListener('click', () => {
    gameMusic.toggle();
    syncMusicControls();
  });
  musicVolume.addEventListener('input', () => {
    gameMusic.setVolume(Number(musicVolume.value) / 100);
    musicVolumeValue.value = `${musicVolume.value}%`;
    musicVolumeValue.textContent = `${musicVolume.value}%`;
  });
}

/**
 * 终点与虫洞永远由“最后一个飞行器”推导，避免编辑节点后再次出现中途终点。
 * 终点始终位于最后一个飞行器之后；极光虫洞作为背景贯穿整条历史航线。
 */
function resolveRouteSettings(rawSettings, exhibits) {
  const resolved = { ...(rawSettings || {}) };
  const ordered = [...exhibits].sort((a, b) => a.timeline_order - b.timeline_order);
  const last = ordered[ordered.length - 1];
  const lastZ = Number(last?.position?.[2] ?? -1395);
  const gap = Math.max(110, Number(resolved.future_beacon_gap ?? 150));
  const tailDepth = Math.max(220, Number(resolved.route_tail_depth ?? 270));
  const routeStartZ = Number(resolved.route_start_z ?? 30);
  const configured = Array.isArray(resolved.future_beacon_position)
    ? resolved.future_beacon_position
    : [0, 0, lastZ - gap];
  const beaconZ = lastZ - gap;

  resolved.future_beacon_gap = gap;
  resolved.future_beacon_position = [
    Number(configured[0]) || 0,
    Number(configured[1]) || 0,
    beaconZ,
  ];
  resolved.timeline_depth = Math.abs(beaconZ);
  resolved.route_tail_depth = tailDepth;
  resolved.route_end_z = beaconZ - tailDepth;
  resolved.wormhole_length = Math.abs(routeStartZ - resolved.route_end_z);
  resolved.wormhole_center_z = (routeStartZ + resolved.route_end_z) / 2;
  resolved.flight_z_min = Math.min(Number(resolved.flight_z_min ?? beaconZ - 80), beaconZ - 80);
  resolved.flight_z_max = Number(resolved.flight_z_max ?? 25);
  return resolved;
}

/* ==================== 初始化 ==================== */

async function init() {
  startBtn.textContent = '资源加载中…';
  try {
    await gameData.load();
  } catch (err) {
    startBtn.textContent = '数据加载失败，请检查 data 目录';
    window.__XINGTU_FAIL__ = true;
    console.error(err);
    return;
  }
  const storedSettings = gameData.getSettings();
  settings = resolveRouteSettings(storedSettings, gameData.getExhibits());
  Object.assign(storedSettings, settings);

  // 太空环境（星空 / 雾 / 虫洞隧道 / 星云）
  environment = new SpaceEnvironment(scene);
  environment.build(settings);

  // 十个航天坐标之后的终点；位置与虫洞深度共用 settings 中的航线配置。
  const futureBeaconPosition = Array.isArray(settings.future_beacon_position)
    ? settings.future_beacon_position
    : [0, 0, -1550];
  futureBeacon = new FutureBeacon(scene, {
    position: futureBeaconPosition,
    revealDistance: 85,
    interactionDistance: 24,
  });

  // 宇航员 + 相机
  astronaut = new AstronautController(scene, settings, exhibitMgr);
  cameraCtrl = new CameraController(camera, renderer.domElement, astronaut, settings);

  // 虫洞调节面板（需在 astronaut 创建后构造，以便同步飞行边界）
  wormholeEditor = new XINGTU.WormholeEditor(environment, astronaut);

  // 代表物（宇航员在其之前创建，创建后回填碰撞依赖）
  exhibitMgr = new ExhibitManager(scene);
  exhibitMgr.buildAll(gameData.getExhibits());
  astronaut.exhibitManager = exhibitMgr; // 陨石碰撞检测依赖，此前为 undefined 导致碰撞失效
  astronaut.onAsteroidHit = () => {
    hud.toast('⚠ 撞上陨石！调整方向绕开');
  };

  // 交互系统：进入 / 离开范围时更新 HUD 提示与相机聚焦
  interaction = new InteractionSystem(astronaut, exhibitMgr, {
    onProximityChange: (data) => {
      hud.setPrompt(data);
      if (!data) cameraCtrl.setFocus(false);
    },
    onInteractabilityChange: (isInteractive) => {
      hud.setPromptInteractive(isInteractive);
      cameraCtrl.setFocus(isInteractive);
    },
  });

  // 详情面板
  infoPanel = new InfoPanel({
    onClose: () => resumeFromInfo(),
  });

  // 编辑面板
  editorPanel = new EditorPanel(gameData, exhibitMgr, hud, {
    scene: scene,
    camera: camera,
    renderer: renderer,
    astronautGroup: astronaut.group,
  }, {
    onDataChanged: refreshAfterDataChange,
    onCloseRequested: () => closeEditorAndLock(),
  });
  // 注入相机控制器引用（TransformControls 拖拽时禁用轨道控制）
  editorPanel.setCameraController(cameraCtrl);

  hud.buildTimeline(gameData.getExhibits(), settings);

  bindMusicControls();
  bindPointerLockEvents();
  bindGlobalKeys();

  if (window.location.protocol === 'file:') {
    startBtn.textContent = '请从“启动游戏.bat”进入';
    startBtn.disabled = true;
    startBtn.setAttribute('aria-label', '当前为文件预览模式，请使用启动游戏.bat打开完整三维游戏');
    if (startHint) {
      startHint.innerHTML = '当前是文件预览模式，浏览器已阻止 3D 模型读取<br>双击项目中的“启动游戏.bat”后再进入';
    }
  } else {
    startBtn.textContent = '开始航行';
  }
  window.__XINGTU_READY__ = true; // 就绪标记：供 index.html 诊断脚本检测

  // 设计验收预览：仅在显式 query 参数下启用，不影响正常游戏流程。
  const previewParams = new URLSearchParams(window.location.search);
  const previewMode = previewParams.get('preview');
  if (previewMode === 'detail') {
    const previewId = previewParams.get('exhibit') || 'dongfanghong1';
    const previewData = gameData.getExhibit(previewId) || gameData.getExhibits()[0];
    startOverlay.classList.add('hidden');
    if (window.XINGTU_HOME) window.XINGTU_HOME.destroy();
    hidePauseOverlay(true);
    astronaut.enabled = false;
    openInfo(previewData);
  } else if (previewMode === 'flight') {
    const previewZ = Number(previewParams.get('z'));
    startOverlay.classList.add('hidden');
    if (window.XINGTU_HOME) window.XINGTU_HOME.destroy();
    hidePauseOverlay(true);
    state = 'playing';
    astronaut.enabled = false;
    astronaut.group.position.set(0, 0, Number.isFinite(previewZ) ? previewZ : 0);
    astronaut.velocity.set(0, 0, 0);
    cameraCtrl.resetRotation();
    cameraCtrl.update(0.016);
    hud.show();
    // 本地视觉验收接口：同一 WebGL 场景内逐个移动，避免反复重载大型 GLB。
    const moveToPreviewExhibit = (id) => {
      const data = gameData.getExhibit(id);
      if (!data) return null;
      astronaut.group.position.set(
        Number(data.position?.[0] || 0),
        Number(data.position?.[1] || 0),
        Number(data.position?.[2] || 0) + 8
      );
      astronaut.velocity.set(0, 0, 0);
      cameraCtrl.resetRotation();
      cameraCtrl.update(0.016);
      return { id: data.id, name: data.name, position: astronaut.group.position.toArray() };
    };
    const collectPreviewModelStatus = () => gameData.getExhibits().map((data) => {
          const record = exhibitMgr.records.get(data.id);
          return {
            id: data.id,
            name: data.name,
            expected: data.model_path || '',
            companionExpected: data.companion_model_path || '',
            loaded: record?.modelGroup?.userData?.modelSource || 'missing',
            companionLoaded: record?.modelGroup?.userData?.companionSource || '',
            childCount: record?.modelGroup?.children?.length || 0,
          };
        });
    window.__XINGTU_PREVIEW__ = {
      moveToExhibit: moveToPreviewExhibit,
      modelStatus: collectPreviewModelStatus,
    };
    // DOM 桥仅存在于 preview 模式，供自动化验收在页面隔离环境下触发移动和读取状态。
    const previewCommand = document.createElement('input');
    previewCommand.id = 'xingtu-preview-command';
    previewCommand.type = 'text';
    previewCommand.setAttribute('aria-label', '本地视觉验收命令');
    previewCommand.style.cssText = 'position:fixed;left:1px;top:1px;width:2px;height:2px;opacity:.001;z-index:2147483647;';
    const previewBridge = document.createElement('button');
    previewBridge.id = 'xingtu-preview-bridge';
    previewBridge.type = 'button';
    previewBridge.setAttribute('aria-label', '本地视觉验收');
    previewBridge.style.cssText = 'position:fixed;left:4px;top:1px;width:2px;height:2px;opacity:.001;z-index:2147483647;';
    previewBridge.addEventListener('click', () => {
      const command = previewCommand.value;
      const result = command === 'status'
        ? collectPreviewModelStatus()
        : moveToPreviewExhibit(command);
      previewBridge.dataset.result = JSON.stringify(result);
    });
    document.body.appendChild(previewCommand);
    document.body.appendChild(previewBridge);
  } else if (previewMode === 'beacon' || previewMode === 'beacon-ready') {
    startOverlay.classList.add('hidden');
    if (window.XINGTU_HOME) window.XINGTU_HOME.destroy();
    hidePauseOverlay(true);
    state = 'playing';
    astronaut.enabled = false;
    const beaconZ = futureBeacon.position.z;
    astronaut.group.position.set(0, 0, previewMode === 'beacon-ready' ? beaconZ + 16 : beaconZ + 55);
    astronaut.velocity.set(0, 0, 0);
    cameraCtrl.resetRotation();
    cameraCtrl.update(0);
    hud.show();
  }
  animate();
}

/* ==================== Pointer Lock 与状态切换 ==================== */

function retireStartOverlay() {
  if (window.XINGTU_HOME) window.XINGTU_HOME.exit();
  startOverlay.classList.add('fade-out');
  setTimeout(() => {
    startOverlay.classList.add('hidden');
    if (window.XINGTU_HOME) window.XINGTU_HOME.destroy();
  }, 680);
}

function killPauseMotion() {
  if (pauseTimeline) {
    pauseTimeline.kill();
    pauseTimeline = null;
  }
  if (window.gsap) gsap.killTweensOf([pauseOverlay, pauseDialog, ...pauseActions]);
}

function showPauseOverlay() {
  killPauseMotion();
  pauseOverlay.classList.remove('hidden');
  pauseOverlay.setAttribute('aria-hidden', 'false');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || reduceMotion) {
    pauseOverlay.style.opacity = '1';
    pauseOverlay.style.visibility = 'visible';
    resumeBtn.focus({ preventScroll: true });
    return;
  }

  const parts = [
    pauseOverlay.querySelector('.pause-eyebrow'),
    pauseOverlay.querySelector('.pause-title'),
    pauseOverlay.querySelector('.pause-subtitle'),
    ...pauseActions,
    pauseAudio,
    pauseOverlay.querySelector('.pause-controls'),
    pauseOverlay.querySelector('.pause-foot'),
  ];
  gsap.set([pauseOverlay, pauseDialog, ...parts], { clearProps: 'transform,opacity,visibility' });
  gsap.set(pauseOverlay, { autoAlpha: 1 });
  pauseTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    .addLabel('pause', 0)
    .fromTo(pauseDialog,
      { autoAlpha: 0, y: 16, scale: .985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: .38 },
      'pause')
    .fromTo(parts,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: .29, stagger: .045 },
      'pause+=.12');
  resumeBtn.focus({ preventScroll: true });
}

function hidePauseOverlay(immediate = false) {
  if (pauseOverlay.classList.contains('hidden')) return;
  killPauseMotion();
  pauseOverlay.setAttribute('aria-hidden', 'true');

  const finish = () => {
    pauseOverlay.classList.add('hidden');
    if (window.gsap) gsap.set([pauseOverlay, pauseDialog, ...pauseActions], { clearProps: 'transform,opacity,visibility' });
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (immediate || !window.gsap || reduceMotion) {
    finish();
    return;
  }
  pauseTimeline = gsap.timeline({ onComplete: finish })
    .to(pauseActions, { autoAlpha: 0, y: 5, duration: .13, stagger: .025, ease: 'power1.in' })
    .to(pauseDialog, { autoAlpha: 0, y: 10, scale: .992, duration: .20, ease: 'power2.in' }, '<.02')
    .to(pauseOverlay, { autoAlpha: 0, duration: .16, ease: 'power1.in' }, '<.03');
}

/* ==================== 未来航标：终点提示与结局 ==================== */

function killFutureBeaconPromptMotion() {
  if (futureBeaconPromptTimeline) {
    futureBeaconPromptTimeline.kill();
    futureBeaconPromptTimeline = null;
  }
  if (futureBeaconIdleTween) {
    futureBeaconIdleTween.kill();
    futureBeaconIdleTween = null;
  }
  if (window.gsap) {
    gsap.killTweensOf([
      futureBeaconPrompt,
      futureBeaconPrompt.querySelector('.future-beacon-lock'),
      futureBeaconPrompt.querySelector('.future-beacon-card'),
      futureBeaconPrompt.querySelector('.future-beacon-action'),
    ]);
  }
}

function setFutureBeaconPromptVisible(visible, immediate = false) {
  if (visible === futureBeaconPromptVisible) return;
  futureBeaconPromptVisible = visible;
  killFutureBeaconPromptMotion();

  const lock = futureBeaconPrompt.querySelector('.future-beacon-lock');
  const card = futureBeaconPrompt.querySelector('.future-beacon-card');
  const action = futureBeaconPrompt.querySelector('.future-beacon-action');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (visible) {
    futureBeaconPrompt.classList.remove('hidden');
    futureBeaconPrompt.setAttribute('aria-hidden', 'false');
    if (!window.gsap || reduceMotion || immediate) return;

    gsap.set([futureBeaconPrompt, lock, card, action], { clearProps: 'transform,opacity,visibility' });
    gsap.set(futureBeaconPrompt, { autoAlpha: 1 });
    futureBeaconPromptTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      .addLabel('signal', 0)
      .fromTo(lock,
        { autoAlpha: 0, scale: .72, rotation: -7 },
        { autoAlpha: 1, scale: 1, rotation: 0, duration: .52 },
        'signal')
      .fromTo(card,
        { autoAlpha: 0, x: 18, y: 7, scale: .978 },
        { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: .42 },
        'signal+=.16')
      .fromTo(action,
        { autoAlpha: 0, y: 8, scale: .98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: .34 },
        'signal+=.27');
    futureBeaconIdleTween = gsap.to(lock, {
      rotation: 360,
      duration: 30,
      repeat: -1,
      ease: 'none',
    });
    return;
  }

  futureBeaconPrompt.setAttribute('aria-hidden', 'true');
  const finish = () => {
    futureBeaconPrompt.classList.add('hidden');
    if (window.gsap) gsap.set([futureBeaconPrompt, lock, card, action], { clearProps: 'transform,opacity,visibility' });
  };
  if (immediate || !window.gsap || reduceMotion || futureBeaconPrompt.classList.contains('hidden')) {
    finish();
    return;
  }
  futureBeaconPromptTimeline = gsap.timeline({ onComplete: finish })
    .to(action, { autoAlpha: 0, y: 5, duration: .12, ease: 'power1.in' })
    .to(card, { autoAlpha: 0, x: 8, scale: .985, duration: .16, ease: 'power2.in' }, '<.01')
    .to(lock, { autoAlpha: 0, scale: .88, duration: .19, ease: 'power2.in' }, '<.02');
}

function setFutureBeaconReady(ready, animate = true) {
  if (ready === futureBeaconReady) return;
  futureBeaconReady = ready;
  futureBeaconPrompt.dataset.ready = ready ? 'true' : 'false';
  futureBeaconStatus.textContent = ready ? '最终坐标已锁定' : '航标信号已捕获';
  futureBeaconActionLabel.textContent = ready ? '进入航标' : '继续靠近';
  futureBeaconActionEn.textContent = ready ? 'ENTER BEACON' : 'APPROACH BEACON';

  if (!animate || !window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const action = futureBeaconPrompt.querySelector('.future-beacon-action');
  gsap.killTweensOf(action);
  gsap.fromTo(action,
    { autoAlpha: .72, scale: ready ? .97 : 1.012 },
    { autoAlpha: 1, scale: 1, duration: .30, ease: 'power3.out', overwrite: 'auto' });
}

function updateFutureBeaconPrompt() {
  if (!futureBeacon || state !== 'playing') {
    setFutureBeaconPromptVisible(false);
    return;
  }
  const relation = futureBeacon.getInteractionState(
    astronaut.group.position,
    camera,
    futureBeaconPromptVisible
  );
  setFutureBeaconPromptVisible(relation.visible);
  setFutureBeaconReady(relation.visible && relation.interactive);
  if (relation.visible) {
    futureBeaconDistance.textContent = `${Math.max(0, relation.distance).toFixed(1)} m`;
    // 终点提示优先级高于普通代表物，但只在最后一段航线出现。
    if (interaction.current) interaction.clear();
  }
}

function showMissionComplete() {
  state = 'complete';
  beaconTransit.classList.add('hidden');
  beaconTransit.setAttribute('aria-hidden', 'true');
  missionCompleteOverlay.classList.remove('hidden');
  missionCompleteOverlay.setAttribute('aria-hidden', 'false');

  const parts = [
    missionCompleteOverlay.querySelector('.mission-complete__eyebrow'),
    missionCompleteOverlay.querySelector('.mission-complete__index'),
    missionCompleteOverlay.querySelector('h2'),
    missionCompleteOverlay.querySelector('p'),
    missionCompleteOverlay.querySelector('.mission-complete__rule'),
    missionHomeBtn,
    missionCompleteOverlay.querySelector('.mission-complete__esc'),
  ];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || reduceMotion) {
    missionHomeBtn.focus({ preventScroll: true });
    return;
  }
  gsap.set([missionCompleteOverlay, missionCompleteFrame, ...parts], { clearProps: 'transform,opacity,visibility' });
  missionTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    .fromTo(missionCompleteOverlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: .42 }, 0)
    .fromTo(missionCompleteFrame,
      { autoAlpha: 0, y: 18, scale: .982 },
      { autoAlpha: 1, y: 0, scale: 1, duration: .48 },
      .08)
    .fromTo(parts,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: .34, stagger: .055 },
      .22)
    .call(() => missionHomeBtn.focus({ preventScroll: true }));
}

function enterFutureBeacon() {
  if (state !== 'playing' || !futureBeaconReady) return;
  state = 'beacon';
  gameMusic.stop(true);
  astronaut.enabled = false;
  astronaut.clearKeys();
  astronaut.velocity.set(0, 0, 0);
  interaction.clear();
  cameraCtrl.setFocus(false);
  setFutureBeaconPromptVisible(false, true);
  hud.hide();
  futureBeacon.beginTransit();

  beaconTransit.classList.remove('hidden');
  beaconTransit.setAttribute('aria-hidden', 'false');
  if (cameraCtrl.isLocked) cameraCtrl.unlock();

  const rings = [...beaconTransit.querySelectorAll('.beacon-transit__ring')];
  const core = beaconTransit.querySelector('.beacon-transit__core');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || reduceMotion) {
    setTimeout(playEndingVideo, 450);
    return;
  }
  if (missionTimeline) missionTimeline.kill();
  gsap.set(beaconTransit, { autoAlpha: 0 });
  gsap.set(rings, { autoAlpha: 0, scale: .42, transformOrigin: '50% 50%' });
  gsap.set(core, { autoAlpha: 0, scale: .3 });
  // 穿越动画结束后播放终点视频，视频结束再进入结尾页。
  missionTimeline = gsap.timeline({ onComplete: playEndingVideo })
    .addLabel('transit', 0)
    .to(beaconTransit, { autoAlpha: 1, duration: .24, ease: 'power2.out' }, 'transit')
    .to(rings, {
      autoAlpha: 1,
      scale: 2.75,
      duration: 1.22,
      stagger: .08,
      ease: 'power3.in',
    }, 'transit')
    .to(core, { autoAlpha: 1, scale: 8, duration: .82, ease: 'power3.in' }, 'transit+=.34')
    .to(beaconTransit, { autoAlpha: 0, duration: .30, ease: 'power2.in' }, 'transit+=1.04');
}

/** 抵达航标后的终点视频：播完自动进入结尾页；播放异常时直接进结尾页。 */
function playEndingVideo() {
  // 先用半秒左右的柔和叠化承接航标穿越的亮光，再让视频完全接管画面。
  // 这样不会从游戏画面“硬切”到黑场/视频第一帧，结尾动画进入更自然。
  clearTimeout(endingTransitionFallback);
  if (endingTransitionTimeline) endingTransitionTimeline.kill();

  endingVideoActive = false;
  endingVideoOverlay.classList.remove('hidden');
  endingVideoOverlay.setAttribute('aria-hidden', 'false');
  endingVideo.currentTime = 0;
  endingVideo.volume = 0;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const handOffToVideo = () => {
    endingVideoActive = true;
    endingVideo.volume = 0.6;
  };

  const playPromise = endingVideo.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      endingVideoActive = false;
      endingVideoOverlay.classList.add('hidden');
      endingVideoOverlay.setAttribute('aria-hidden', 'true');
      showMissionComplete();
    });
  }

  if (!window.gsap || reduceMotion) {
    handOffToVideo();
    return;
  }

  gsap.set(endingVideoOverlay, { autoAlpha: 0 });
  gsap.set(endingVideo, { autoAlpha: 0, scale: 1.018, filter: 'blur(8px)' });
  endingTransitionTimeline = gsap.timeline({ onComplete: handOffToVideo })
    .to(endingVideoOverlay, { autoAlpha: 1, duration: .68, ease: 'power2.inOut' }, 0)
    .to(endingVideo, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: .92, ease: 'power2.out' }, .12)
    .to(endingVideo, { volume: .6, duration: 1.15, ease: 'sine.out' }, .08);

  // 兜底：如果浏览器没有触发时间线完成回调，也确保最终交给视频层。
  endingTransitionFallback = setTimeout(handOffToVideo, 1400);
}

/** 终点视频结束（或无法播放）→ 收掉视频层，展示结尾页 */
function endEndingVideo() {
  clearTimeout(endingTransitionFallback);
  if (endingTransitionTimeline) endingTransitionTimeline.kill();
  endingVideo.pause();
  endingVideoActive = false;

  const finish = () => {
    endingVideoOverlay.classList.add('hidden');
    endingVideoOverlay.setAttribute('aria-hidden', 'true');
    if (window.gsap) gsap.set([endingVideoOverlay, endingVideo], { clearProps: 'opacity,visibility,transform,filter' });
    showMissionComplete();
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || reduceMotion) {
    finish();
    return;
  }

  endingTransitionTimeline = gsap.timeline({ onComplete: finish })
    .to(endingVideo, { autoAlpha: 0, scale: 1.012, filter: 'blur(6px)', duration: .46, ease: 'power2.in' }, 0)
    .to(endingVideoOverlay, { autoAlpha: 0, duration: .58, ease: 'power2.inOut' }, .12);
}

/** 结尾页按 ESC：弹出返回主页确认框 */
function showEndingConfirm() {
  state = 'ending-confirm';
  endingConfirmOverlay.classList.remove('hidden');
  endingConfirmOverlay.setAttribute('aria-hidden', 'false');
  endingHomeConfirmBtn.focus({ preventScroll: true });
}

/** 关闭确认框回到结尾页（再按 ESC 或点“再看看”） */
function hideEndingConfirm() {
  state = 'complete';
  endingConfirmOverlay.classList.add('hidden');
  endingConfirmOverlay.setAttribute('aria-hidden', 'true');
}

function returnToHome() {
  if (state !== 'paused') return;
  state = 'returning';
  gameMusic.stop(true);
  astronaut.enabled = false;
  astronaut.clearKeys();
  interaction.clear();
  hud.hide();
  resumeBtn.disabled = true;
  returnHomeBtn.disabled = true;

  const reloadHome = () => window.location.reload();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || reduceMotion) {
    reloadHome();
    return;
  }
  killPauseMotion();
  pauseTimeline = gsap.timeline({ onComplete: reloadHome })
    .to(pauseActions, { autoAlpha: 0, x: -8, duration: .15, stagger: .025, ease: 'power1.in' })
    .to(pauseDialog, { autoAlpha: 0, scale: .985, duration: .22, ease: 'power2.in' }, '<.02')
    .to(pauseOverlay, { autoAlpha: 0, duration: .18, ease: 'power1.in' }, '<');
}

/**
 * ESC 关闭上层界面后先回到游玩态，等 keyup 再请求 Pointer Lock。
 * 避免同一次 ESC 在锁定成功后又被浏览器解释成“退出锁定”。
 */
function resumePlayingAfterEscape() {
  pendingEscapeRelock = true;
  suppressPauseUnlockUntil = performance.now() + 500;
  state = 'playing';
  astronaut.enabled = true;
  hidePauseOverlay();
  hud.show();
}

function finishLaunchSequence() {
  if (cameraCtrl.isLocked) {
    state = 'playing';
    astronaut.enabled = true;
    hidePauseOverlay(true);
    hud.show();
    gameMusic.start();
  } else {
    state = 'paused';
    astronaut.enabled = false;
    hud.hide();
    showPauseOverlay();
  }
}

function beginLaunchSequence() {
  if (launchStarted || state !== 'boot') return;
  launchStarted = true;
  // 在点击手势中激活音频上下文；首页与过场仍然保持静音。
  gameMusic.arm();
  state = 'transitioning';
  astronaut.enabled = false;
  astronaut.clearKeys();
  hud.hide();
  hidePauseOverlay(true);
  retireStartOverlay();

  const cinematic = window.XINGTU_CINEMATIC;
  if (cinematic) {
    cinematic.start({
      blackHold: 2.1,
      onReveal: () => {
        if (cameraCtrl.isLocked) hud.show();
      },
      onComplete: finishLaunchSequence,
    });
  } else {
    setTimeout(finishLaunchSequence, 3000);
  }

  // 保持在用户点击手势中请求鼠标锁定，过场结束后无需再次点击。
  cameraCtrl.lock();
  if (document.activeElement) document.activeElement.blur();
}

function bindPointerLockEvents() {
  cameraCtrl.onlock = () => {
    if (state === 'transitioning') {
      astronaut.enabled = false;
      hidePauseOverlay(true);
      hud.hide();
      return;
    }

    // 进入游戏
    state = 'playing';
    astronaut.enabled = true;
    pendingEscapeRelock = false;
    hidePauseOverlay();
    hud.show();
    gameMusic.start();
    // 让残留焦点元素失焦，防止空格键误触发按钮
    if (document.activeElement) document.activeElement.blur();
  };

  cameraCtrl.onunlock = () => {
    // 编辑器打开时不禁用宇航员，允许继续 WASD 移动
    if (state !== 'editor') {
      astronaut.enabled = false;
      astronaut.clearKeys();
    }
    // 过场期间 ESC 只释放鼠标，不打断视频或显示暂停层。
    if (state === 'transitioning') return;
    // 主动解锁打开面板时不显示暂停画面
    if (state === 'info' || state === 'editor' || state === 'beacon' || state === 'complete') return;
    // 详情 / 暂停层的 ESC 已经消费；忽略同一次按键造成的延迟 unlock。
    if (state === 'playing' && performance.now() < suppressPauseUnlockUntil) {
      suppressPauseUnlockUntil = 0;
      astronaut.enabled = true;
      hud.show();
      return;
    }
    // 浏览器 ESC 触发的解锁 → 暂停
    state = 'paused';
    hud.setPrompt(null);
    interaction.clear();
    hud.hide();
    showPauseOverlay();
  };

  startBtn.addEventListener('click', beginLaunchSequence);
  resumeBtn.addEventListener('click', () => {
    if (state === 'paused') cameraCtrl.lock();
  });
  returnHomeBtn.addEventListener('click', returnToHome);
  missionHomeBtn.addEventListener('click', () => {
    if (state === 'complete') window.location.reload();
  });
  endingVideo.addEventListener('ended', endEndingVideo);
  endingStayBtn.addEventListener('click', hideEndingConfirm);
  endingHomeConfirmBtn.addEventListener('click', () => window.location.reload());

  // 若浏览器拒绝在 ESC 键事件里重新锁定，点击游戏画面仍可无缝恢复操控。
  renderer.domElement.addEventListener('click', () => {
    if (state === 'playing' && !cameraCtrl.isLocked) cameraCtrl.lock();
  });
}

/** 打开详情面板（释放鼠标） */
function openInfo(data) {
  state = 'info';
  hud.setPrompt(null);
  cameraCtrl.setFocus(false);
  cameraCtrl.unlock();
  infoPanel.show(data);
}

/** 详情面板关闭 → 恢复操控 */
function resumeFromInfo() {
  if (state !== 'info') return;
  const closedByEscape = infoClosingByEscape;
  infoClosingByEscape = false;
  state = 'playing';
  if (closedByEscape) {
    resumePlayingAfterEscape();
  } else {
    cameraCtrl.lock(); // 点击关闭按钮属于稳定的用户手势，可直接重新锁定
  }
  // 若仍处于交互范围内，主动恢复接近提示与相机聚焦
  if (interaction.current) {
    hud.setPrompt(interaction.current.data);
    hud.setPromptInteractive(interaction.isInteractive, false);
    cameraCtrl.setFocus(true);
  }
}

/** 打开编辑面板（释放鼠标锁定以显示光标，但保持游戏可WASD移动） */
function openEditor() {
  state = 'editor';
  hud.setPrompt(null);
  interaction.clear();
  cameraCtrl.setFocus(false);
  hud.hide();
  document.body.classList.add('editor-open');
  // 释放 pointer lock，让鼠标光标可见
  cameraCtrl.unlock();
  // unlock 事件会将 enabled 设为 false，这里重新启用以允许 WASD 移动
  astronaut.enabled = true;
  editorPanel.open();
}

/** 关闭编辑面板并恢复 pointer lock */
function closeEditorAndLock() {
  if (state !== 'editor') return;
  editorPanel.close();
  document.body.classList.remove('editor-open');
  state = 'playing';
  hud.show();
  // 重新锁定鼠标
  cameraCtrl.lock();
}

/** 数据增删改后刷新 HUD 时间线与交互状态 */
function refreshAfterDataChange() {
  hud.buildTimeline(gameData.getExhibits(), settings);
  interaction.clear();
}

/* ==================== 全局按键 ==================== */

function bindGlobalKeys() {
  window.addEventListener('keydown', (e) => {
    // E：编辑面板开关
    if (e.code === 'KeyE') {
      if (state === 'playing') openEditor();
      else if (state === 'editor') closeEditorAndLock();
      return;
    }

    // ESC：面板打开时关闭并返回游戏（锁定时 ESC 由浏览器处理为解锁 → 暂停）
    if (e.code === 'Escape') {
      if (state === 'info') {
        // 详情层只返回游戏；阻止同一次 ESC 继续触发浏览器的 Pointer Lock 退出逻辑。
        e.preventDefault();
        e.stopPropagation();
        infoClosingByEscape = true;
        infoPanel.hide();
      } else if (state === 'editor') {
        e.preventDefault();
        e.stopPropagation();
        closeEditorAndLock();
      } else if (state === 'paused') {
        e.preventDefault();
        e.stopPropagation();
        resumePlayingAfterEscape();
      } else if (state === 'complete') {
        // 结尾页按 ESC → 弹出返回主页确认框（与游戏暂停层同样的层级感）
        e.preventDefault();
        e.stopPropagation();
        showEndingConfirm();
      } else if (state === 'ending-confirm') {
        // 再按 ESC → 关闭弹窗，回到结尾页
        e.preventDefault();
        e.stopPropagation();
        hideEndingConfirm();
      }
      return;
    }

    // F：查看代表物详情
    if (state === 'playing' && e.code === 'KeyF') {
      if (futureBeaconReady) {
        enterFutureBeacon();
      } else {
        const rec = interaction.current;
        if (rec && interaction.isInteractive) openInfo(rec.data);
        else if (rec) hud.nudgePrompt();
      }
    }

    // R：回到初始位置（指引线起点）并归正朝向
    if (state === 'playing' && e.code === 'KeyR') {
      astronaut.group.position.set(0, 0, 0);
      astronaut.group.rotation.set(0, Math.PI, 0);
      astronaut.velocity.set(0, 0, 0);
    }

    // H：虫洞调节面板开关
    if (e.code === 'KeyH') {
      e.preventDefault();
      if (wormholeEditor) wormholeEditor.toggle();
    }
  });

  // 窗口失焦时清空按键，防止按键卡死
  window.addEventListener('blur', () => astronaut.clearKeys());

  // ESC 的默认退出锁定行为已在 keydown 完成；keyup 时再安全恢复视角控制。
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Escape' || !pendingEscapeRelock) return;
    e.preventDefault();
    e.stopPropagation();
    pendingEscapeRelock = false;
    if (state === 'playing' && !cameraCtrl.isLocked) cameraCtrl.lock();
  });
}

/* ==================== 渲染循环 ==================== */

let lastHudZ = Infinity;
const _promptAnchor = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  // 限制大帧（切换标签页返回时避免瞬移）
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // 首页和视频完全遮挡 3D 场景时停止所有 WebGL/CSS2D 更新与绘制，
  // 把 GPU 与主线程预算让给分层首页和硬件视频解码。
  if (document.hidden || state === 'boot' || state === 'transitioning') return;
  // 终点视频播放中：画面被不透明视频层完全覆盖，暂停一切 3D 更新与渲染。
  if (endingVideoActive) return;

  if (state === 'playing' || state === 'editor') {
    astronaut.update(dt, cameraCtrl.viewPivot);
    // 编辑器打开时不更新交互检测，防止靠近时自动显示设施名字
    if (state === 'playing') {
      interaction.update(camera);
    }
  }

  cameraCtrl.update(dt);
  updateFutureBeaconPrompt();

  // 接近信息卡跟随代表物的屏幕投影，并显示实时距离。
  if (state === 'playing' && interaction.current) {
    const rec = interaction.current;
    // 锚点取模型视觉中心：GLB 原点未必居中，且模型在缓慢自转，
    // 直接用 root.position 会导致锁定框偏离飞行器。
    const uiCenter = rec.modelGroup.userData.uiCenter;
    if (uiCenter) {
      _promptAnchor.copy(uiCenter)
        .applyEuler(rec.modelGroup.rotation)
        .multiplyScalar(rec.root.scale.x)
        .add(rec.root.position);
    } else {
      _promptAnchor.copy(rec.root.position);
    }
    hud.updatePromptTarget(
      _promptAnchor,
      interaction.currentDistance,
      camera,
      interaction.isInteractive
    );
  }

  exhibitMgr.update(time, dt, astronaut.group.position);
  environment.update(time, dt, astronaut.group.position);
  futureBeacon.update(time, dt, astronaut.group.position);

  // 更新 TransformControls（如果编辑器打开且有选中对象）
  if (editorPanel && editorPanel.transformControls) {
    editorPanel.transformControls.update();
  }

  // HUD 进度节流：Z 变化超过 0.3 才刷新 DOM
  const z = astronaut.group.position.z;
  if (Math.abs(z - lastHudZ) > 0.3) {
    hud.updateProgress(z);
    lastHudZ = z;
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

/* ==================== 窗口自适应 ==================== */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

/* ==================== 启动 ==================== */

init();

})();
