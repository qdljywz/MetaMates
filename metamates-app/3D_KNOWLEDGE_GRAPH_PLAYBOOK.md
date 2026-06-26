# 3D 知识图谱开发实战手册

> 📌 从 0 到 1 落地可复用的开发逻辑
>
> 适用于：关系网络、知识图谱、社交网络、供应链可视化等

---

## 🎯 第一步：技术选型决策树

### 选型前先问自己三个问题

| 问题 | 选 ECharts 2D | 选 Three.js 纯 3D |
|------|-------------|------------------|
| 用户只看整体分布？ | ✅ 首选 | ❌ 杀鸡用牛刀 |
| 用户需要 360° 观察关联？ | ❌ 做不到 | ✅ 必须 3D |
| 用户需要点击过滤噪音？ | ❌ 效果差 | ✅ 3D 有天然优势 |

### ✅ 最终技术栈（经过验证）

```
渲染引擎:   Three.js + WebGL 原生
布局算法:   Fibonacci Sphere (菲波那切球面)
交互控制:   OrbitControls
碰撞检测:   Raycaster
文字标签:   Canvas + Sprite (始终面向相机)
```

> 💡 **为什么不用 react-force-graph-3d？**
>
> 封装太黑，自定义高亮效果、缩放、透明度都不方便。原生 Three.js 完全可控。

---

## 🔢 第二步：球体布局核心算法

### Fibonacci 球面均匀分布

**问题：** 随机分布节点会聚集，不好看。

**一行代码解决所有节点分布问题：**

```javascript
const SPHERE_RADIUS = 180

nodes.forEach((node, i) => {
  // ✅ 菲波那切球面均匀分布公式
  const phi = Math.acos(-1 + (2 * i) / nodes.length)
  const theta = Math.sqrt(nodes.length * Math.PI) * phi

  // ✅ 每个节点都有真实的 X/Y/Z 三维坐标
  const x = SPHERE_RADIUS * Math.cos(theta) * Math.sin(phi)
  const y = SPHERE_RADIUS * Math.sin(theta) * Math.sin(phi)
  const z = SPHERE_RADIUS * Math.cos(phi)
})
```

**效果：** 60 个节点也不会重叠，完美球体。

---

## 💡 第三步：用户价值导向的交互设计

> ❌ 技术思维：左键旋转 · 滚轮缩放 · 右键平移
>
> ✅ 用户思维：拖拽查看全局 · 缩放洞察细节 · 点击发现关联

---

### 🎯 交互 1：悬停预览

```javascript
// ✅ 默认文字淡淡的 35% 透明，不干扰球体整体视觉
sprite.material.opacity = 0.35

// ✅ 鼠标移上去 100% 清晰，告诉用户"这是可以点击的"
if (hovered) {
  sprite.material.opacity = 1
}
```

| 状态 | 透明度 | 设计意图 |
|------|--------|---------|
| 默认 | 35% | 看得见但不干扰 |
| 悬停 | 100% | 清晰突出焦点 |

---

### 💥 交互 2：点击高亮（最核心价值！）

**这才是 3D 图谱的灵魂！用户点节点不是为了好玩，是为了过滤噪音！**

```javascript
const highlightNode = (nodeId) => {
  const relatedIds = getRelatedNodeIds(nodeId)
  
  nodeObjects.forEach((obj, id) => {
    const isRelated = relatedIds.has(id)
    
    if (isRelated) {
      // ✅ 相关：放大 + 超亮 + 完全清晰
      obj.mesh.scale.setScalar(1.6)           // 放大 1.6 倍
      obj.mesh.material.emissiveIntensity = 1.5 // 超亮发光
      obj.mesh.material.opacity = 1
      obj.sprite.material.opacity = 1
    } else {
      // ✅ 不相关：缩小 + 近乎透明 + 几乎消失
      obj.mesh.scale.setScalar(0.3)           // 缩小到 30%
      obj.mesh.material.opacity = 0.02        // 2% 透明度 = 看不见
      obj.mesh.material.emissiveIntensity = 0.01
      obj.sprite.material.opacity = 0.01
    }
  })

  // ✅ 连线也一样，不相关的几乎消失
  lineObjects.forEach(line => {
    line.material.opacity = isRelated ? 1 : 0.005
  })
}
```

**给用户的感觉：**
> "轰"的一下，整个世界清净了！只剩下我关心的东西！

---

## ✨ 第四步：立体感速成公式

