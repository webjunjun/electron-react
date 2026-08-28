// 兼容门面：保留旧路径以避免调用方修改。
// 实际实现已拆分到 ./imageEditor/ 目录（slice 模式）。
export * from './imageEditor';
export { useImageEditorStore } from './imageEditor';
