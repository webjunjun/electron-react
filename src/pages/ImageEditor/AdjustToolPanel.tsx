import { Button, Slider, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  useImageEditorStore,
  DEFAULT_ADJUSTMENTS,
} from '../../store/imageEditorStore';

const { Text } = Typography;

/** 调色工具的属性面板：亮度/对比度/饱和度，直接读写 store。 */
function AdjustToolPanel() {
  const adjustments = useImageEditorStore((s) => s.adjustments);
  const setAdjustment = useImageEditorStore((s) => s.setAdjustment);
  const resetAdjustments = useImageEditorStore((s) => s.resetAdjustments);

  const isDefault =
    adjustments.brightness === DEFAULT_ADJUSTMENTS.brightness &&
    adjustments.contrast === DEFAULT_ADJUSTMENTS.contrast &&
    adjustments.saturation === DEFAULT_ADJUSTMENTS.saturation;

  return (
    <>
      <div className="editor-panel__section-title">调整</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text type="secondary">亮度</Text>
          <Slider
            min={-100}
            max={100}
            value={adjustments.brightness}
            onChange={(v) => setAdjustment({ brightness: v })}
          />
        </div>
        <div>
          <Text type="secondary">对比度</Text>
          <Slider
            min={-100}
            max={100}
            value={adjustments.contrast}
            onChange={(v) => setAdjustment({ contrast: v })}
          />
        </div>
        <div>
          <Text type="secondary">饱和度</Text>
          <Slider
            min={-100}
            max={100}
            value={adjustments.saturation}
            onChange={(v) => setAdjustment({ saturation: v })}
          />
        </div>
        <Button
          block
          icon={<ReloadOutlined />}
          disabled={isDefault}
          onClick={resetAdjustments}
        >
          重置
        </Button>
      </Space>
    </>
  );
}

export default AdjustToolPanel;
