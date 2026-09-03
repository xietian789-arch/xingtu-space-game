// SpaceEnvironment.js —— 经典脚本版本（星际穿越虫洞版）
(function () {

const {
  Scene, BufferGeometry, BufferAttribute, Float32BufferAttribute, PointsMaterial, Points,
  FogExp2, MeshBasicMaterial, Mesh, Group, Color, AdditiveBlending,
  PlaneGeometry, DoubleSide, CanvasTexture, SRGBColorSpace,
  AmbientLight, DirectionalLight, HemisphereLight,
  ShaderMaterial, CylinderGeometry, BackSide, FrontSide,
  Vector3, IcosahedronGeometry, SphereGeometry, RingGeometry, TorusGeometry,
  MeshStandardMaterial, Sprite, SpriteMaterial
} = THREE;

/* ======== GLSL: 3D Simplex Noise ======== */
const SIMPLEX_NOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

/* ======== 隧道 Vertex Shader ======== */
const TUNNEL_VERTEX = `
varying vec2 vUv;
varying vec3 vPos;
void main(){
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* ======== 末端虫洞 Fragment Shader — 明亮的北极光帷幕 ======== */
const TUNNEL_FRAGMENT = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uLayerOpacity;

varying vec2 vUv;
varying vec3 vPos;

${SIMPLEX_NOISE_GLSL}

void main(){
  float theta = vUv.x * 6.28318;
  float depth = vUv.y;

  // 缓慢漂移的三层帷幕，线条松散、半透明，不产生金属高光。
  float drift = snoise(vec3(theta * 0.75, depth * 3.4 - uTime * 0.035, uTime * 0.025));
  float ribbonA = pow(max(0.0, sin(theta * 3.0 + depth * 13.0 + drift * 2.1 - uTime * 0.13)), 6.0);
  float ribbonB = pow(max(0.0, sin(theta * 2.0 - depth * 9.0 - drift * 1.6 + uTime * 0.09)), 8.0);
  float veilNoise = snoise(vec3(theta * 0.42 + 14.0, depth * 4.2, uTime * 0.045));
  float veil = smoothstep(0.18, 0.82, veilNoise * 0.5 + 0.5);

  vec3 cyan = vec3(0.20, 0.78, 0.84);
  vec3 blue = vec3(0.16, 0.38, 0.78);
  vec3 violet = vec3(0.50, 0.26, 0.78);
  vec3 col = mix(cyan, blue, smoothstep(0.0, 1.0, depth));
  col = mix(col, violet, 0.34 + 0.24 * sin(theta + depth * 2.0));

  float endFade = smoothstep(0.0, 0.025, depth) * smoothstep(1.0, 0.975, depth);
  float depthPulse = 0.82 + 0.18 * sin(depth * 28.0 - uTime * 0.16);
  float alpha = (ribbonA * 0.33 + ribbonB * 0.22 + veil * 0.095) * endFade * depthPulse;

  gl_FragColor = vec4(col, alpha * uLayerOpacity);
}
`;

/* ======== GLSL: 黑洞吸积盘（内热外冷 + 缓慢涡旋火纹，第一版） ======== */
const BH_DISK_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BH_DISK_FRAG = `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 centered = vUv - 0.5;
  float r = length(centered) * 2.0;
  float angle = atan(centered.y, centered.x);

  // 内缘最热（白金色），向外过渡到暗红。
  vec3 hot = vec3(1.0, 0.94, 0.84);
  vec3 warm = vec3(1.0, 0.62, 0.30);
  vec3 cold = vec3(0.55, 0.22, 0.14);
  vec3 col = mix(hot, warm, smoothstep(0.10, 0.45, r));
  col = mix(col, cold, smoothstep(0.45, 1.0, r));

  // 螺旋臂流光：带角向卷曲的丝纹沿旋臂向内坠（不是同心圆环），低对比度避免环带观感。
  float streak = 0.5 + 0.5 * sin(angle * 4.0 + r * 9.0 + uTime * 1.4);
  float intensity = 0.78 + 0.22 * streak;

  float innerEdge = smoothstep(0.10, 0.22, r);
  float outerEdge = 1.0 - smoothstep(0.58, 1.0, r);
  float alpha = innerEdge * outerEdge * intensity * uOpacity;

  gl_FragColor = vec4(col * intensity, alpha);
}
`;

/* ======== GLSL: 行星大气辉光（背面壳 + Fresnel 边缘光） ======== */
const ATMOSPHERE_GLOW_VERT = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ATMOSPHERE_GLOW_FRAG = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormal;
void main() {
  // 背面渲染：法线与视线夹角越大（即轮廓边缘）辉光越强。
  float rim = pow(0.72 + dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.4);
  gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
}
`;

class SpaceEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.starLayers = [];
    this.nebulae = [];
    this.tunnelParticles = [];
    this.routeStartZ = 30;
    this.portalZ = -1545;
    this.routeEndZ = -1815;
    this.wormholeCenterZ = -892.5;
    this.wormholeLength = 1845;
    this.wormholeHalfLength = this.wormholeLength / 2;
    this.wormholeRadius = 30;
    this.wormholeMaterials = [];
    this.softPointTexture = null;
    /** 远景天体（黑洞 / 星球）：缓慢自转动画 */
    this.bodies = [];
    this.moonPivots = [];
    this.blackHoleGroup = null;
    this.blackHoleStreams = [];
    this.routeDust = null;
  }

  build(settings) {
    // 星空密度上限提高：让背景有明显的漫天星斗感（配置里的 star_count 不再被 700 截断）
    const starCount = Math.min(settings.star_count || 2200, 3400);

    // 极光虫洞从起点贯穿到远端，终点航标仍位于最后一个飞行器之后。
    this.routeStartZ = Number(settings.route_start_z ?? 30);
    this.portalZ = Number(settings.future_beacon_position?.[2] ?? -1545);
    this.routeEndZ = Number(settings.route_end_z ?? -1815);
    this.wormholeCenterZ = Number(
      settings.wormhole_center_z ?? ((this.routeStartZ + this.routeEndZ) / 2)
    );
    this.wormholeLength = Number(
      settings.wormhole_length ?? Math.abs(this.routeEndZ - this.routeStartZ)
    );
    this.wormholeHalfLength = this.wormholeLength / 2;
    this.wormholeRadius = Number(settings.wormhole_radius ?? 30);

    this._buildStars(starCount);
    this._buildFog();
    this._buildWormholeEntrance(); // 最终节点后的北极光入口
    this._buildWormholeTunnel();
    this._buildVoidSphere(); // 隧道尽头黑色虚空球体
    this._buildExternalGalaxies();
    this._buildNebulae();
    this._buildDistantBodies(); // 远景黑洞与星球：抬头可见、大而不抢眼（尝试性）
    this._buildRouteDust(); // 航路尘埃：向后掠过玩家，强化纵深感
    this._buildAmbient();
  }

  /* ---------------- 星空 ---------------- */

  _buildStars(totalCount) {
    const layers = [
      { size: 1.6, ratio: 0.12, opacity: 0.97 },
      { size: 1.0, ratio: 0.3, opacity: 0.86 },
      { size: 0.6, ratio: 0.58, opacity: 0.72 },
    ];
    const radialRange = 180;
    const routeLength = Math.abs(this.routeEndZ - this.routeStartZ);
    const routeCenter = (this.routeStartZ + this.routeEndZ) / 2;

    layers.forEach((layer) => {
      const count = Math.floor(totalCount * layer.ratio);
      const positions = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 2 * radialRange;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * radialRange;
        positions[i * 3 + 2] = (Math.random() - 0.5) * routeLength + routeCenter;
      }

      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(positions, 3));

      const mat = new PointsMaterial({
        color: 0xffffff,
        size: layer.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: layer.opacity,
        map: this._makeSoftPointTexture(),
        alphaTest: 0.015,
        depthWrite: false,
        fog: false,
      });

      const points = new Points(geo, mat);
      this.scene.add(points);
      this.starLayers.push(points);
    });
  }

  _buildFog() {
    // 雾色调提亮、密度降低：远处飞行器与星光不再被大面积死黑吞没。
    this.scene.fog = new FogExp2(0x0a1628, 0.00031);
  }

  /** 圆形软粒子贴图：PointsMaterial 默认方形点是场景中色块的主要来源。 */
  _makeSoftPointTexture() {
    if (this.softPointTexture) return this.softPointTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.30, 'rgba(255,255,255,0.72)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.softPointTexture = new CanvasTexture(canvas);
    this.softPointTexture.colorSpace = SRGBColorSpace;
    return this.softPointTexture;
  }

  /* ---------------- 末端北极光虫洞入口 ---------------- */

  _buildWormholeEntrance() {
    const auroraTexture = this._makePortalTexture();
    const veilMaterial = new MeshBasicMaterial({
      map: auroraTexture,
      transparent: true,
      opacity: 0.68,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    const innerVeil = new Mesh(
      new PlaneGeometry(this.wormholeRadius * 2.15, this.wormholeRadius * 2.15),
      veilMaterial
    );
    innerVeil.position.set(0, 0, this.portalZ);
    innerVeil.userData.baseOpacity = 0.68;
    this.scene.add(innerVeil);
    this.wormholeSphere = innerVeil;
    this.wormholeSphereMat = null;

    const edgeMaterial = veilMaterial.clone();
    edgeMaterial.opacity = 0.42;
    const outerVeil = new Mesh(
      new PlaneGeometry(this.wormholeRadius * 2.55, this.wormholeRadius * 2.55),
      edgeMaterial
    );
    outerVeil.position.set(0, 0, this.portalZ - 0.6);
    outerVeil.rotation.z = Math.PI * 0.17;
    outerVeil.userData.baseOpacity = 0.42;
    this.scene.add(outerVeil);
    this.entranceRing = outerVeil;
  }

  _makePortalTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;
    const colors = [
      [72, 221, 205],
      [70, 142, 226],
      [132, 94, 205],
    ];

    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    // 纵向波动的半透明光帘，比同心圆更接近北极光，也不会出现液态金属高光。
    for (let i = 0; i < 58; i++) {
      const baseX = 20 + Math.random() * (size - 40);
      const amplitude = 9 + Math.random() * 34;
      const phase = Math.random() * Math.PI * 2;
      const rgb = colors[i % colors.length];
      const alpha = 0.14 + Math.random() * 0.10;
      const gradient = ctx.createLinearGradient(0, size, 0, 0);
      gradient.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      gradient.addColorStop(0.22, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
      gradient.addColorStop(0.66, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.72})`);
      gradient.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      ctx.beginPath();
      for (let y = size + 12; y >= -12; y -= 8) {
        const t = y / size;
        const x = baseX + Math.sin(t * Math.PI * (1.5 + (i % 4) * 0.35) + phase) * amplitude;
        if (y === size + 12) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.2 + Math.random() * 4.8;
      ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.shadowBlur = 4 + Math.random() * 7;
      ctx.stroke();
    }
    // 中央保持通透，让玩家能看见可进入的深色通道。
    ctx.globalCompositeOperation = 'destination-out';
    const opening = ctx.createRadialGradient(center, center, size * 0.10, center, center, size * 0.27);
    opening.addColorStop(0, 'rgba(0,0,0,1)');
    opening.addColorStop(0.72, 'rgba(0,0,0,0.82)');
    opening.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = opening;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  /* ---------------- 虫洞隧道 ---------------- */

  _buildWormholeTunnel() {
    const radius = this.wormholeRadius;
    const height = this.wormholeLength;
    const radialSeg = 64;
    const heightSeg = 120;

    const geo = new CylinderGeometry(radius, radius, height, radialSeg, heightSeg, true);

    this.wormholeMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uColor1: { value: new Color(0x080820) },
        uColor2: { value: new Color(0x6a4ae0) }, // 更亮的紫色
        uColor3: { value: new Color(0xaaccff) }, // 更亮的蓝白色
        uLayerOpacity: { value: 1.0 },
      },
      vertexShader: TUNNEL_VERTEX,
      fragmentShader: TUNNEL_FRAGMENT,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    const innerTunnel = new Mesh(geo, this.wormholeMaterial);

    // 外层帷幕半径更大、运动更慢，从不同深度叠加出视差，不使用实体圆环。
    const outerMaterial = this.wormholeMaterial.clone();
    outerMaterial.uniforms.uLayerOpacity.value = 0.62;
    const outerGeo = new CylinderGeometry(radius + 4.5, radius + 4.5, height, radialSeg, heightSeg, true);
    const outerTunnel = new Mesh(outerGeo, outerMaterial);
    outerTunnel.rotation.y = Math.PI * 0.13;

    const tunnelGroup = new Group();
    tunnelGroup.add(innerTunnel, outerTunnel);
    tunnelGroup.rotation.x = Math.PI / 2;
    tunnelGroup.position.set(0, 0, this.wormholeCenterZ);

    this.scene.add(tunnelGroup);
    this.wormholeMaterials = [this.wormholeMaterial, outerMaterial];
    this.wormholeTunnel = tunnelGroup;
  }

  /* ---------------- 北极光虫洞远端的深色背景 ---------------- */

  _buildVoidSphere() {
    // 只做柔和收束，不产生刺眼高光或金属反射。
    const voidGeo = new IcosahedronGeometry(42, 4);
    const voidMat = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.72,
      depthWrite: true,
      fog: false,
    });
    const voidSphere = new Mesh(voidGeo, voidMat);
    voidSphere.position.set(0, 0, this.routeEndZ + 18); // 隧道远端、终点之后
    this.scene.add(voidSphere);
    this.voidSphere = voidSphere;
  }

  /* ---------------- 虫洞外部星系 ---------------- */

  _buildExternalGalaxies() {
    // 在虫洞隧道外面（半径 > 30）添加不同大小和颜色的星系
    const galaxyCount = 15;
    
    for (let i = 0; i < galaxyCount; i++) {
      // 随机位置：确保在隧道外面
      const angle = Math.random() * Math.PI * 2;
      const distance = 35 + Math.random() * 80; // 距离中心 35-115
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const z = this.routeStartZ - Math.random() * Math.abs(this.routeEndZ - this.routeStartZ);
      
      // 随机大小
      const size = 8 + Math.random() * 25; // 8-33
      
      // 随机颜色（不同星系）
      const colors = [
        0x6a8aff, // 蓝紫色
        0xff8866, // 橙红色
        0x88ffaa, // 青绿色
        0xffaa44, // 金黄色
        0xaa88ff, // 紫色
        0x66ddff, // 天蓝色
        0xff6688, // 粉红色
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      // 创建星系（使用 Points）
      const particleCount = 50 + Math.floor(Math.random() * 100); // 50-150 个粒子
      const positions = new Float32Array(particleCount * 3);
      
      for (let j = 0; j < particleCount; j++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.random() * size;
        const spreadZ = (Math.random() - 0.5) * size * 0.3;
        
        positions[j * 3] = x + Math.cos(theta) * r;
        positions[j * 3 + 1] = y + Math.sin(theta) * r;
        positions[j * 3 + 2] = z + spreadZ;
      }
      
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
      
      const mat = new PointsMaterial({
        color: color,
        size: 1.5 + Math.random() * 2,
        transparent: true,
        opacity: 0.30 + Math.random() * 0.16,
        map: this._makeSoftPointTexture(),
        alphaTest: 0.015,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
      });
      
      const galaxy = new Points(geo, mat);
      this.scene.add(galaxy);
      this.nebulae.push(galaxy); // 加入 nebulae 数组以便后续动画
    }
  }

  /* ---------------- 星云装饰 ---------------- */

  _buildNebulae() {
    const palettes = [
      ['rgba(70, 110, 255, 0.55)', 'rgba(30, 50, 140, 0.22)', 'rgba(0,0,0,0)'],
      ['rgba(150, 90, 255, 0.5)', 'rgba(70, 40, 150, 0.2)', 'rgba(0,0,0,0)'],
      ['rgba(60, 200, 220, 0.42)', 'rgba(20, 90, 120, 0.18)', 'rgba(0,0,0,0)'],
      ['rgba(255, 120, 80, 0.35)', 'rgba(120, 50, 40, 0.16)', 'rgba(0,0,0,0)'],
      ['rgba(90, 140, 255, 0.45)', 'rgba(40, 60, 160, 0.2)', 'rgba(0,0,0,0)'],
      ['rgba(200, 120, 255, 0.4)', 'rgba(90, 50, 140, 0.18)', 'rgba(0,0,0,0)'],
    ];

    const placements = [
      { pos: [-70, 25, -95], size: 190, rot: 0.4 },
      { pos: [80, -30, -160], size: 230, rot: -0.7 },
      { pos: [-90, -20, -260], size: 210, rot: 1.1 },
      { pos: [75, 35, -350], size: 250, rot: 2.0 },
      { pos: [-80, 15, -470], size: 220, rot: -1.4 },
      { pos: [60, -35, -580], size: 200, rot: 0.8 },
    ];

    placements.forEach((p, i) => {
      const tex = this._makeNebulaTexture(palettes[i % palettes.length]);
      const mat = new MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.34,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      });
      const geo = new PlaneGeometry(p.size, p.size);
      const mesh = new Mesh(geo, mat);
      mesh.position.set(...p.pos);
      mesh.rotation.set(
        Math.random() * Math.PI,
        p.rot,
        Math.random() * Math.PI
      );
      mesh.userData.spin = (Math.random() - 0.5) * 0.02;
      this.scene.add(mesh);
      this.nebulae.push(mesh);
    });
  }

  _makeNebulaTexture([inner, middle, outer]) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    grad.addColorStop(0, inner);
    grad.addColorStop(0.45, middle);
    grad.addColorStop(1, outer);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 26; i++) {
      const r = 6 + Math.random() * 26;
      const x = size * 0.2 + Math.random() * size * 0.6;
      const y = size * 0.2 + Math.random() * size * 0.6;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
      g2.addColorStop(0, inner);
      g2.addColorStop(1, outer);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  _buildAmbient() {
    const ambient = new AmbientLight(0x71809d, 1.0);
    this.scene.add(ambient);

    const hemi = new HemisphereLight(0xaec7e8, 0x252b3b, 1.05);
    this.scene.add(hemi);

    const sun = new DirectionalLight(0xdce8ff, 1.6);
    sun.position.set(50, 80, 30);
    sun.castShadow = false;
    this.scene.add(sun);
  }

  /* ---------------- 远景天体（尝试性：黑洞 + 星球） ---------------- */
  /* 全部放在航线外侧上方：抬头可见、体积大但色调克制，不抓主视觉。 */
  _buildDistantBodies() {
    this._buildBlackHole();
    this._buildPlanets();
  }

  /** 黑洞：事件视界黑球 + 向内吸的吸积盘 + 坠落粒子 + 淡光晕。 */
  _buildBlackHole() {
    const group = new Group();
    group.position.set(95, 175, -620);
    group.rotation.set(0.46, 0.12, -0.16); // 倾斜，让盘面有透视感，抬头可见
    this.blackHoleGroup = group;

    // 事件视界：纯黑球，不受雾影响，远处也能看到轮廓。
    const horizon = new Mesh(
      new SphereGeometry(26, 48, 32),
      new MeshBasicMaterial({ color: 0x000000, fog: false })
    );
    group.add(horizon);

    // 吸积盘：内热外冷，火纹持续向内坠落。
    const diskMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.55 },
      },
      vertexShader: BH_DISK_VERT,
      fragmentShader: BH_DISK_FRAG,
      transparent: true,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.blackHoleDiskMat = diskMat;
    const disk = new Mesh(new RingGeometry(34, 112, 160, 1), diskMat);
    disk.rotation.x = Math.PI / 2;
    group.add(disk);
    this.blackHoleDisk = disk;

    // 坠落粒子：从盘外缘持续螺旋旋入视界，数量克制，画面保持干净。
    const infall = this._buildInfallParticles(90, 27, 108);
    group.add(infall.points);

    // 淡光晕：模拟引力透镜的弥漫辉光。
    const halo = new Sprite(new SpriteMaterial({
      map: this._makeSoftPointTexture(),
      color: 0xff9a55,
      transparent: true,
      opacity: 0.15,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    halo.scale.setScalar(470);
    group.add(halo);

    this.scene.add(group);
  }

  /** 黑洞坠落粒子：每帧向视界螺旋坠入，越近转得越快、越亮，坠入后重生。 */
  _buildInfallParticles(count, radiusInner, radiusOuter) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const state = {
      t: new Float32Array(count),          // 坠落进度 0=外缘 1=坠入视界
      angle: new Float32Array(count),
      infallSpeed: new Float32Array(count),
      spin: new Float32Array(count),
      height: new Float32Array(count),
    };
    for (let i = 0; i < count; i++) {
      state.t[i] = Math.random();          // 随机初始进度，避免同批涌出
      state.angle[i] = Math.random() * Math.PI * 2;
      state.infallSpeed[i] = 0.035 + Math.random() * 0.05;
      state.spin[i] = 0.5 + Math.random() * 1.4;
      state.height[i] = (Math.random() - 0.5) * 10;
    }
    const geo = new BufferGeometry();
    const posAttr = new BufferAttribute(positions, 3);
    const colAttr = new BufferAttribute(colors, 3);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);

    const mat = new PointsMaterial({
      size: 1.5,
      map: this._makeSoftPointTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.01,
      fog: false,
    });
    this.blackHoleInfall = { count, radiusInner, radiusOuter, state, posAttr, colAttr };
    return { points: new Points(geo, mat) };
  }

  /** 每帧推进坠落粒子：半径收缩 + 角速度递增 + 临没增亮。 */
  _updateInfallParticles(dt) {
    const inf = this.blackHoleInfall;
    if (!inf) return;
    const { t, angle, infallSpeed, spin, height } = inf.state;
    const pos = inf.posAttr.array;
    const col = inf.colAttr.array;
    const c = new Color();
    for (let i = 0; i < inf.count; i++) {
      t[i] += dt * infallSpeed[i];
      if (t[i] >= 1) {
        t[i] = 0;
        angle[i] = Math.random() * Math.PI * 2;
        height[i] = (Math.random() - 0.5) * 10;
      }
      const ti = t[i];
      // 越接近视界转得越快（角速度随坠落进度平方增长）。
      angle[i] += dt * spin[i] * (0.35 + 1.8 * ti * ti);
      const r = inf.radiusOuter + (inf.radiusInner - inf.radiusOuter) * ti;
      pos[i * 3] = Math.cos(angle[i]) * r;
      pos[i * 3 + 1] = height[i] * (1 - ti);
      pos[i * 3 + 2] = Math.sin(angle[i]) * r;
      // 外缘暗橙 → 临没前白热。
      c.setHSL(0.06 + 0.06 * ti, 0.9, 0.3 + 0.52 * ti);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    inf.posAttr.needsUpdate = true;
    inf.colAttr.needsUpdate = true;
  }

  /** 远景星球：三颗色调不同的大行星，缓慢自转，带大气辉光。 */
  _buildPlanets() {
    const defs = [
      {
        radius: 58,
        position: [-240, 165, -400],
        base: '#16324a',
        bands: ['#1d4a66', '#2a6b85', '#173a52', '#3a7f96', '#123048'],
        atmosphere: 0x5fb8d8,
        spin: 0.008,
        moons: [
          { dist: 84, size: 3.0, speed: 0.05, color: 0x9fb6c8, tilt: 0.18 },
          { dist: 98, size: 2.0, speed: -0.032, color: 0x8b98a8, tilt: -0.12 },
        ],
      },
      {
        radius: 42,
        position: [255, 220, -1080],
        base: '#3c2f4a',
        bands: ['#54406b', '#6b5582', '#463557', '#7a6491', '#392c49'],
        atmosphere: 0x9d86cc,
        spin: 0.006,
        ring: { inner: 54, outer: 78, color: 0x8f7fb8, opacity: 0.2, tilt: 0.42 },
        moons: [{ dist: 94, size: 2.6, speed: 0.04, color: 0xb0a3c4, tilt: 0.3 }],
      },
      {
        radius: 28,
        position: [-195, 130, -1360],
        base: '#4a3326',
        bands: ['#6b4a33', '#82593d', '#5a3d2b', '#946847', '#43301f'],
        atmosphere: 0xd89a6a,
        spin: 0.01,
      },
    ];

    defs.forEach((def) => {
      const planet = new Mesh(
        new SphereGeometry(def.radius, 48, 32),
        new MeshStandardMaterial({
          map: this._makePlanetTexture(def.base, def.bands),
          roughness: 0.92,
          metalness: 0.02,
          emissive: new Color(def.atmosphere),
          emissiveIntensity: 0.045, // 微弱自发光，暗处也能辨认轮廓
          fog: false,
        })
      );
      planet.position.set(def.position[0], def.position[1], def.position[2]);

      // 大气层：背面渲染的加色壳，形成柔和轮廓光。
      const atmo = new Mesh(
        new SphereGeometry(def.radius * 1.05, 40, 26),
        new MeshBasicMaterial({
          color: def.atmosphere,
          transparent: true,
          opacity: 0.09,
          side: BackSide,
          blending: AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      );
      planet.add(atmo);

      // Fresnel 辉光壳：边缘大气散射的发光轮廓，比纯色壳更有光效感。
      const glowShell = new Mesh(
        new SphereGeometry(def.radius * 1.14, 40, 26),
        new ShaderMaterial({
          uniforms: {
            uColor: { value: new Color(def.atmosphere) },
            uIntensity: { value: 0.6 },
          },
          vertexShader: ATMOSPHERE_GLOW_VERT,
          fragmentShader: ATMOSPHERE_GLOW_FRAG,
          transparent: true,
          side: BackSide,
          blending: AdditiveBlending,
          depthWrite: false,
        })
      );
      planet.add(glowShell);

      // 背光晕：柔和的弥漫辉光，让星球在暗背景中更醒目。
      const planetHalo = new Sprite(new SpriteMaterial({
        map: this._makeSoftPointTexture(),
        color: def.atmosphere,
        transparent: true,
        opacity: 0.1,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }));
      planetHalo.scale.setScalar(def.radius * 4.6);
      planet.add(planetHalo);

      // 可选行星环（淡色，不抓眼）。
      if (def.ring) {
        const ring = new Mesh(
          new RingGeometry(def.ring.inner, def.ring.outer, 96, 1),
          new MeshBasicMaterial({
            color: def.ring.color,
            transparent: true,
            opacity: def.ring.opacity,
            side: DoubleSide,
            blending: AdditiveBlending,
            depthWrite: false,
            fog: false,
          })
        );
        ring.rotation.x = Math.PI / 2 - def.ring.tilt;
        planet.add(ring);
      }

      // 可选卫星：绕行星缓慢公转的小光点，增加动感但不抓眼。
      if (def.moons) {
        def.moons.forEach((m) => {
          const pivot = new Group();
          pivot.position.set(def.position[0], def.position[1], def.position[2]);
          pivot.rotation.z = m.tilt || 0;
          pivot.userData.speed = m.speed;
          const moon = new Mesh(
            new SphereGeometry(m.size, 20, 14),
            new MeshStandardMaterial({
              color: m.color,
              roughness: 0.85,
              metalness: 0.05,
              emissive: new Color(m.color),
              emissiveIntensity: 0.22, // 微弱自发光，暗处可见轮廓
              fog: false,
            })
          );
          moon.position.set(m.dist, 0, 0);
          pivot.add(moon);
          this.scene.add(pivot);
          this.moonPivots.push(pivot);
        });
      }

      this.scene.add(planet);
      this.bodies.push(planet);
      planet.userData.spin = def.spin;
    });
  }

  /** 程序化行星贴图：横向条带 + 细噪点，避免纯色球的塑料感。 */
  _makePlanetTexture(base, bandColors) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 256);

    // 横向条带：宽度/透明度随机，模拟气态行星纹理。
    let y = 0;
    let i = 0;
    while (y < 256) {
      const h = 8 + Math.random() * 30;
      ctx.fillStyle = bandColors[i % bandColors.length];
      ctx.globalAlpha = 0.22 + Math.random() * 0.45;
      ctx.fillRect(0, y, 512, h);
      y += h;
      i += 1;
    }
    ctx.globalAlpha = 1;

    // 风暴斑纹：少量椭圆色斑，模拟气态行星的大风暴（如大红斑）。
    for (let s = 0; s < 6; s++) {
      const sx = Math.random() * 512;
      const sy = 40 + Math.random() * 176;
      const sw = 18 + Math.random() * 46;
      const sh = 6 + Math.random() * 14;
      ctx.fillStyle = bandColors[(i + s) % bandColors.length];
      ctx.globalAlpha = 0.28 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sw, sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 细噪点：增加表面颗粒感。
    for (let n = 0; n < 900; n++) {
      ctx.fillStyle = Math.random() > 0.5
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(0,0,0,0.06)';
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  /* ---------------- 航路尘埃 ---------------- */

  /** 航路尘埃：漂浮在航线周围的微光尘粒，相对玩家持续向后掠过，强化纵深与飞行感。 */
  _buildRouteDust() {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const routeLength = Math.abs(this.routeEndZ - this.routeStartZ);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 110;
      positions[i * 3 + 2] = this.routeStartZ + 30 - Math.random() * (routeLength + 60);
      speeds[i] = 5 + Math.random() * 7; // 各自漂移速度略有差异，更自然
    }
    const geo = new BufferGeometry();
    const posAttr = new BufferAttribute(positions, 3);
    geo.setAttribute('position', posAttr);

    const mat = new PointsMaterial({
      size: 1.15,
      map: this._makeSoftPointTexture(),
      color: 0x9fb8de,
      transparent: true,
      opacity: 0.45,
      blending: AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.01,
      // 保留雾效：远尘自动变淡，进一步加深纵深感。
    });
    const points = new Points(geo, mat);
    this.scene.add(points);
    this.routeDust = { count, speeds, posAttr, ahead: 320, behind: 40 };
  }

  /** 每帧：尘粒向后（+z）漂移；窗口随玩家位置回绕，保证始终有粒子掠过视野。 */
  _updateRouteDust(dt, playerPosition) {
    const dust = this.routeDust;
    if (!dust || !playerPosition) return;
    const pos = dust.posAttr.array;
    const pz = playerPosition.z;
    const span = dust.ahead + dust.behind;
    for (let i = 0; i < dust.count; i++) {
      let z = pos[i * 3 + 2] + dust.speeds[i] * dt; // 向后漂移
      if (z > pz + dust.behind) z -= span;          // 掠过玩家身后 → 送回前方
      if (z < pz - dust.ahead) z += span;           // 离玩家太远 → 拉回窗口
      pos[i * 3 + 2] = z;
    }
    dust.posAttr.needsUpdate = true;
  }

  /* ---------------- 帧更新 ---------------- */

  update(time, dt, playerPosition) {
    // 星空旋转
    this.starLayers.forEach((p, i) => {
      p.rotation.y += dt * 0.002 * (i + 1) * 0.5;
    });

    // 航路尘埃向后掠过玩家。
    this._updateRouteDust(dt, playerPosition);

    // 远景星球缓慢自转；黑洞吸积盘涡旋动画。
    this.bodies.forEach((body) => {
      body.rotation.y += dt * body.userData.spin;
    });
    // 黑洞：吸积盘向内流动与自转，坠落粒子持续旋入。
    if (this.blackHoleDiskMat) {
      this.blackHoleDiskMat.uniforms.uTime.value = time;
    }
    if (this.blackHoleDisk) {
      this.blackHoleDisk.rotation.z += dt * 0.02;
    }
    this._updateInfallParticles(dt);
    // 卫星绕行星公转。
    this.moonPivots.forEach((pivot) => {
      pivot.rotation.y += dt * pivot.userData.speed;
    });

    // 星云旋转
    this.nebulae.forEach((n) => {
      n.rotation.z += n.userData.spin * dt;
    });

    // 虫洞隧道 shader
    this.wormholeMaterials.forEach((material, index) => {
      material.uniforms.uTime.value = index === 0 ? time : time * 0.72 + 11.0;
    });
    // 隧道不再自动旋转，保持位置稳定

    // 球形入口 shader + 缓慢脉动
    if (this.wormholeSphereMat) {
      this.wormholeSphereMat.uniforms.uTime.value = time;
    }
    if (this.wormholeSphere) {
      const pulse = 1.0 + 0.03 * Math.sin(time * 0.8);
      this.wormholeSphere.scale.setScalar(pulse);
    }

    // 入口光环呼吸
    if (this.entranceRing) {
      const ringPulse = 0.7 + 0.3 * Math.sin(time * 1.5);
      this.entranceRing.material.opacity = this.entranceRing.userData.baseOpacity * ringPulse;
    }

  }
}

XINGTU.SpaceEnvironment = SpaceEnvironment;

})();
