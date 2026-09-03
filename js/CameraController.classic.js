// CameraController.js —— 平滑鼠标跟随视角（无 PointerLockControls 依赖）
(function () {

const { Object3D, Vector3, MathUtils } = THREE;

class CameraController {
  constructor(camera, rendererDom, astronaut, settings) {
    this.camera = camera;
    this.astronaut = astronaut;
    this.rendererDom = rendererDom;

    this.viewPivot = new Object3D();
    this.viewPivot.rotation.order = 'YXZ';

    this.distance = settings.camera_distance || 10;
    this.minDistance = 3;
    this.maxDistance = 30;

    this.firstPerson = false;

    this.baseFov = 70;
    this.focusFov = 60;
    this.targetFov = this.baseFov;
    camera.fov = this.baseFov;

    // 平滑旋转
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;

    this.sensitivity = 0.002;
    this.smoothFactor = 8;

    this._offset = new Vector3();
    this._isLocked = false;
    this.enabled = true;

    // 兼容旧 PointerLockControls 事件回调
    this.onlock = null;
    this.onunlock = null;

    this._bindEvents();
  }

  _bindEvents() {
    const dom = this.rendererDom;

    // 滚轮缩放
    window.addEventListener('wheel', (e) => {
      if (!this._isLocked) return;
      this.distance += e.deltaY * 0.01;
      this.distance = MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);
    }, { passive: true });

    // V 键切换视角
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV' && this._isLocked) this.toggleView();
    });

    // 鼠标移动 → 直接更新目标旋转
    document.addEventListener('mousemove', (e) => {
      if (!this._isLocked) return;
      const MAX_DELTA = 100;
      const dx = MathUtils.clamp(e.movementX, -MAX_DELTA, MAX_DELTA);
      const dy = MathUtils.clamp(e.movementY, -MAX_DELTA, MAX_DELTA);
      this.targetYaw -= dx * this.sensitivity;
      this.targetPitch -= dy * this.sensitivity;
      this.targetPitch = MathUtils.clamp(this.targetPitch, -1.48, 1.48); // ±85°
    });

    // 锁定状态同步 + 回调
    document.addEventListener('pointerlockchange', () => {
      const locked = (document.pointerLockElement === dom);
      if (locked === this._isLocked) return;
      this._isLocked = locked;
      if (locked) { if (this.onlock) this.onlock(); }
      else { if (this.onunlock) this.onunlock(); }
    });
  }

  /* ---------------- 原生指针锁定 ---------------- */

  lock() {
    this.rendererDom.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  get isLocked() {
    return this._isLocked;
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.astronaut.modelGroup.visible = !this.firstPerson;
  }

  setFocus(on) {
    this.targetFov = on ? this.focusFov : this.baseFov;
  }

  /** 重置相机旋转（同步内部状态） */
  resetRotation() {
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.viewPivot.rotation.set(0, 0, 0, 'YXZ');
  }

  /* ---------------- 帧更新 ---------------- */

  update(dt) {
    const pivot = this.viewPivot;

    // 限制 dt 防止切标签页后大跳
    dt = Math.min(dt, 0.1);

    // 1. 平滑插值旋转
    const t = 1 - Math.exp(-this.smoothFactor * dt);
    this.currentYaw += (this.targetYaw - this.currentYaw) * t;
    this.currentPitch += (this.targetPitch - this.currentPitch) * t;

    // 2. 枢轴跟随宇航员（位置）
    pivot.position.set(
      this.astronaut.group.position.x,
      this.astronaut.group.position.y + 0.9,
      this.astronaut.group.position.z
    );
    // 3. 应用旋转
    pivot.rotation.set(this.currentPitch, this.currentYaw, 0, 'YXZ');

    // 4. 相机定位
    if (this.firstPerson) {
      this.camera.position.copy(pivot.position).add(this._offset.set(0, 0.55, 0.1));
      this.camera.quaternion.copy(pivot.quaternion);
    } else {
      this._offset.set(0, 2.0, this.distance).applyQuaternion(pivot.quaternion);
      this.camera.position.copy(pivot.position).add(this._offset);
      this.camera.quaternion.copy(pivot.quaternion);
    }

    // 5. FOV 平滑趋近
    const diff = this.targetFov - this.camera.fov;
    if (Math.abs(diff) > 0.01) {
      this.camera.fov += diff * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  }
}

XINGTU.CameraController = CameraController;

})();
