import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, message, Space } from 'antd';
import * as ort from 'onnxruntime-web';
import detModelUrl from '../../assets/ocr_lib/PP-OCRv6_tiny_det.onnx?url';
// 默认 bundle 使用 jsep 版 wasm 运行时；用 ?url 交给 Vite 打包并提供可访问路径
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

// PP-OCRv6_tiny_det.onnx: 文字检测模型，用于定位图片中的文字区域
// 可检测手写体、印刷体、旋转、弯曲及艺术字体
// NCHW: N个样本，C个通道，H高，W宽 float32（多个样本，3通道，高不限，宽不限）

// PP-OCRv6_tiny_rec.onnx: 文字识别模型，用于识别文字区域中的字符
// 可识别手写体、印刷体、旋转、弯曲及艺术字体中的字符，支持49种语言
// NCHW: N个样本，C个通道，H高，W宽 float32（多个样本，3通道，高48像素，宽不限）

function Ocr() {
  const navigate = useNavigate();
  const [image, setImage] = useState<{ src: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const detSessionRef = useRef<ort.InferenceSession | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadDetModel = async () => {
      try {
        // 指定 wasm 运行时文件路径，否则默认从 CDN/相对路径拉取会 404 导致加载失败
        ort.env.wasm.wasmPaths = {
          wasm: ortWasmUrl
        }
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(detModelUrl);
        if (disposed) {
          await session.release();
          return;
        }
        console.log(session);
        detSessionRef.current = session;
        setModelStatus('ready');
      } catch (error) {
        console.error('加载 PP-OCRv6_tiny_det 模型失败', error);
        if (!disposed) {
          setModelStatus('error');
          message.error('文本检测模型加载失败');
        }
      }
    };

    loadDetModel();

    return () => {
      disposed = true;
      const session = detSessionRef.current;
      detSessionRef.current = null;
      void session?.release();
    };
  }, []);

  const loadImage = (path: string, name: string) => {
    setImage({
      src: `${LOCAL_FILE_PROTOCOL}/${encodeURI(path.replace(/\\/g, '/'))}`,
      name,
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

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setImage(null);
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
                className="ocr-preview__image"
                src={image.src}
                alt={image.name}
                // 禁用图片拖拽 避免冒泡到父容器绑定的拖拽事件
                draggable={false}
              />
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
        <span className="ocr-status__item">字符数：0</span>
      </div>
    </div>
  );
}

export default Ocr;
