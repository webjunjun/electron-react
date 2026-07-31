# Electron React App

一个基于 Electron + React + Less + Antd + Redux 构建的现代化桌面应用脚手架。

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **React 18** - 最新的 React 版本
- **Redux Toolkit** - 简化的 Redux 状态管理
- **Ant Design 5** - 企业级 UI 组件库
- **Less** - CSS 预处理器
- **electron-vite / Vite 5** - 现代化打包工具
- **React Router 6** - 路由管理

## 项目结构

```
electron-react/
├── electron/              # Electron 主进程
│   └── main.js           # 主进程入口文件
├── src/                   # 源代码（渲染进程）
│   ├── pages/            # 页面组件
│   ├── store/           # Redux 状态管理
│   │   ├── slices/     # Redux slices
│   │   └── index.ts    # Store 配置
│   ├── styles/         # 样式文件
│   │   └── index.less  # 全局样式
│   ├── App.tsx         # 根组件
│   └── index.tsx       # 渲染进程入口
├── index.html          # HTML 模板（Vite 入口）
├── electron.vite.config.ts  # electron-vite 配置
├── tsconfig.json       # TS 配置
├── package.json        # 项目配置
└── README.md           # 项目说明
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

## 功能特性

### ✅ 已集成功能

- [x] Electron 主进程配置
- [x] React 18 + JSX 转换
- [x] Redux Toolkit 状态管理
  - 计数器示例 (counterSlice)
  - 用户管理示例 (userSlice)
- [x] Ant Design 5 组件库
- [x] Less 样式预处理
- [x] React Router 6 路由
- [x] electron-vite / Vite 5 打包配置
- [x] 热重载开发环境
- [x] Electron 打包配置

### 📦 示例页面

1. **首页** - 展示项目介绍和 Redux 计数器示例
2. **用户页面** - 演示用户登录/登出功能
3. **设置页面** - 应用设置界面示例

## 开发指南

### 添加新页面

1. 在 `src/pages/` 下创建新组件
2. 在 `src/App.tsx` 中添加路由
3. 在侧边栏菜单中添加导航链接

### 添加 Redux Slice

1. 在 `src/store/slices/` 下创建新的 slice 文件
2. 在 `src/store/index.ts` 中引入并添加到 reducer

### 自定义主题

在 `src/styles/index.less` 中修改 Ant Design 主题变量：

```less
@primary-color: #1890ff;  // 主题色
```

## 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

## 许可证

MIT