import * as ort from 'onnxruntime-node';

export const registerOnnxHandlers = (ipcMain) => {
  // 载入模型
  // @param modelPath - 模型文件路径
  // @param options - 可选的模型加载选项
  // @returns 已载入的模型会话
  ipcMain.handle('onnx:loadModel', async (_event, modelPath, options = {}) => {
    try {
      // 创建会话，载入模型
      const session = await ort.InferenceSession.create(modelPath, options);
      return session;
    } catch (error) {
      return null;
    }
  });
  // 运行模型
  // @param session - 已载入的模型会话
  // @param input - 输入数据，键为输入名称，值为 OnnxValue
  // @returns 运行的输出数据
  ipcMain.handle('onnx:runModel', async (_event, { session, input }) => {
    try {
      // 运行模型
      const output = await session.run({ input });
      return output;
    } catch (error) {
      return null;
    }
  });
  // 释放模型
  // @param session - 已载入的模型会话
  ipcMain.handle('onnx:releaseModel', (_event, session) => {
    // 释放会话
    session.release();
  });
}