不要只会做颜色。没有光影的 3D 就是 2D 圆片！

```javascript
// ❌ 错误：Lambert 材质没质感
new THREE.MeshLambertMaterial({ color: 0xf59e0b })

// ✅ 正确：PBR 金属质感
new THREE.MeshStandardMaterial({
  color: 0xf59e0b,
  emissive: 0xf59e0b,    // 自发光色
  emissiveIntensity: 0.3, // 基础发光强度
  metalness: 0.8,         // 80% 金属感
  roughness: 0.2          // 20% 粗糙度 = 光滑
})
```

### 三灯布光法（摄影棚级别效果）

```javascript
// 1. 主光 - 正面打亮
const mainLight = new THREE.DirectionalLight(0xffffff, 1)
mainLight.position.set(100, 100, 100)

// 2. 轮廓光 - 琥珀色勾边，灵魂！
const rimLight = new THREE.DirectionalLight(0xf59e0b, 0.6)
rimLight.position.set(-100, -100, 100)

// 3. 环境光 - 别太亮
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
```

---

## 🚩 踩坑实录 & 解决方案

### 坑 1：文字标签深度问题

**症状：** 文字被前面的节点挡住了。

**解法：**
```javascript
// ✅ 关闭深度测试，文字永远在最前面
new THREE.SpriteMaterial({ map: texture, depthTest: false })
```

---

### 坑 2：点击不准 / 没有反馈

**症状：** 用户点了但不知道点中了没有。

**解法：**
```javascript
// ✅ 鼠标形状变化告诉用户点到东西了
renderer.domElement.style.cursor = intersects.length > 0 
  ? 'pointer'   // 手型 = 可以点击
  : 'grab'      // 抓手 = 可以旋转
```

---

### 坑 3：对比不够强烈

**症状：** 用户说"看不太出来"。

**解法：** **把参数翻倍！再翻倍！**

| 参数 | 温和版 | ✅ 用户能感知版 |
|------|--------|----------------|
| 放大倍数 | 1.2x | 1.6x |
| 缩小倍数 | 0.8x | 0.3x |
| 不相关透明度 | 0.3 | 0.02 |

> 💡 程序员觉得 0.3 已经很淡了，但用户眼里就是没变化！
>
> 记住：**用户能感知的变化 = 你觉得合理值 × 5 倍**

---

## 📋 交付验收检查清单

上线前按这个过一遍：

| # | 检查项 | 通过标准 |
|---|--------|---------|
| 1 | ✅ 看得见 | 截图上能圈出节点 |
| 2 | ✅ 有反应 | 鼠标移上去形状变手型 |
| 3 | ✅ 点得中 | 点击节点有明显变化 |
| 4 | ✅ 有价值 | 不相关的真的"消失"了 |
| 5 | ✅ 能复原 | 点空白处全部恢复 |
| 6 | ✅ 讲人话 | 所有文案站在用户角度写 |

---

## 🎨 文案对照表

把技术术语翻译成用户听得懂的话：

| ❌ 技术视角（别这么写） | ✅ 用户视角（这么写） |
|-----------------------|---------------------|
| 3D 球体关系图谱 | 全局知识图谱 |
| 真实 WebGL 渲染 | 发现隐藏的商业信号网络 |
| 左键拖拽旋转 | 拖拽旋转查看全局 |
| 滚轮缩放 | 缩放洞察细节 |
| 点击高亮节点 | 点击节点高亮整个关联网络 |

---

## 🚀 快速上手模板

```
项目初始化:
  npm install three
  npm install -D @types/three

目录结构:
  components/
    └── KnowledgeGraph/
        ├── useGraphScene.js    # Three.js 场景逻辑
        ├── useInteraction.js   # 点击悬停交互
        └── index.jsx           # 主组件

数据格式:
  nodes: [{ id, name, type, value }]
  links: [{ source, target, value }]
```

---

## 📌 终极心法

1. **看得见比什么都重要** - 代码再漂亮，用户看不见 = 0

2. **对比要够极端** - 10% 的变化用户感知不到，要做就做 90% 的变化

3. **3D 是手段不是目的** - 用户不关心你用了什么算法，用户关心能不能帮他过滤噪音发现关联

4. **永远做减法** - 平时让一切淡淡的，用户需要的时候再给强反馈

---

> **最后一句话总结这套方法论：**
>
> 平时干干净净，用户需要的时候，轰的一下，把他关心的东西挑出来放大给他看。
