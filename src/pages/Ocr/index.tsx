import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, message, Space } from 'antd';
import * as ort from 'onnxruntime-web';
// 用 ?url 交给 Vite 打包并提供可访问路径
import detModelUrl from '../../assets/ocr_lib/PP-OCRv6_tiny_det.onnx?url';
import recModelUrl from '../../assets/ocr_lib/PP-OCRv6_tiny_rec.onnx?url';
// 默认 bundle 使用 jsep 版 wasm 运行时
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { LOCAL_FILE_PROTOCOL } from '../../constants';
import {
  ArrowLeftOutlined,
  ScanOutlined,
  ImportOutlined,
  CopyOutlined,
  ExportOutlined,
  DeleteOutlined,
  InboxOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { buildDetInputTensor } from './detImage';
import { dbPostProcess, type DetBox } from './dbPostProcess';
import { buildRecTensors, type RecCrop } from './recImage';
import { ctcDecode } from './ctcDecode';
import DetectionOverlay from './DetectionOverlay';

// PP-OCRv6_tiny_det.onnx: 文字检测模型，用于定位图片中的文字区域
// 可检测手写体、印刷体、旋转、弯曲及艺术字体
// NCHW: N个样本，C个通道，H高，W宽 float32（多个样本，3通道，高不限，宽不限）

// PP-OCRv6_tiny_rec.onnx: 文字识别模型，用于识别文字区域中的字符
// 可识别手写体、印刷体、旋转、弯曲及艺术字体中的字符，支持49种语言
// NCHW: N个样本，C个通道，H高，W宽 float32（多个样本，3通道，高48像素，宽不限）

function Ocr() {
  const navigate = useNavigate();
  const [image, setImage] = useState<{ src: string; name: string; filePath: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const detSessionRef = useRef<ort.InferenceSession | null>(null);
  const recSessionRef = useRef<ort.InferenceSession | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [boxes, setBoxes] = useState<DetBox[]>([]);
  const [text, setText] = useState('');
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    let disposed = false;

    const loadDetModel = async () => {
      try {
        // 指定 wasm 运行时文件路径，否则默认从 CDN/相对路径拉取会 404 导致加载失败
        ort.env.wasm.wasmPaths = {
          wasm: ortWasmUrl
        }
        ort.env.wasm.numThreads = 1;
        const detSession = await ort.InferenceSession.create(detModelUrl);
        const recSession = await ort.InferenceSession.create(recModelUrl);
        if (disposed) {
          await detSession.release();
          await recSession.release();
          return;
        }
        detSessionRef.current = detSession;
        recSessionRef.current = recSession;
        // 打印模型信息 了解模型输入输出信息
        console.log('OCR模型加载成功', detSession, recSession);
        setModelStatus('ready');
      } catch (error) {
        console.error('加载OCR模型失败', error);
        if (!disposed) {
          setModelStatus('error');
          message.error('OCR模型加载失败');
        }
      }
    };
    // 加载OCR模型
    loadDetModel();

    return () => {
      disposed = true;
      const session = detSessionRef.current;
      detSessionRef.current = null;
      void session?.release();
    };
  }, []);

  // 加载图片
   const loadImage = (path: string, name: string) => {
    setImage({
      src: `${LOCAL_FILE_PROTOCOL}/${encodeURI(path.replace(/\\/g, '/'))}`,
      name,
      filePath: path,
    });
  };

  // 导入图片
  const handleImport = async () => {
    const result = await window.electronAPI.showOpenDialogSync({
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
      properties: ['openFile'],
    });
    const path = result?.[0];
    if (!path) return;
    loadImage(path, path.split(/[\\/]/).pop() ?? '图片');
  };

  // 鼠标拖拽释放导入图片
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.warning('请拖入图片文件');
      return;
    }

    const path = (file as File & { path?: string }).path;
    if (!path) {
      message.error('无法读取图片路径');
      return;
    }
    loadImage(path, file.name);
  };

  // 清除图片
  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setImage(null);
  };

  // 开始识别
  const handleScan = async () => {
    if (!image) {
      message.warning('请先导入图片');
      return;
    }
    if (modelStatus !== 'ready') {
      message.warning('请先加载OCR模型');
      return;
    }
    try {
      // 调整图片尺寸 适合模型输入尺寸约束
      // 直接用原始文件路径，避免协议 URL 的 encodeURI 编码问题
      const resizedImage = await window.electronAPI.resizeImageDetOcr({
        path: image.filePath,
      });
      if (!resizedImage?.success) {
        message.error(resizedImage?.error || '调整图片尺寸失败');
        return;
      }
      // 仅解构数据字段，剔除 success/error 等控制字段，并将可选字段收窄为必填
      const {
        data,
        width,
        height,
        channels,
        originalWidth,
        originalHeight,
        ratioW,
        ratioH,
      } = resizedImage;
      // 调用 OCR 文本检测模型识别文字区域
      const detTensor = buildDetInputTensor({
        data, width, height, channels, originalWidth, originalHeight, ratioW, ratioH,
      });
      const detSession = detSessionRef.current;
      if (!detSession) {
        message.error('检测模型未就绪');
        return;
      }
      // 推理：输入名取自模型（通常为 'x'），输出为概率图 [1,1,H,W]
      const inputName = detSession.inputNames[0];
      const outputName = detSession.outputNames[0];
      const results = await detSession.run({ [inputName]: detTensor.tensor });
      const outputTensor = results[outputName];
      const pred = outputTensor.data as Float32Array;
      const outDims = outputTensor.dims as number[]
      const predH = outDims[2];
      const predW = outDims[3];
      // DBPostProcess：概率图 -> 文字框，并按 ratioW/ratioH 还原回原图坐标
      const boxes = dbPostProcess(pred, predH, predW, ratioW, ratioH, {
        thresh: 0.2,
        box_thresh: 0.4,
        unclip_ratio: 1.4,
        max_candidates: 3000,
      });
      console.log('检测框数量:', boxes.length, boxes);
      setBoxes(boxes);

      // ===== rec 文字识别 =====
      const recSession = recSessionRef.current;
      if (!recSession || boxes.length === 0) return;

      // 1. 逐框透视裁剪 + RecResizeImg（主进程返回 48×resW RGB HWC，动态宽度）
      const cropResults = await Promise.all(
        boxes.map((b) =>
          window.electronAPI.cropTextRegion({
            path: image.filePath,
            quad: b.points,
          })
        )
      );
      const crops: RecCrop[] = [];
      for (const r of cropResults) {
        if (!r || !r.success) {
          console.error('[rec] 裁剪失败:', r?.error);
          continue;
        }
        crops.push({ data: r.data, width: r.width, height: r.height, channels: r.channels });
      }
      if (crops.length === 0) {
        message.warning('无有效文字条');
        return;
      }

      // 2. 分组 batch（按宽度排序，组内用最大宽度 pad 0）
      const batches = buildRecTensors(crops);
      console.log('[rec] batches:', batches.length, batches.map((b) => b.tensor.dims));

      // 3. 逐 batch 推理
      const recInputName = recSession.inputNames[0];
      const recOutputName = recSession.outputNames[0];
      const recOutputs: { indices: number[]; tensor: ort.Tensor }[] = [];
      for (const batch of batches) {
        const out = await recSession.run({ [recInputName]: batch.tensor });
        recOutputs.push({ indices: batch.indices, tensor: out[recOutputName] });
      }

      // 4. CTC 解码，按 batch.indices 回填到原顺序
      const texts = new Array<string>(crops.length).fill('');
      for (const o of recOutputs) {
        const decoded = ctcDecode(o.tensor);
        console.log('[rec] output dims:', o.tensor.dims, 'decoded:', decoded);
        for (let i = 0; i < o.indices.length; i++) {
          texts[o.indices[i]] = decoded[i]?.text ?? '';
        }
      }
      const allText = texts.join('\n');
      setText(allText);
      setCharCount(allText.replace(/\n/g, '').length);
    } catch (error) {
      console.error('[det | rec] 识别失败:', error);
      message.error('识别失败');
      return;
    }
  };

  return (
    <div className="ocr-page">
      {/* 顶部工具条 */}
      <div className="ocr-toolbar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          返回
        </Button>
        <span className="ocr-toolbar__title">
          <ScanOutlined />
          文字识别
        </span>
        <div className="ocr-toolbar__spacer" />
        <Space>
          <Button
            icon={<ImportOutlined />}
            onClick={handleImport}>导入</Button>
          <Button
            type="primary"
            icon={<ScanOutlined />}
            disabled={!image || modelStatus !== 'ready'}
            loading={modelStatus === 'loading'}
            onClick={handleScan}
          >
            开始识别
          </Button>
          <Button icon={<CopyOutlined />} disabled>
            复制
          </Button>
          <Button icon={<ExportOutlined />} disabled>
            导出 TXT
          </Button>
        </Space>
      </div>

      {/* 双栏主体：左图右文 */}
      <div className="ocr-body">
        <div
          className={`ocr-preview${isDragging ? ' ocr-preview--dragging' : ''}`}
          onClick={!image ? handleImport : undefined}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          {image ? (
            <>
              <img
                ref={imgRef}
                className="ocr-preview__image"
                src={image.src}
                alt={image.name}
                // 禁用图片拖拽 避免冒泡到父容器绑定的拖拽事件
                draggable={false}
              />
              <DetectionOverlay boxes={boxes} imgRef={imgRef} />
              <div className="ocr-preview__actions">
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleClear}
                  aria-label="移除图片"
                >
                  移除图片
                </Button>
              </div>
              {isDragging && (
                <div className="ocr-preview__drop-mask">
                  <InboxOutlined />
                  <span>松开以更换图片</span>
                </div>
              )}
            </>
          ) : (
            <div className="ocr-preview__empty">
              <PictureOutlined style={{ fontSize: 48, marginBottom: 12 }} />
              <div>{isDragging ? '松开以导入图片' : '拖入图片或点击此处导入'}</div>
            </div>
          )}
        </div>

        <div className="ocr-result">
          <div className="ocr-result__title">识别结果</div>
          <textarea
            className="ocr-result__text"
            placeholder="识别结果将显示在这里，可手动修正…"
            value={text}
            readOnly
          />
        </div>
      </div>

      {/* 状态栏 */}
      <div className="ocr-status">
        <span className="ocr-status__item">{image?.name ?? '未打开图片'}</span>
        <span className="ocr-status__item">
          状态：{modelStatus === 'loading' ? '正在加载文本检测模型' : modelStatus === 'error' ? '文本检测模型加载失败' : image ? '待识别' : '等待导入'}
        </span>
        <span className="ocr-status__item">字符数：{charCount}</span>
      </div>
    </div>
  );
}

export default Ocr;
