/**
 * AstronautController.js —— 宇航员控制器模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 以 THREE.Group 为根节点构建宇航员占位模型（胶囊体 + 头盔 + 背包）
 *  2. 处理 WASD / 空格 / Shift / E 加速输入，移动方向相对相机朝向
 *  3. 使用阻尼插值 + 惯性漂移模拟太空失重感
 *  4. 模型平滑转向移动方向；身上挂载暖色 PointLight 提供局部照明
 */

import * as THREE from 'three';

class AstronautController {
  /**
   * @param {THREE.Scene} scene 主场景
   * @param {Object} settings exhibits.json 中的 settings（move_speed / boost_speed）
   */
  constructor(scene, settings) {
    this.scene = scene;
    this.moveSpeed = settings.move_speed || 18;      // 默认移动速度（单位/秒）
    this.boostSpeed = settings.boost_speed || 45;    // 加速后速度

    /** 当前速度向量（含惯性） */
    this.velocity = new THREE.Vector3();
    /** 是否允许移动（由主状态机控制） */
    this.enabled = false;

    /** 按键状态表 */
    this.keys = {};

    // 复用向量，避免每帧 new
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._target = new THREE.Vector3();
    this._dummy = new THREE.Object3D();

    this._buildModel();
    this._bindKeys();
  }

  /* ---------------- 占位模型 ---------------- */

  /** 用基本几何体拼一名宇航员：胶囊身体 + 球形头盔 + 面罩 + 背包 */
  _buildModel() {
    this.group = new THREE.Group();
    this.group.name = 'astronaut';

    const suitMat = new THREE.MeshStandardMaterial({
      color: 0xe8edf5,
      metalness: 0.25,
      roughness: 0.55,
      emissive: 0x223344,
      emissiveIntensity: 0.15,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xf2f5fa,
      metalness: 0.4,
      roughness: 0.3,
      emissive: 0x1a2a3a,
      emissiveIntensity: 0.2,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x1a2f55,
      metalness: 0.9,
      roughness: 0.12,
      emissive: 0x2255aa,
      emissiveIntensity: 0.55,
    });
    const packMat = new THREE.MeshStandardMaterial({
      color: 0xb8c2d4,
      metalness: 0.5,
      roughness: 0.45,
    });

    // 身体：胶囊体
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 6, 14), suitMat);
    body.position.y = -0.15;

    // 头盔：球体
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.36, 22, 18), helmetMat);
    helmet.position.y = 0.82;

    // 面罩：略扁球体，置于头盔前侧（模型朝向 +Z）
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), visorMat);
    visor.scale.set(1, 0.82, 0.72);
    visor.position.set(0, 0.83, 0.17);

    // 背包：生命维持系统
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), packMat);
    pack.position.set(0, 0.12, -0.42);

    // 手臂：两根短胶囊，微微张开
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.55, 4, 10);
    const armL = new THREE.Mesh(armGeo, suitMat);
    armL.position.set(0.56, 0.05, 0);
    armL.rotation.z = 0.35;
    const armR = new THREE.Mesh(armGeo, suitMat);
    armR.position.set(-0.56, 0.05, 0);
    armR.rotation.z = -0.35;

    // 腿：两根短胶囊
    const legGeo = new THREE.CapsuleGeometry(0.15, 0.5, 4, 10);
    const legL = new THREE.Mesh(legGeo, suitMat);
    legL.position.set(0.2, -0.95, 0);
    const legR = new THREE.Mesh(legGeo, suitMat);
    legR.position.set(-0.2, -0.95, 0);

    // 胸前指示灯
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x66ffcc, emissive: 0x33ffaa, emissiveIntensity: 2,
      })
    );
    beacon.position.set(0.18, 0.28, 0.4);

    this.modelGroup = new THREE.Group();
    this.modelGroup.add(body, helmet, visor, pack, armL, armR, legL, legR, beacon);
    this.group.add(this.modelGroup);

    // 宇航员随身暖色点光源：提供局部照明
    this.lamp = new THREE.PointLight(0xffdcaa, 1.4, 18, 1.6);
    this.lamp.position.set(0, 0.6, 0.4);
    this.group.add(this.lamp);

    // 初始位置：航线起点，面向 -Z（时间线深处）
    this.group.position.set(0, 0, 8);
    this.group.rotation.y = Math.PI; // 模型 +Z 为正面，转 π 后面向 -Z
    this.scene.add(this.group);
  }

  /* ---------------- 输入 ---------------- */

  _bindKeys() {
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /* ---------------- 帧更新 ---------------- */

  /**
   * @param {number} dt 帧间隔（秒）
   * @param {THREE.Object3D} viewObject 相机视角对象（提供朝向）
   */
  update(dt, viewObject) {
    if (!this.enabled) return;

    // 1. 以视角朝向计算目标速度
    viewObject.getWorldQuaternion(this._dummy.quaternion);
    this._forward.set(0, 0, -1).applyQuaternion(this._dummy.quaternion);
    this._right.set(1, 0, 0).applyQuaternion(this._dummy.quaternion);

    this._target.set(0, 0, 0);
    if (this.keys['KeyW']) this._target.add(this._forward);
    if (this.keys['KeyS']) this._target.sub(this._forward);
    if (this.keys['KeyD']) this._target.add(this._right);
    if (this.keys['KeyA']) this._target.sub(this._right);
    if (this.keys['Space']) this._target.add(this._up);
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) this._target.sub(this._up);

    const moving = this._target.lengthSq() > 0;
    if (moving) this._target.normalize();

    // 2. E 键加速
    const speed = this.keys['KeyE'] ? this.boostSpeed : this.moveSpeed;
    this._target.multiplyScalar(speed);

    // 3. 阻尼插值：有输入时响应较快，无输入时缓慢衰减（惯性漂移）
    const damp = moving ? 4.5 : 1.15;
    const t = 1 - Math.exp(-damp * dt);
    this.velocity.lerp(this._target, t);

    // 4. 应用位移
    this.group.position.addScaledVector(this.velocity, dt);

    // 5. 平滑转向移动方向（Quaternion.rotateTowards）
    if (this.velocity.lengthSq() > 0.25) {
      this._dummy.position.copy(this.group.position);
      this._dummy.lookAt(
        this.group.position.x + this.velocity.x,
        this.group.position.y + this.velocity.y,
        this.group.position.z + this.velocity.z
      );
      this.group.quaternion.rotateTowards(this._dummy.quaternion, dt * 2.8);
    }
  }

  /** 清空按键状态（暂停 / 失焦时调用，防止按键卡死） */
  clearKeys() {
    this.keys = {};
  }
}

export default AstronautController;
