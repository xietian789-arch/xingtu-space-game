/**
 * main.js —— 程序入口模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 初始化 Three.js 场景 / 渲染器 / CSS2DRenderer / 相机
 *  2. 协调各功能模块（数据、环境、宇航员、相机、代表物、交互、HUD、面板）
 *  3. 管理全局状态机：boot / playing / paused / info / editor
 *  4. 启动画面（点击进入 pointer lock）与暂停恢复流程
 */

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import GameData from './GameData.js';
import SpaceEnvironment from './SpaceEnvironment.js';
import AstronautController from './AstronautController.js';
import CameraController from './CameraController.js';
import ExhibitManager from './ExhibitManager.js';
import InteractionSystem from './InteractionSystem.js';
import HUD from './HUD.js';
import InfoPanel from './InfoPanel.js';
import EditorPanel from './EditorPanel.js';

/* ==================== 全局状态 ==================== */

/** 状态机：boot=启动画面 playing=游玩 paused=暂停 info=详情面板 editor=编辑面板 */
let state = 'boot';

/* ==================== 场景基础 ==================== */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005); // 近乎纯黑的深空

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// CSS2DRenderer：叠加渲染中文名称标签，保证文字清晰
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.classList.add('css2d-layer');
document.body.appendChild(labelRenderer.domElement);

const clock = new THREE.Clock();

/* ==================== DOM 引用 ==================== */

const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');

/* ==================== 模块实例 ==================== */

const gameData = new GameData();
const hud = new HUD();

let settings = {};
let environment, astronaut, cameraCtrl, exhibitMgr, interaction, infoPanel, editorPanel;

/* ==================== 初始化 ==================== */

async function init() {
  startBtn.textContent = '数 据 加 载 中 …';
  try {
    await gameData.load();
  } catch (err) {
    startBtn.textContent = '数据加载失败，请检查 data 目录';
    window.__XINGTU_FAIL__ = true;
    console.error(err);
    return;
  }
  settings = gameData.getSettings();

  // 太空环境（星空 / 雾 / 时间线光带 / 星云）
  environment = new SpaceEnvironment(scene);
  environment.build(settings);

  // 宇航员 + 相机
  astronaut = new AstronautController(scene, settings);
  cameraCtrl = new CameraController(camera, renderer.domElement, astronaut, settings);

  // 代表物
  exhibitMgr = new ExhibitManager(scene);
  exhibitMgr.buildAll(gameData.getExhibits());

  // 交互系统：进入 / 离开范围时更新 HUD 提示与相机聚焦
  interaction = new InteractionSystem(astronaut, exhibitMgr, {
    onProximityChange: (data) => {
      hud.setPrompt(data);
      cameraCtrl.setFocus(!!data);
    },
  });

  // 详情面板
  infoPanel = new InfoPanel({
    onClose: () => resumeFromInfo(),
  });

  // 编辑面板
  editorPanel = new EditorPanel(gameData, exhibitMgr, hud, {
    onDataChanged: refreshAfterDataChange,
    onCloseRequested: () => closeEditorAndLock(),
  });

  hud.buildTimeline(gameData.getExhibits());

  bindPointerLockEvents();
  bindGlobalKeys();

  startBtn.textContent = '点 击 开 始';
  window.__XINGTU_READY__ = true; // 就绪标记：供 index.html 诊断脚本检测
  animate();
}

/* ==================== Pointer Lock 与状态切换 ==================== */

function bindPointerLockEvents() {
  cameraCtrl.controls.addEventListener('lock', () => {
    // 进入游戏
    state = 'playing';
    astronaut.enabled = true;
    startOverlay.classList.add('fade-out');
    setTimeout(() => startOverlay.classList.add('hidden'), 500);
    pauseOverlay.classList.add('hidden');
    hud.show();
    // 让残留焦点元素失焦，防止空格键误触发按钮
    if (document.activeElement) document.activeElement.blur();
  });

  cameraCtrl.controls.addEventListener('unlock', () => {
    astronaut.enabled = false;
    astronaut.clearKeys();
    // 主动解锁打开面板时不显示暂停画面
    if (state === 'info' || state === 'editor') return;
    // 浏览器 ESC 触发的解锁 → 暂停
    state = 'paused';
    hud.setPrompt(null);
    interaction.clear();
    hud.hide();
    pauseOverlay.classList.remove('hidden');
  });

  startBtn.addEventListener('click', () => cameraCtrl.lock());
  resumeBtn.addEventListener('click', () => cameraCtrl.lock());
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
  state = 'playing';
  cameraCtrl.lock(); // ESC 键 / 点击均为用户手势，可重新锁定
  // 若仍处于交互范围内，主动恢复接近提示与相机聚焦
  if (interaction.current) {
    hud.setPrompt(interaction.current.data);
    cameraCtrl.setFocus(true);
  }
}

/** 打开编辑面板（释放鼠标） */
function openEditor() {
  state = 'editor';
  hud.setPrompt(null);
  interaction.clear();
  cameraCtrl.setFocus(false);
  cameraCtrl.unlock();
  hud.hide();
  editorPanel.open();
}

/** 关闭编辑面板并恢复操控 */
function closeEditorAndLock() {
  if (state !== 'editor') return;
  editorPanel.close();
  state = 'playing';
  cameraCtrl.lock();
}

/** 数据增删改后刷新 HUD 时间线与交互状态 */
function refreshAfterDataChange() {
  hud.buildTimeline(gameData.getExhibits());
  interaction.clear();
}

/* ==================== 全局按键 ==================== */

function bindGlobalKeys() {
  window.addEventListener('keydown', (e) => {
    // Tab：编辑面板开关（阻止浏览器默认焦点切换）
    if (e.code === 'Tab') {
      e.preventDefault();
      if (state === 'playing') openEditor();
      else if (state === 'editor') closeEditorAndLock();
      return;
    }

    // ESC：面板打开时关闭并返回游戏（锁定时 ESC 由浏览器处理为解锁 → 暂停）
    if (e.code === 'Escape') {
      if (state === 'info') {
        infoPanel.hide();
      } else if (state === 'editor') {
        closeEditorAndLock();
      }
      return;
    }

    // F：查看代表物详情
    if (state === 'playing' && e.code === 'KeyF') {
      const rec = interaction.current;
      if (rec) openInfo(rec.data);
    }
  });

  // 窗口失焦时清空按键，防止按键卡死
  window.addEventListener('blur', () => astronaut.clearKeys());
}

/* ==================== 渲染循环 ==================== */

let lastHudZ = Infinity;

function animate() {
  requestAnimationFrame(animate);

  // 限制大帧（切换标签页返回时避免瞬移）
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (state === 'playing') {
    astronaut.update(dt, cameraCtrl.viewPivot);
    interaction.update();
  }

  cameraCtrl.update(dt);
  exhibitMgr.update(time, dt);
  environment.update(time, dt);

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
