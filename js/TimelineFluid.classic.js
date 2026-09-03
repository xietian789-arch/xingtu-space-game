// TimelineFluid.js —— 时间线流体喷溅效果（经典脚本版本）
// 使用 Points 系统代替独立 Mesh，大幅减少 draw calls
(function () {

const { Points, BufferGeometry, Float32BufferAttribute, PointsMaterial, CanvasTexture, SRGBColorSpace, AdditiveBlending, Vector3, Mesh, PlaneGeometry, MeshBasicMaterial, DoubleSide } = THREE;

class TimelineFluid {
  constructor(scene, timelineCurve) {
    this.scene = scene;
    this.curve = timelineCurve;

    this.config = {
      particleCount: 120,
      splashRadius: 2.5,
      splashForce: 3.0,
      dissipation: 0.96,
      color: { r: 0.3, g: 0.6, b: 1.0 },
    };

    // 粒子数据数组
    this.particleData = [];
    this.points = null;
    this.splashes = [];

    // 共享纹理
    this._sharedTexture = this._makeParticleTexture();

    this._initParticles();
  }

  _initParticles() {
    const count = this.config.particleCount;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const pos = this.curve.getPointAt(t);

      const spread = 1.5;
      pos.x += (Math.random() - 0.5) * spread;
      pos.y += (Math.random() - 0.5) * spread;

      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      this.particleData.push({
        baseT: t,
        baseOpacity: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      });
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const col = this.config.color;
    const material = new PointsMaterial({
      size: 0.8,
      map: this._sharedTexture,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      color: new THREE.Color(col.r, col.g, col.b),
    });

    this.points = new Points(geometry, material);
    this.scene.add(this.points);
  }

  _makeParticleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const col = this.config.color;
    const r = Math.floor(col.r * 255);
    const g = Math.floor(col.g * 255);
    const b = Math.floor(col.b * 255);

    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},0.6)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},0.2)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  /** 在指定位置产生喷溅（保留为独立 Mesh，数量少且临时） */
  splash(position, intensity = 1.0) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const force = this.config.splashForce * intensity * (0.5 + Math.random() * 0.5);

      const size = 0.3 + Math.random() * 0.8;
      const mat = new MeshBasicMaterial({
        map: this._sharedTexture,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      });

      const sprite = new Mesh(new PlaneGeometry(size, size), mat);
      sprite.position.copy(position);
      sprite.userData = {
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force,
        vz: (Math.random() - 0.5) * force * 0.5,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
      };

      this.scene.add(sprite);
      this.splashes.push(sprite);
    }
  }

  /** 更新粒子和喷溅效果 */
  update(time, dt) {
    // 更新基础粒子（Points 系统 —— 单次 draw call）
    if (this.points) {
      const posArr = this.points.geometry.attributes.position.array;

      for (let i = 0; i < this.particleData.length; i++) {
        const d = this.particleData[i];

        // 沿曲线移动
        d.baseT += dt * 0.02 * d.speed;
        if (d.baseT > 1) d.baseT -= 1;

        const cp = this.curve.getPointAt(d.baseT);
        const turbulence = Math.sin(time * 2 + d.phase) * 0.3;

        posArr[i * 3]     = cp.x + d.vx + turbulence;
        posArr[i * 3 + 1] = cp.y + d.vy + Math.cos(time * 1.5 + d.phase) * 0.2;
        posArr[i * 3 + 2] = cp.z;
      }

      this.points.geometry.attributes.position.needsUpdate = true;

      // 整体呼吸效果
      this.points.material.opacity = 0.5 + 0.2 * Math.sin(time * 1.5);
    }

    // 更新喷溅粒子（临时 Mesh，数量少）
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      const ud = s.userData;

      s.position.x += ud.vx * dt;
      s.position.y += ud.vy * dt;
      s.position.z += ud.vz * dt;

      ud.vx *= this.config.dissipation;
      ud.vy *= this.config.dissipation;
      ud.vz *= this.config.dissipation;

      ud.life -= ud.decay;
      s.material.opacity = ud.life * 0.8;

      const scale = 1 + (1 - ud.life) * 0.5;
      s.scale.set(scale, scale, scale);

      if (ud.life <= 0) {
        this.scene.remove(s);
        s.geometry.dispose();
        s.material.dispose();
        this.splashes.splice(i, 1);
      }
    }
  }

  /** 清理资源 */
  dispose() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
    }
    this.splashes.forEach((s) => {
      this.scene.remove(s);
      s.geometry.dispose();
      s.material.dispose();
    });
    if (this._sharedTexture) this._sharedTexture.dispose();
    this.particleData = [];
    this.splashes = [];
  }
}

XINGTU.TimelineFluid = TimelineFluid;

})();
