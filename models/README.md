# 十个飞行器模型接入说明

## 待填充清单

| 序号 | 数据 ID | 展示名称 | 建议文件名 | 状态 |
| --- | --- | --- | --- | --- |
| 01 | `dongfanghong1` | 东方红一号 | `dongfanghong1.glb` | 已接入 |
| 02 | `shenzhou5` | 神舟五号 | `shenzhou5.glb` | 已接入 |
| 03 | `shenzhou7` | 神舟七号 | `shenzhou7.glb` | 已接入 |
| 04 | `tiangong1_shenzhou8` | 天宫一号 + 神舟八号 | `tiangong1_shenzhou8.glb` | 已接入 |
| 05 | `change3` | 嫦娥三号（玉兔号） | `change3.glb` | 已接入 |
| 06 | `tianwen1` | 天问一号 + 祝融号 | `tianwen1_only.glb` | 已接入 |
| 07 | `change5` | 嫦娥五号 | `change5.glb` | 已接入 |
| 08 | `tianhe` | 天和核心舱 | `tianhe.glb` | 已接入 |
| 09 | `css_complete` | 中国空间站（T 字构型） | `css_complete.glb` | 已接入 |
| 10 | `change6` | 嫦娥六号 | `change6.glb` | 已接入 |

## GLB 交付规范

- 格式：单文件二进制 glTF 2.0（`.glb`），纹理必须嵌入文件。
- 坐标：模型中心放在世界原点，底部尽量落在 `Y = 0`。
- 朝向：保持统一正面，避免导入后出现侧躺、倒置或远离原点。
- 单位：建议按米建模；最终显示大小由 `data/exhibits.json` 的 `scale` 调整。
- 材质：使用 PBR 材质，避免依赖外部贴图、插件着色器或动画脚本。
- 性能：建议单模型小于 20 MB、三角面不超过 150k、单张贴图不超过 2048×2048。
- 命名：网格和材质使用英文或拼音，避免临时名称和重复名称。
- 动画：如有动画应保存在 GLB 内，但当前版本默认展示静态模型。

GitHub 单文件硬限制为 100 MB，但网页加载远早于该限制就会影响体验，所以请优先减面、合并材质并压缩贴图。

## 接入步骤

以神舟五号为例：

1. 把文件保存为 `models/shenzhou5.glb`。
2. 编辑 `data/exhibits.json` 中 `id` 为 `shenzhou5` 的条目：

```json
"model_path": "models/shenzhou5.glb",
"scale": 2.0
```

3. 新模型在 HTTP/GitHub Pages 环境中直接从 `model_path` 加载，因此不要添加 `model_chunks`。已有的分片字段只用于旧版 `file://` 离线兼容。
4. 同步回退文件：

```bash
node scripts/sync-exhibits.mjs
```

5. 启动游戏，检查以下内容：

   - 远处不会提前出现靠近 UI；
   - 只有角色朝向模型且进入设定距离时才出现 UI；
   - 穿过模型并背向模型后 UI 会消失；
   - 模型大小、方向、中心点和发光效果正常；
   - 按 `F` 打开详情页时，右侧模型预留区域没有布局错位。

## 详情页模型接口

详情面板打开和关闭时会发送 `xingtu:detail-model-change` 事件：

```js
window.addEventListener('xingtu:detail-model-change', (event) => {
  const { data, mount } = event.detail;
  // data 为当前飞行器数据；关闭时 data 为 null。
  // mount 是右侧 3D MODEL SLOT 的 DOM 挂载区域。
});
```

当前 `js/DetailModelViewer.classic.js` 已监听该事件，创建独立 Three.js 画布，并实现拖拽旋转、滚轮缩放和自动取景。模型通过 `js/ModelLibrary.classic.js` 与主场景共享下载和解析结果。
