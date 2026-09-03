/**
 * CameraController.js —— 相机系统模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 基于 PointerLockControls 的鼠标锁定视角（作用于一个视角枢轴对象）
 *  2. 默认第三人称跟随相机（宇航员后上方），滚轮缩放（3~30 单位）
 *  3. 按 V 键切换第一人称视角（相机移到宇航员头部，隐藏身体）
 *  4. 靠近代表物时 FOV 微缩，产生轻微望远镜聚焦感
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera 主相机
   * @param {HTMLElement} rendererDom WebGL 画布元素
   * @param {AstronautController} astronaut 宇航员控制器
   * @param {Object} settings exhibits.json 中的 settings
   */
  constructor(camera, rendererDom, astronaut, settings) {
    this.camera = camera;
    this.astronaut = astronaut;

    /**
     * 视角枢轴：PointerLockControls 只负责旋转这个对象（yaw / pitch），
     * 相机位置由本模块根据「第三人称 / 第一人称」模式计算。
     */
    this.viewPivot = new THREE.Object3D();
    this.viewPivot.rotation.order = 'YXZ';
    this.viewPivot.rotation.y = Math.PI; // 初始面向 -Z（时间线深处）

    this.controls = new PointerLockControls(this.viewPivot, rendererDom);
    this.controls.pointerSpeed = 1.0;

    /** 相机距离（滚轮可调） */
    this.distance = settings.camera_distance || 10;
    this.minDistance = 3;
    this.maxDistance = 30;

    /** 第一人称开关 */
    this.firstPerson = false;

    /** FOV 聚焦效果 */
    this.baseFov = 70;
    this.focusFov = 60;
    this.targetFov = this.baseFov;
    camera.fov = this.baseFov;

    this._offset = new THREE.Vector3();

    this._bindEvents();
  }

  _bindEvents() {
    // 滚轮缩放相机距离
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.controls.isLocked) return;
        this.distance += e.deltaY * 0.01;
        this.distance = THREE.MathUtils.clamp(
          this.distance, this.minDistance, this.maxDistance
        );
      },
      { passive: true }
    );

    // V 键切换第一 / 第三人称
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV' && this.controls.isLocked) {
        this.toggleView();
      }
    });
  }

  /** 切换第一 / 第三人称视角 */
  toggleView() {
    this.firstPerson = !this.firstPerson;
    // 第一人称隐藏宇航员身体，避免挡住视线
    this.astronaut.modelGroup.visible = !this.firstPerson;
  }

  /* ---------------- Pointer Lock 封装 ---------------- */

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  /** 靠近代表物时调用，产生轻微望远镜聚焦感 */
  setFocus(on) {
    this.targetFov = on ? this.focusFov : this.baseFov;
  }

  /* ---------------- 帧更新 ---------------- */

  /**
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    const pivot = this.viewPivot;

    // 枢轴跟随宇航员（头部高度附近）
    pivot.position.set(
      this.astronaut.group.position.x,
      this.astronaut.group.position.y + 0.9,
      this.astronaut.group.position.z
    );

    if (this.firstPerson) {
      // 第一人称：相机位于头部，直接继承枢轴朝向
      this.camera.position.copy(pivot.position).add(this._offset.set(0, 0.55, 0.1));
      this.camera.quaternion.copy(pivot.quaternion);
    } else {
      // 第三人称：相机位于枢轴后上方 distance 个单位
      this._offset.set(0, 2.0, this.distance).applyQuaternion(pivot.quaternion);
      this.camera.position.copy(pivot.position).add(this._offset);
      this.camera.quaternion.copy(pivot.quaternion);
    }

    // FOV 平滑趋近目标值
    const diff = this.targetFov - this.camera.fov;
    if (Math.abs(diff) > 0.01) {
      this.camera.fov += diff * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  }
}

export default CameraController;
