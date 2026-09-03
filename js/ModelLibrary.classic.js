// ModelLibrary.classic.js —— 全局 GLB 资源缓存，供主场景与详情页共同使用
(function () {

const THREE = window.THREE;
const XINGTU = window.XINGTU;
const loader = new THREE.GLTFLoader();
const entries = new Map();

/**
 * 只下载、解析一次 GLB。调用方拿到的是缓存源场景，挂载前必须 clone。
 * @param {string} path
 * @returns {Promise<THREE.Object3D>}
 */
function load(path) {
  if (!path) return Promise.reject(new Error('模型路径为空'));
  if (entries.has(path)) return entries.get(path);

  const request = new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error || new Error('模型加载失败：' + path))
    );
  }).catch((error) => {
    // 失败项不长期缓存，切换到 HTTP 启动后可以再次尝试。
    entries.delete(path);
    throw error;
  });

  entries.set(path, request);
  return request;
}

function clone(path) {
  return load(path).then((scene) => scene.clone(true));
}

XINGTU.ModelLibrary = { load, clone };

})();
