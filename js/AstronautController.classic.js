// AstronautController.js —— 经典脚本版本（适配 file:// 协议）
(function () {

const { Vector3, Object3D, Group, MeshStandardMaterial, Mesh, CapsuleGeometry, SphereGeometry, BoxGeometry, CylinderGeometry, TorusGeometry, PointLight, Box3, Color, Quaternion } = THREE;
const GLTFLoader = THREE.GLTFLoader;
const gltfLoader = new GLTFLoader();

class AstronautController {
  /**
   * @param {THREE.Scene} scene 主场景
   * @param {Object} settings exhibits.json 中的 settings（move_speed / boost_speed）
   * @param {Object} [exhibitManager] ExhibitManager实例（用于获取陨石进行碰撞检测）
   */
  constructor(scene, settings, exhibitManager) {
    this.scene = scene;
    this.exhibitManager = exhibitManager;
    this.moveSpeed = settings.move_speed || 18;      // 默认移动速度（单位/秒）
    this.boostSpeed = settings.boost_speed || 85;    // 加速后速度（Shift 冲刺感）
    this.tunnelRadius = Number(settings.flight_radius ?? 24);
    this.tunnelZMin = Number(settings.flight_z_min ?? -1625);
    this.tunnelZMax = Number(settings.flight_z_max ?? 25);

    /** 当前速度向量（含惯性） */
    this.velocity = new Vector3();
    /** 是否允许移动（由主状态机控制） */
    this.enabled = false;
    /** 撞上陨石时的回调（带节流），由外部设置用于提示 */
    this.onAsteroidHit = null;
    /** 上次撞击提示时间，避免贴面时刷屏 */
    this._lastHitAt = 0;

    /** 按键状态表 */
    this.keys = {};

    // 复用向量，避免每帧 new
    this._forward = new Vector3();
    this._right = new Vector3();
    this._up = new Vector3(0, 1, 0);
    this._target = new Vector3();
    this._dummy = new Object3D();
    this._collisionBox = new Box3(); // 碰撞检测包围盒
    this._step = new Vector3(); // 位移子步临时向量
    this._pushDir = new Vector3(); // 碰撞推开方向临时向量
    this._tmpQuat = new Quaternion(); // 朝向跟随临时四元数
    // 模型正面为 +Z，镜头前方为 -Z：跟随镜头时需绕 Y 轴补 π 旋转。
    this._flipQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

    this._buildModel();
    // 所有模型均为 Three.js 程序化建模，无需加载 GLB
    this._bindKeys();
  }

  /* ---------------- 占位模型 ---------------- */

  /** 高精度程序化宇航员模型：完整航天服 + 头盔 + 面罩 + 生命维持背包 + 四肢 + 细节 */
  _buildModel() {
    this.group = new Group();
    this.group.name = 'astronaut';

    const suitMat = new MeshStandardMaterial({
      color: 0xe8edf5, metalness: 0.25, roughness: 0.55,
      emissive: 0x223344, emissiveIntensity: 0.15,
    });
    const helmetMat = new MeshStandardMaterial({
      color: 0xf2f5fa, metalness: 0.4, roughness: 0.3,
      emissive: 0x1a2a3a, emissiveIntensity: 0.2,
    });
    const visorMat = new MeshStandardMaterial({
      color: 0x1a2f55, metalness: 0.92, roughness: 0.08,
      emissive: 0x2255aa, emissiveIntensity: 0.6,
    });
    const packMat = new MeshStandardMaterial({ color: 0xb8c2d4, metalness: 0.5, roughness: 0.45 });
    const bootMat = new MeshStandardMaterial({ color: 0x8a94a6, metalness: 0.35, roughness: 0.6 });
    const gloveMat = new MeshStandardMaterial({ color: 0xc5cdd8, metalness: 0.3, roughness: 0.5 });
    const detailMat = new MeshStandardMaterial({ color: 0x556677, metalness: 0.6, roughness: 0.35 });

    // === 躯干 ===
    const torso = new Mesh(new CapsuleGeometry(0.4, 0.65, 6, 14), suitMat);
    torso.position.y = -0.1;
    // 胸部护甲
    const chestPlate = new Mesh(new BoxGeometry(0.55, 0.35, 0.12), detailMat);
    chestPlate.position.set(0, 0.12, 0.35);
    // 腰部连接环
    const waistRing = new Mesh(new TorusGeometry(0.38, 0.03, 8, 18), detailMat);
    waistRing.position.y = -0.38;
    waistRing.rotation.x = Math.PI / 2;

    // === 头盔 ===
    const helmet = new Mesh(new SphereGeometry(0.36, 24, 20), helmetMat);
    helmet.position.y = 0.82;
    // 头盔边框
    const helmetRing = new Mesh(new TorusGeometry(0.33, 0.025, 8, 20), detailMat);
    helmetRing.position.y = 0.58;
    helmetRing.rotation.x = Math.PI / 2;
    // 面罩（金色反射）
    const visor = new Mesh(new SphereGeometry(0.28, 22, 16), visorMat);
    visor.scale.set(1.05, 0.8, 0.65);
    visor.position.set(0, 0.84, 0.18);
    // 头盔顶部灯
    const headLamp = new Mesh(new SphereGeometry(0.03, 8, 6),
      new MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaddff, emissiveIntensity: 1.5 }));
    headLamp.position.set(0, 1.12, 0.12);

    // === 生命维持背包 ===
    const pack = new Mesh(new BoxGeometry(0.58, 0.72, 0.3), packMat);
    pack.position.set(0, 0.1, -0.4);
    // 背包细节：氧气罐
    const tank1 = new Mesh(new CapsuleGeometry(0.06, 0.35, 4, 8), detailMat);
    tank1.position.set(0.15, 0.15, -0.58);
    const tank2 = new Mesh(new CapsuleGeometry(0.06, 0.35, 4, 8), detailMat);
    tank2.position.set(-0.15, 0.15, -0.58);
    // 背包排气管
    const exhaust = new Mesh(new CylinderGeometry(0.04, 0.06, 0.12, 8), detailMat);
    exhaust.position.set(0, 0.5, -0.52);

    // === 左臂 ===
    const upperArmL = new Mesh(new CapsuleGeometry(0.12, 0.3, 4, 10), suitMat);
    upperArmL.position.set(0.52, 0.12, 0);
    upperArmL.rotation.z = 0.45;
    const lowerArmL = new Mesh(new CapsuleGeometry(0.1, 0.28, 4, 10), suitMat);
    lowerArmL.position.set(0.72, -0.15, 0.08);
    lowerArmL.rotation.z = 0.2;
    const gloveL = new Mesh(new SphereGeometry(0.1, 10, 8), gloveMat);
    gloveL.position.set(0.78, -0.38, 0.12);
    // 手臂连接环
    const armRingL = new Mesh(new TorusGeometry(0.12, 0.018, 6, 12), detailMat);
    armRingL.position.set(0.62, -0.02, 0.04);
    armRingL.rotation.z = 0.35;

    // === 右臂 ===
    const upperArmR = new Mesh(new CapsuleGeometry(0.12, 0.3, 4, 10), suitMat);
    upperArmR.position.set(-0.52, 0.12, 0);
    upperArmR.rotation.z = -0.45;
    const lowerArmR = new Mesh(new CapsuleGeometry(0.1, 0.28, 4, 10), suitMat);
    lowerArmR.position.set(-0.72, -0.15, 0.08);
    lowerArmR.rotation.z = -0.2;
    const gloveR = new Mesh(new SphereGeometry(0.1, 10, 8), gloveMat);
    gloveR.position.set(-0.78, -0.38, 0.12);
    const armRingR = new Mesh(new TorusGeometry(0.12, 0.018, 6, 12), detailMat);
    armRingR.position.set(-0.62, -0.02, 0.04);
    armRingR.rotation.z = -0.35;

    // === 左腿 ===
    const upperLegL = new Mesh(new CapsuleGeometry(0.14, 0.35, 4, 10), suitMat);
    upperLegL.position.set(0.2, -0.72, 0);
    const lowerLegL = new Mesh(new CapsuleGeometry(0.12, 0.32, 4, 10), suitMat);
    lowerLegL.position.set(0.2, -1.12, 0);
    const bootL = new Mesh(new BoxGeometry(0.2, 0.16, 0.28), bootMat);
    bootL.position.set(0.2, -1.42, 0.04);
    const kneeL = new Mesh(new TorusGeometry(0.13, 0.02, 6, 12), detailMat);
    kneeL.position.set(0.2, -0.92, 0);
    kneeL.rotation.x = Math.PI / 2;

    // === 右腿 ===
    const upperLegR = new Mesh(new CapsuleGeometry(0.14, 0.35, 4, 10), suitMat);
    upperLegR.position.set(-0.2, -0.72, 0);
    const lowerLegR = new Mesh(new CapsuleGeometry(0.12, 0.32, 4, 10), suitMat);
    lowerLegR.position.set(-0.2, -1.12, 0);
    const bootR = new Mesh(new BoxGeometry(0.2, 0.16, 0.28), bootMat);
    bootR.position.set(-0.2, -1.42, 0.04);
    const kneeR = new Mesh(new TorusGeometry(0.13, 0.02, 6, 12), detailMat);
    kneeR.position.set(-0.2, -0.92, 0);
    kneeR.rotation.x = Math.PI / 2;

    // === 胸前指示灯 ===
    const beacon = new Mesh(new SphereGeometry(0.04, 10, 8),
      new MeshStandardMaterial({ color: 0x66ffcc, emissive: 0x33ffaa, emissiveIntensity: 2 }));
    beacon.position.set(0.18, 0.28, 0.42);
    // 第二指示灯
    const beacon2 = new Mesh(new SphereGeometry(0.03, 8, 6),
      new MeshStandardMaterial({ color: 0xff6644, emissive: 0xff3322, emissiveIntensity: 1.5 }));
    beacon2.position.set(-0.15, 0.28, 0.42);

    // 组装
    this.modelGroup = new Group();
    this.modelGroup.add(
      torso, chestPlate, waistRing,
      helmet, helmetRing, visor, headLamp,
      pack, tank1, tank2, exhaust,
      upperArmL, lowerArmL, gloveL, armRingL,
      upperArmR, lowerArmR, gloveR, armRingR,
      upperLegL, lowerLegL, bootL, kneeL,
      upperLegR, lowerLegR, bootR, kneeR,
      beacon, beacon2
    );
    this.group.add(this.modelGroup);

    this.group.position.set(0, 0, 0);
    this.group.rotation.y = Math.PI;
    this.scene.add(this.group);
  }

  /* ---------------- 加载真实 GLB 模型 ---------------- */

  /** 尝试加载真实宇航员 GLB 模型，成功后替换占位模型 */
  _tryLoadRealModel() {
    // 方式 1：从分片 base64 数据加载（file:// 协议兼容）
    // 关键：逐块 atob() 解码后拼接二进制，避免一次性 atob(122MB+) 导致浏览器崩溃
    let totalBytes = 0;
    let partIndex = 0;
    const chunks = [];

    while (window['ASTRONAUT_GLB_PART' + partIndex] !== undefined) {
      const b64 = window['ASTRONAUT_GLB_PART' + partIndex];
      try {
        const binaryString = atob(b64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        chunks.push(bytes);
        totalBytes += bytes.length;
      } catch (err) {
        console.warn('[AstronautController] 分片 ' + partIndex + ' base64 解码失败:', err);
        return; // 解码失败则放弃
      }
      partIndex++;
    }

    if (chunks.length > 0) {
      console.info('[AstronautController] 从 ' + partIndex + ' 个分片加载模型，总大小: ' + totalBytes + ' bytes');
      // 拼接所有分片的二进制数据
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (let i = 0; i < chunks.length; i++) {
        combined.set(chunks[i], offset);
        offset += chunks[i].length;
      }
      this._parseGLB(combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength));
      return;
    }

    // 方式 2：XHR 直接加载 GLB 二进制文件（http:// 协议下有效）
    const modelPath = 'models/astronaut.glb';
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', modelPath, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.response && xhr.response.byteLength > 0) {
          console.info('[AstronautController] XHR GLB 加载成功，大小:', xhr.response.byteLength, 'bytes');
          this._parseGLB(xhr.response);
        } else {
          console.warn('[AstronautController] XHR GLB 文件为空或加载失败，HTTP 状态:', xhr.status);
        }
      };
      xhr.onerror = () => {
        console.warn('[AstronautController] XHR GLB 网络请求失败，使用占位模型');
      };
      xhr.send();
    } catch (err) {
      console.warn('[AstronautController] XHR GLB 加载异常:', err);
    }
  }

  /** 解析 GLB ArrayBuffer 并应用模型 */
  _parseGLB(arrayBuffer) {
    gltfLoader.parse(
      arrayBuffer,
      '',  // path（base64 内嵌模型无外部资源路径）
      (gltf) => this._applyGLBModel(gltf.scene),
      (err) => {
        console.warn('[AstronautController] GLB 解析失败，使用占位模型:', err);
      }
    );
  }

  /** 将加载好的 GLB 场景应用到宇航员模型组 */
  _applyGLBModel(model) {
    // 清空占位模型
    while (this.modelGroup.children.length) {
      const c = this.modelGroup.children[0];
      this.modelGroup.remove(c);
      this._disposeObject(c);
    }

    // 提亮材质：适度提升亮度，保留细节
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // 保留原始 PBR 材质，不做修改——模型自带的贴图已经足够好
      }
    });

    // 自动缩放：将模型缩放到合适大小（目标高度约 2.2 单位）
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const targetHeight = 2.2;
    const scale = targetHeight / size.y;
    model.scale.setScalar(scale);

    // 居中模型底部到 origin
    const scaledBox = new Box3().setFromObject(model);
    const center = scaledBox.getCenter(new Vector3());
    model.position.sub(center);
    model.position.y += (scaledBox.max.y - scaledBox.min.y) / 2;

    this.modelGroup.add(model);

    // 添加补光灯：确保宇航员在暗场景中可见
    const fillLight = new PointLight(0xdce8ff, 1.10, 13);
    fillLight.position.set(2, 3, 2);
    this.modelGroup.add(fillLight);

    console.info('[AstronautController] 已加载真实宇航员模型');
  }

  /** 递归释放几何体 / 材质 / 贴图 */
  _disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
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
    this._forward.y = 0;
    this._forward.normalize();
    this._right.set(1, 0, 0).applyQuaternion(this._dummy.quaternion);
    this._right.y = 0;
    this._right.normalize();

    this._target.set(0, 0, 0);
    if (this.keys['KeyW']) this._target.add(this._forward);   // 前进
    if (this.keys['KeyS']) this._target.sub(this._forward);   // 后退
    if (this.keys['KeyD']) this._target.add(this._right);     // 右移
    if (this.keys['KeyA']) this._target.sub(this._right);     // 左移
    if (this.keys['Space']) this._target.y += 1;              // 上升（空格）
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) this._target.y -= 1; // 下降（Ctrl）

    const moving = this._target.lengthSq() > 0;
    if (moving) this._target.normalize();

    // 2. Shift 键加速
    const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? this.boostSpeed : this.moveSpeed;
    this._target.multiplyScalar(speed);

    // 3. 阻尼插值：有输入时响应更快（加速时尤其迅猛），无输入时缓慢衰减（惯性漂移）
    const damp = moving ? 8.0 : 1.15;
    const t = 1 - Math.exp(-damp * dt);
    this.velocity.lerp(this._target, t);

    // 4. 应用位移 + 陨石碰撞：分子步进移动，避免高速冲刺（~85/秒）一帧穿透小陨石。
    this._step.copy(this.velocity).multiplyScalar(dt);
    const travelDist = this._step.length();
    const substeps = Math.max(1, Math.min(5, Math.ceil(travelDist / 1.0)));
    this._step.multiplyScalar(1 / substeps);
    for (let stepIdx = 0; stepIdx < substeps; stepIdx++) {
      this.group.position.add(this._step);
      if (this.exhibitManager) {
        this._checkAsteroidCollisions();
      }
    }

    // 5. 隧道边界约束：宇航员不能飞出虫洞（可由 WormholeEditor 动态调整）
    const tunnelRadius = this.tunnelRadius;
    const tunnelZMin = this.tunnelZMin;
    const tunnelZMax = this.tunnelZMax;
    const pos = this.group.position;

    // 径向约束（XY 平面）
    const radialDist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
    if (radialDist > tunnelRadius) {
      const scale = tunnelRadius / radialDist;
      pos.x *= scale;
      pos.y *= scale;
      // 碰到壁面时削减径向速度
      const radialVel = (this.velocity.x * pos.x + this.velocity.y * pos.y) / radialDist;
      if (radialVel > 0) {
        this.velocity.x -= (radialVel * pos.x / tunnelRadius) * 1.2;
        this.velocity.y -= (radialVel * pos.y / tunnelRadius) * 1.2;
      }
    }

    // 纵向约束（Z 轴）
    if (pos.z > tunnelZMax) {
      pos.z = tunnelZMax;
      if (this.velocity.z > 0) this.velocity.z *= -0.3; // 轻微反弹
    } else if (pos.z < tunnelZMin) {
      pos.z = tunnelZMin;
      if (this.velocity.z < 0) this.velocity.z *= -0.3;
    }

    // 6. 人物朝向跟随镜头方向（含俯仰，平滑插值避免甩头）
    this._tmpQuat.copy(this._dummy.quaternion).multiply(this._flipQuat);
    this.group.quaternion.slerp(this._tmpQuat, 1 - Math.exp(-12 * dt));
  }

  /** 陨石碰撞检测：球形近似（优先用构建时算好的世界包围球），碰到即推开并消除穿入速度 */
  _checkAsteroidCollisions() {
    const asteroids = this.exhibitManager.getAsteroids();
    if (!asteroids || asteroids.length === 0) return;

    const playerPos = this.group.position;
    const playerRadius = 0.4; // 宇航员碰撞半径（收紧，贴近才触发碰撞）
    const pushDir = this._pushDir;

    for (const asteroid of asteroids) {
      // 优先使用构建时算好的世界包围球（含缩放/旋转/模型偏心）
      let ax = asteroid.position.x;
      let ay = asteroid.position.y;
      let az = asteroid.position.z;
      let asteroidRadius;
      const c = asteroid.userData.collisionCenter;
      if (asteroid.userData.collisionRadius && c) {
        ax = c.x; ay = c.y; az = c.z;
        asteroidRadius = asteroid.userData.collisionRadius;
      } else {
        const scale = asteroid.scale;
        asteroidRadius = ((scale.x + scale.y + scale.z) / 3) * 0.8;
      }

      // 计算距离（玩家相对陨石包围球中心）
      const dx = playerPos.x - ax;
      const dy = playerPos.y - ay;
      const dz = playerPos.z - az;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const minDistance = playerRadius + asteroidRadius;

      // 如果发生碰撞，推开宇航员并消除穿入速度（表现即“碰壁走不动”）
      if (distance < minDistance && distance > 0.001) {
        pushDir.set(dx, dy, dz).normalize();
        const pushDistance = minDistance - distance;
        
        // 推开宇航员到岩面外，避免穿模。
        this.group.position.addScaledVector(pushDir, pushDistance);
        
        // 消除朝向陨石的速度分量（仅留轻微回弹，避免死硬贴面）
        const velTowardsAsteroid = this.velocity.dot(pushDir);
        if (velTowardsAsteroid < 0) {
          this.velocity.addScaledVector(pushDir, -velTowardsAsteroid * 1.1);
          // 有明显冲撞速度时触发提示（节流 800ms）
          if (velTowardsAsteroid < -2.5 && typeof this.onAsteroidHit === 'function') {
            const now = performance.now();
            if (now - this._lastHitAt > 800) {
              this._lastHitAt = now;
              this.onAsteroidHit(-velTowardsAsteroid);
            }
          }
        }
      }
    }
  }

  /** 清空按键状态（暂停 / 失焦时调用，防止按键卡死） */
  clearKeys() {
    this.keys = {};
  }
}

XINGTU.AstronautController = AstronautController;

})();
