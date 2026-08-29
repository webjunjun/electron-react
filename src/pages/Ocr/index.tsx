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
import { dbPostProcess, sortBoxesReadingOrder, type DetBox } from './dbPostProcess';
import { buildRecTensors, type RecCrop } from './recImage';
import { ctcDecode } from './ctcDecode';
import DetectionOverlay from './DetectionOverlay';

// OCR 识别流水线：PP-OCRv6_tiny_det + PP-OCRv6_tiny_rec
//   det（检测）：输入图片 NCHW float32，输出文字框概率图 → dbPostProcess 还原为原图 4 角点坐标
//   rec（识别）：将每个检测框透视裁剪 + RecResizeImg 到 3×48×320（固定宽度对齐训练），批推理后 CTC 解码为文本
//   字符集：6904 汉字/符号 + blank(索引0) + space(索引6905)，共 6906 类

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
  const [scanning, setScanning] = useState(false);
  /** rec 识别置信度（0~1），与 boxes 一一对应 */
  const [recScores, setRecScores] = useState<(number | null)[]>([]);
  const [scanElapsed, setScanElapsed] = useState<number | null>(null);
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  /** 模型加载失败后的重试计数，变更触发重新加载 */
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let disposed = false;

    const loadDetModel = async () => {
      setModelStatus('loading');
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
      const detSession = detSessionRef.current;
      const recSession = recSessionRef.current;
      detSessionRef.current = null;
      recSessionRef.current = null;
      void detSession?.release();
      void recSession?.release();
    };
  }, [retryCount]);

  // 加载图片
   const loadImage = (path: string, name: string) => {
    // 换图时清空上一次的检测框与识别结果，避免旧框画在新图上
    setBoxes([]);
    setRecScores([]);
    setText('');
    setCharCount(0);
    setAvgConfidence(null);
    setScanElapsed(null);
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
    setBoxes([]);
    setRecScores([]);
    setText('');
    setCharCount(0);
    setAvgConfidence(null);
    setScanElapsed(null);
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
    if (scanning) return;
    // 清空上一次结果，识别过程中不再残留旧数据
    setBoxes([]);
    setRecScores([]);
    setText('');
    setCharCount(0);
    setAvgConfidence(null);
    setScanElapsed(null);
    setScanning(true);
    const startTime = performance.now();
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
      const detBoxes = dbPostProcess(pred, predH, predW, ratioW, ratioH, {
        thresh: 0.2,
        box_thresh: 0.4,
        unclip_ratio: 1.4,
        max_candidates: 3000,
      });
      if (detBoxes.length === 0) {
        message.info('未检测到文字');
        return;
      }
      // 按阅读顺序排序（按 y 分行、行内按 x），保证文本拼接顺序与视觉阅读一致
      const boxes = sortBoxesReadingOrder(detBoxes);
      console.log('检测框数量:', boxes.length, boxes);
      setBoxes(boxes);

      // ===== rec 文字识别 =====
      const recSession = recSessionRef.current;
      if (!recSession) {
        message.error('识别模型未就绪');
        return;
      }

      // 1. 批量透视裁剪 + RecResizeImg（主进程一次读图，逐框透视矫正 → resize 高48 → pad 到宽320）
      const cropResults = await window.electronAPI.cropTextRegions({
        path: image.filePath,
        quads: boxes.map((b) => b.points),
      });
      if (!cropResults?.success) {
        message.error(cropResults?.error || '裁剪文字区域失败');
        return;
      }
      // 保留与框的一一对应关系：valid 记录每个有效 crop 对应的框索引
      const valid: { crop: RecCrop; boxIdx: number }[] = [];
      cropResults.crops.forEach((r, boxIdx) => {
        if (!r || !r.success) {
          console.error('[rec] 裁剪失败:', r?.error);
          return;
        }
        valid.push({
          crop: { data: r.data, width: r.width, height: r.height, channels: r.channels },
          boxIdx,
        });
      });
      if (valid.length === 0) {
        message.warning('无有效文字条');
        return;
      }

      // 2. 固定 320 宽度，直接按 batchSize 分组（无需排序/pad）
      const batches = buildRecTensors(valid.map((v) => v.crop));
      console.log('[rec] batches:', batches.length, batches.map((b) => b.tensor.dims));

      // 3. 逐 batch 推理
      const recInputName = recSession.inputNames[0];
      const recOutputName = recSession.outputNames[0];
      const recOutputs: { indices: number[]; tensor: ort.Tensor }[] = [];
      for (const batch of batches) {
        const out = await recSession.run({ [recInputName]: batch.tensor });
        recOutputs.push({ indices: batch.indices, tensor: out[recOutputName] });
      }

      // 4. CTC 解码，按索引回填到框顺序；裁剪失败/未识别出文字的框不进入结果
      const texts = new Array<string>(boxes.length).fill('');
      const confs: (number | null)[] = new Array(boxes.length).fill(null);
      for (const o of recOutputs) {
        const decoded = ctcDecode(o.tensor);
        console.log('[rec] output dims:', o.tensor.dims, 'decoded:', decoded);
        for (let i = 0; i < o.indices.length; i++) {
          const boxIdx = valid[o.indices[i]].boxIdx;
          texts[boxIdx] = decoded[i]?.text ?? '';
          confs[boxIdx] = decoded[i]?.score ?? null;
        }
      }
      const finalBoxes: DetBox[] = [];
      const finalTexts: string[] = [];
      const finalScores: (number | null)[] = [];
      for (let i = 0; i < boxes.length; i++) {
        if (!texts[i]) continue;
        finalBoxes.push(boxes[i]);
        finalTexts.push(texts[i]);
        finalScores.push(confs[i]);
      }
      const allText = finalTexts.join('\n');
      setBoxes(finalBoxes);
      setRecScores(finalScores);
      setText(allText);
      setCharCount(allText.replace(/\n/g, '').length);
      const scored = finalScores.filter((s): s is number => typeof s === 'number');
      setAvgConfidence(
        scored.length ? scored.reduce((sum, s) => sum + s, 0) / scored.length : null
      );
    } catch (error) {
      console.error('[det | rec] 识别失败:', error);
      message.error('识别失败');
    } finally {
      setScanning(false);
      setScanElapsed(Math.round(performance.now() - startTime));
    }
  };

  // 复制
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  // 导出 TXT
  const handleExportTxt = async () => {
    const result = await window.electronAPI.saveText({
      content: text,
      defaultFileName: `OCR结果_${new Date().toISOString().slice(0, 10)}.txt`,
    });
    if (result.saved) {
      message.success('导出成功');
    } else if (result.error) {
      message.error('导出失败: ' + result.error);
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
            loading={scanning || modelStatus === 'loading'}
            onClick={handleScan}
          >
            开始识别
          </Button>
          <Button
            icon={<CopyOutlined />}
            disabled={!text}
            onClick={handleCopy}
          >
            复制
          </Button>
          <Button
            icon={<ExportOutlined />}
            disabled={!text}
            onClick={handleExportTxt}
          >
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
              <DetectionOverlay boxes={boxes} imgRef={imgRef} scores={recScores} />
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
            onChange={(e) => {
              setText(e.target.value);
              setCharCount(e.target.value.replace(/\n/g, '').length);
            }}
          />
        </div>
      </div>

      {/* 状态栏 */}
      <div className="ocr-status">
        <span className="ocr-status__item">{image?.name ?? '未打开图片'}</span>
        <span className="ocr-status__item">
          状态：
          {modelStatus === 'loading'
            ? '正在加载OCR模型'
            : modelStatus === 'error'
              ? '模型加载失败'
              : scanning
                ? '识别中'
                : image
                  ? text || boxes.length
                    ? '识别完成'
                    : '待识别'
                  : '等待导入'}
        </span>
        {modelStatus === 'error' && (
          <Button
            type="link"
            size="small"
            className="ocr-status__item"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            重新加载模型
          </Button>
        )}
        <span className="ocr-status__item">字符数：{charCount}</span>
        {boxes.length > 0 && <span className="ocr-status__item">文本框：{boxes.length}</span>}
        {avgConfidence != null && (
          <span className="ocr-status__item">
            平均置信度：{Math.round(avgConfidence * 100)}%
          </span>
        )}
        {scanElapsed != null && <span className="ocr-status__item">耗时：{scanElapsed}ms</span>}
      </div>
    </div>
  );
}

export default Ocr;
