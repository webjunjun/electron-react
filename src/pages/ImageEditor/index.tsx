import { useRef, useState } from 'react';
import { App, Button, Space } from 'antd';
import {
  PictureOutlined,
  DragOutlined,
  ExpandOutlined,
  BgColorsOutlined,
  FontSizeOutlined,
  HighlightOutlined,
  ExportOutlined,
  UndoOutlined,
  RedoOutlined,
  ImportOutlined,
  CompressOutlined,
  FilterOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import EditorShell, { RailTool } from '../../components/EditorShell';
import ImageCanvas, { ImageCanvasHandle } from '../../components/ImageCanvas';
import { useImageEditorStore } from '../../store/imageEditorStore';
import TextToolPanel, { DefaultTextStyle } from './TextToolPanel';
import MoveToolPanel from './MoveToolPanel';
import CropToolPanel from './CropToolPanel';
import AdjustToolPanel from './AdjustToolPanel';
import BrushToolPanel, { DefaultBrushStyle } from './BrushToolPanel';
import MosaicToolPanel from './MosaicToolPanel';
import FilterToolPanel from './FilterToolPanel';

const tools: RailTool[] = [
  { key: 'move', label: '移动', icon: <DragOutlined /> },
  { key: 'crop', label: '裁剪', icon: <ExpandOutlined /> },
  { key: 'adjust', label: '调色', icon: <BgColorsOutlined /> },
  { key: 'text', label: '文字', icon: <FontSizeOutlined /> },
  { key: 'brush', label: '画笔', icon: <HighlightOutlined /> },
  { key: 'mosaic', label: '马赛克', icon: <AppstoreOutlined /> },
  { key: 'filter', label: '滤镜', icon: <FilterOutlined /> },
];

const toolLabels: Record<string, string> = Object.fromEntries(
  tools.map((t) => [t.key, t.label])
);

function ImageEditor() {
  const { message } = App.useApp();
  const [activeTool, setActiveTool] = useState('move');

  const canvasRef = useRef<ImageCanvasHandle>(null);

  const [defaultTextStyle, setDefaultTextStyle] = useState<DefaultTextStyle>({
    fontSize: 24,
    color: '#ff4d4f',
  });

  const [defaultBrushStyle, setDefaultBrushStyle] = useState<DefaultBrushStyle>({
    size: 6,
    color: '#ff4d4f',
  });

  const imageSrc = useImageEditorStore((s) => s.imageSrc);
  const imageSize = useImageEditorStore((s) => s.imageSize);
  const zoom = useImageEditorStore((s) => s.zoom);
  const setImage = useImageEditorStore((s) => s.setImage);
  const annotations = useImageEditorStore((s) => s.annotations);
  const selectedId = useImageEditorStore((s) => s.selectedId);
  const updateAnnotation = useImageEditorStore((s) => s.updateAnnotation);
  const removeAnnotation = useImageEditorStore((s) => s.removeAnnotation);

  const selected = annotations.find((a) => a.id === selectedId) ?? null;
  const selectedText = selected?.type === 'text' ? selected : null;

  // 生成图片的 URL 并设置到状态中
  const loadImageUrl = async (path: string) => {
    const fileBuffer = await window.electronAPI.readSourceFile({
      filePath: path,
      codeFormat: ''
    });
    if (!fileBuffer) return;
    const ext = path.split('.').pop();
    const blob = new Blob([fileBuffer], { type: `image/${ext}` });
    const blobUrl = URL.createObjectURL(blob);
    const probe = new Image();
    probe.onload = () => {
      setImage(path, blobUrl, {
        width: probe.naturalWidth,
        height: probe.naturalHeight
      });
    };
    probe.onerror = () => message.error('图片加载失败');
    probe.src = blobUrl;
  };

  // 点击导入图片
  const handleImport = async () => {
    const result = await window.electronAPI.showOpenDialogSync({
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }],
    });
    if (!result) return;
    // 获取文件的buffer数据
    const calcPath = result[0].replace(/\\/g, '/');
    loadImageUrl(calcPath);
  };

  // 拖拽导入图片
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Electron 渲染进程中 File 对象有 .path 属性，直接使用
    if (!file.type.startsWith('image/')) { message.error('请选择图片文件'); return; }
    const calcPath = (file as any).path.replace(/\\/g, '/');
    loadImageUrl(calcPath);
  };

  const toolbarExtra = (
    <Space>
      <Button icon={<ImportOutlined />} onClick={handleImport}>
        导入
      </Button>
      <Button
        icon={<CompressOutlined />}
        disabled={!imageSrc}
        onClick={() => canvasRef.current?.fitToScreen()}
      >
        适应屏幕
      </Button>
      <Button
        disabled={!imageSrc}
        onClick={() => canvasRef.current?.actualSize()}
      >
        100%
      </Button>
      <Button type="text" icon={<UndoOutlined />} disabled />
      <Button type="text" icon={<RedoOutlined />} disabled />
      <Button type="primary" icon={<ExportOutlined />} disabled={!imageSrc}>
        导出
      </Button>
    </Space>
  );

  const renderPanel = () => {
    switch (activeTool) {
      case 'move':
        return <MoveToolPanel />;
      case 'crop':
        return <CropToolPanel />;
      case 'adjust':
        return <AdjustToolPanel />;
      case 'text':
        return (
          <TextToolPanel
            selected={selectedText}
            defaultStyle={defaultTextStyle}
            onDefaultStyleChange={(patch) =>
              setDefaultTextStyle((s) => ({ ...s, ...patch }))
            }
            onUpdateSelected={(patch) =>
              selectedText && updateAnnotation(selectedText.id, patch)
            }
            onDeleteSelected={() =>
              selectedText && removeAnnotation(selectedText.id)
            }
          />
        );
      case 'brush':
        return (
          <BrushToolPanel
            defaultStyle={defaultBrushStyle}
            onDefaultStyleChange={(patch) =>
              setDefaultBrushStyle((s) => ({ ...s, ...patch }))
            }
          />
        );
      case 'mosaic':
        return <MosaicToolPanel />;
      case 'filter':
        return <FilterToolPanel />;
      default:
        return null;
    }
  };

  const status = (
    <>
      <span className="editor-status__item">工具：{toolLabels[activeTool]}</span>
      <span className="editor-status__item">缩放：{Math.round(zoom * 100)}%</span>
      <span className="editor-status__item">
        {imageSize ? `${imageSize.width} × ${imageSize.height}` : '未打开图片'}
      </span>
    </>
  );

  return (
    <EditorShell
      icon={<PictureOutlined />}
      title="图片编辑"
      tools={tools}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      toolbarExtra={toolbarExtra}
      panel={renderPanel()}
      status={status}
    >
      <div
        className="image-canvas"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <ImageCanvas
          ref={canvasRef}
          activeTool={activeTool}
          defaultTextStyle={defaultTextStyle}
          defaultBrushStyle={defaultBrushStyle}
        />
        {!imageSrc && (
          <div className="image-canvas__empty" onClick={handleImport}>
            <PictureOutlined style={{ fontSize: 48, marginBottom: 12 }} />
            <div>拖入图片或点击此处导入</div>
          </div>
        )}
      </div>
    </EditorShell>
  );
}

export default ImageEditor;
