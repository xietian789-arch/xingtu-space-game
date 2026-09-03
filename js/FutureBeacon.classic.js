// FutureBeacon.js —— 经典脚本版本（游戏终点：未来航标）
(function () {

const {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} = THREE;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * 时间线尽头的可交互终点。
 * 使用轻量 Three.js 基础几何体搭建，避免引入额外模型与贴图。
 */
class FutureBeacon {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.position = new Vector3(...(options.position || [0, 0, -1550]));
    this.revealDistance = options.revealDistance || 85;
    this.interactionDistance = options.interactionDistance || 18;
    this.group = new Group();
    this.group.name = 'future-beacon';
    this.group.position.copy(this.position);

    this._cameraPosition = new Vector3();
    this._cameraForward = new Vector3();
    this._targetDirection = new Vector3();
    this._materials = [];
    this._nodes = [];
    this._isTransiting = false;

    this._build();
    scene.add(this.group);
  }

  _material(color, opacity, additive = true) {
    const options = {
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    };
    if (additive) options.blending = AdditiveBlending;
    const material = new MeshBasicMaterial(options);
    material.userData.baseOpacity = opacity;
    this._materials.push(material);
    return material;
  }

  _build() {
    const cyan = 0x86d7ef;
    const ice = 0xc8e8f4;

    // 航标只保留非常淡的定位薄环，主视觉由环境中的北极光帷幕承担。
    this.halo = new Mesh(
      new RingGeometry(23.6, 24.0, 128),
      this._material(cyan, 0.035, false)
    );
    this.group.add(this.halo);

    const centerMarker = new Mesh(
      new SphereGeometry(0.34, 16, 12),
      this._material(ice, 0.26, false)
    );
    this.group.add(centerMarker);

    // 十个低调信标节点与细引导线，呼应十段航天档案；不使用方形锁扣。
    const linePositions = [];
    const nodeGeometry = new SphereGeometry(0.22, 10, 8);
    const nodeMaterial = this._material(cyan, 0.38);
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI * 0.5 + (i / 10) * Math.PI * 2;
      const innerRadius = 24.4;
      const outerRadius = 27.2 + (i % 2) * 1.1;
      linePositions.push(
        Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, -0.8,
        Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, -0.8
      );
      const node = new Mesh(nodeGeometry, nodeMaterial);
      node.position.set(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, -0.8);
      node.userData.phase = i * 0.47;
      this._nodes.push(node);
      this.group.add(node);
    }

    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
    this.guides = new LineSegments(
      lineGeometry,
      new LineBasicMaterial({
        color: cyan,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      })
    );
    this.guides.material.userData.baseOpacity = 0.06;
    this._materials.push(this.guides.material);
    this.group.add(this.guides);

    // 初始保持克制；接近时再逐层增强。
    this.group.scale.setScalar(0.96);
  }

  /** 返回终点与玩家/镜头的实时关系。 */
  getInteractionState(playerPosition, camera, wasVisible = false) {
    const distance = playerPosition.distanceTo(this.position);
    let aimDot = -1;
    if (camera) {
      camera.getWorldPosition(this._cameraPosition);
      camera.getWorldDirection(this._cameraForward).normalize();
      this._targetDirection.subVectors(this.position, this._cameraPosition).normalize();
      aimDot = this._cameraForward.dot(this._targetDirection);
    }
    const aimLimit = wasVisible ? 0.78 : 0.84;
    return {
      distance,
      aimed: aimDot >= aimLimit,
      visible: distance <= this.revealDistance && aimDot >= aimLimit,
      interactive: distance <= this.interactionDistance && aimDot >= 0.78,
    };
  }

  update(time, dt, playerPosition) {
    const distance = playerPosition.distanceTo(this.position);
    const proximity = clamp01(
      1 - (distance - this.interactionDistance) /
        (this.revealDistance - this.interactionDistance)
    );
    const pulse = 0.96 + Math.sin(time * 0.82) * 0.04;

    if (!this._isTransiting) {
      this.group.rotation.z += dt * (0.012 + proximity * 0.018);
      this.group.scale.setScalar(0.96 + proximity * 0.055);
    }

    this._materials.forEach((material) => {
      const base = material.userData.baseOpacity || 0.1;
      material.opacity = base * (0.54 + proximity * 0.46) * pulse;
    });
    this._nodes.forEach((node) => {
      const nodePulse = 0.72 + Math.sin(time * 1.05 + node.userData.phase) * 0.22;
      node.scale.setScalar(nodePulse + proximity * 0.18);
    });
  }

  beginTransit() {
    this._isTransiting = true;
    if (!window.gsap) return;
    gsap.killTweensOf([this.group.scale, this.group.rotation]);
    gsap.timeline({ defaults: { ease: 'power3.inOut' } })
      .to(this.group.rotation, { z: this.group.rotation.z + Math.PI * 1.25, duration: 1.4 }, 0)
      .to(this.group.scale, { x: 1.34, y: 1.34, z: 1.34, duration: 1.15 }, 0)
      .to(this.group.scale, { x: 2.05, y: 2.05, z: 2.05, duration: 0.48, ease: 'power3.in' }, 1.15);
  }
}

XINGTU.FutureBeacon = FutureBeacon;

})();
