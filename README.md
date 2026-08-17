# Electron React 图片编辑器

一个基于 Electron + React + Pixi.js 的桌面图片编辑器，支持裁剪、调色、滤镜、文字、画笔、马赛克等功能，编辑与渲染全部走 GPU（WebGL）。

## 技术栈

- **Electron 29** - 跨平台桌面应用框架
- **React 18** - UI 框架
- **TypeScript** - 类型系统
- **Pixi.js 8** - WebGL 画布渲染（图片、滤镜、马赛克、标注）
- **Zustand** - 状态管理
- **Ant Design 5** - UI 组件库
- **Less** - CSS 预处理器
- **electron-vite / Vite 5** - 打包工具（主进程 / 预加载 / 渲染进程三段式）
- **React Router 6** - 路由管理

## 项目结构

```
electron-react/
├── electron/                     # Electron 主进程
│   ├── handlers/
│   │   └── file.js               # 文件相关 IPC handler（打开/读取/保存）
│   ├── main.js                   # 主进程入口
│   └── preload.js                # 预加载脚本，暴露 window.electronAPI
├── src/                          # 渲染进程源码
│   ├── components/
│   │   ├── EditorShell/          # 编辑器通用外壳（工具栏/工具栏/画布/面板/状态栏）
│   │   └── ImageCanvas/          # Pixi 画布及各工具逻辑 Hook
│   │       ├── index.tsx         # 画布主组件（初始化 Pixi、导出）
│   │       ├── coords.ts         # 屏幕 ↔ world 坐标换算
│   │       ├── filterPresets.ts  # 滤镜预设
│   │       ├── useAdjustments.ts # 调色
│   │       ├── useBrushTool.ts   # 画笔
│   │       ├── useCanvasInteraction.ts # 缩放/拖拽
│   │       ├── useCropFrame.ts   # 裁剪画框
│   │       ├── useFilter.ts      # 滤镜
│   │       ├── useMosaicTool.ts  # 马赛克/模糊
│   │       └── useTextTool.ts    # 文字
│   ├── pages/
│   │   ├── Home/                 # 入口页
│   │   ├── ImageEditor/          # 图片编辑器页面 + 各工具面板
│   │   └── VideoEditor/          # 视频剪辑（仅 UI 占位，未实现）
│   ├── store/
│   │   └── imageEditorStore.ts   # Zustand store（含 undo/redo 历史栈）
│   ├── styles/
│   │   └── index.less            # 全局样式
│   ├── App.tsx                   # 根组件（路由）
│   └── index.tsx                 # 渲染进程入口
├── index.html                    # HTML 模板（Vite 入口）
├── electron.vite.config.ts       # electron-vite 配置
├── tsconfig.json                 # TS 配置
├── package.json                  # 项目配置
└── README.md                     # 项目说明
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

`electron-vite dev` 会同时启动渲染进程的 Vite 开发服务器（含 HMR）与 Electron 主进程。

### 构建应用

```bash
# 构建主进程与渲染进程到 out/
npm run build

# 打包 Electron 应用
npm run build:electron
```

### 类型检查

```bash
npm run typecheck
```

## 功能特性

### 图片编辑器

- **导入 / 导出** - 支持点击选择或拖拽导入（jpg/jpeg/png），导出为 PNG
- **移动** - 画布缩放与拖拽平移
- **裁剪** - 输出画框，可锁定比例
- **调色** - 亮度 / 对比度 / 饱和度
- **文字** - 添加、编辑、移动文字标注
- **画笔** - 自由绘制笔迹
- **马赛克 / 模糊** - 框选区域打码
- **滤镜** - 内置滤镜预设
- **撤销 / 重做** - 快照式历史栈（上限 50），支持 Ctrl+Z / Ctrl+Shift+Z
- **视图** - 适应屏幕 / 100% 原始尺寸

### 视频剪辑

当前仅为 UI 占位，剪辑逻辑尚未实现。

## 架构说明

### 进程通信

`electron/preload.js` 通过 `contextBridge` 暴露 `window.electronAPI`，主进程 `electron/handlers/file.js` 提供 IPC handler：

- `showOpenDialogSync` - 打开文件选择对话框
- `readSourceFile` - 读取文件内容
- `saveImage` - 弹出另存为对话框并写入 PNG

### 画布与坐标系

`ImageCanvas` 初始化 Pixi `Application`，构建 `world` 容器（含底图层 `baseLayer` 与标注层 `annotationLayer`）。图片 anchor 为 0.5（以中心为原点），坐标换算统一在 world 局部坐标系中进行（见 `coords.ts`）。

导出时使用 `RenderTexture` 与变换矩阵，按裁剪框 1:1 渲染为 PNG。

各工具逻辑拆分为独立 Hook，通过 ref 共享 Pixi 对象。

> 注意：`ImageCanvas` 中导入了 `pixi.js/unsafe-eval`，以适配 Electron 禁止 `unsafe-eval` 的 CSP 环境。

### 状态管理

使用 Zustand 单一 store（`imageEditorStore.ts`）。编辑状态（标注、调色、滤镜、马赛克、裁剪框）纳入快照式 undo/redo 历史，切换图片时清空并重置历史。

### 包说明

- **onnxruntime-node** - ONNX 模型推理（用于文字检测与识别等），非浏览器环境使用
- **sharp** - 图片处理库（用于裁剪、调整大小等），非浏览器环境使用

## 环境要求

- Node.js >= 18
- npm >= 9

## 许可证

MIT
