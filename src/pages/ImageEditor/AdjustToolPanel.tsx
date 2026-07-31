import { Slider, Space, Typography } from 'antd';

const { Text } = Typography;

interface AdjustToolPanelProps {
  brightness: number;
  contrast: number;
  saturation: number;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
}

/** 调色工具的属性面板：亮度/对比度/饱和度。 */
function AdjustToolPanel({
  brightness,
  contrast,
  saturation,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
}: AdjustToolPanelProps) {
  return (
    <>
      <div className="editor-panel__section-title">调整</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text type="secondary">亮度</Text>
          <Slider min={-100} max={100} value={brightness} onChange={onBrightnessChange} />
        </div>
        <div>
          <Text type="secondary">对比度</Text>
          <Slider min={-100} max={100} value={contrast} onChange={onContrastChange} />
        </div>
        <div>
          <Text type="secondary">饱和度</Text>
          <Slider min={-100} max={100} value={saturation} onChange={onSaturationChange} />
        </div>
      </Space>
    </>
  );
}

export default AdjustToolPanel;
