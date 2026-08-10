import { useRef } from 'react';
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
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  const isDefault =
    adjustments.brightness === DEFAULT_ADJUSTMENTS.brightness &&
    adjustments.contrast === DEFAULT_ADJUSTMENTS.contrast &&
    adjustments.saturation === DEFAULT_ADJUSTMENTS.saturation;

  // 一次拖动只记录一次历史：首次 onChange 时 push（记录旧值），onChangeComplete 复位
  const dirtyRef = useRef(false);
  const handleChange = (patch: Partial<typeof adjustments>) => {
    if (!dirtyRef.current) {
      pushHistory(); // 此刻 store 仍是旧值，记录的是拖动前状态
      dirtyRef.current = true;
    }
    setAdjustment(patch);
  };
  const handleAfterChange = () => {
    dirtyRef.current = false;
  };

  const handleReset = () => {
    if (isDefault) return;
    pushHistory();
    resetAdjustments();
  };

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
            onChange={(v) => handleChange({ brightness: v })}
            onChangeComplete={handleAfterChange}
          />
        </div>
        <div>
          <Text type="secondary">对比度</Text>
          <Slider
            min={-100}
            max={100}
            value={adjustments.contrast}
            onChange={(v) => handleChange({ contrast: v })}
            onChangeComplete={handleAfterChange}
          />
        </div>
        <div>
          <Text type="secondary">饱和度</Text>
          <Slider
            min={-100}
            max={100}
            value={adjustments.saturation}
            onChange={(v) => handleChange({ saturation: v })}
            onChangeComplete={handleAfterChange}
          />
        </div>
        <Button
          block
          icon={<ReloadOutlined />}
          disabled={isDefault}
          onClick={handleReset}
        >
          重置
        </Button>
      </Space>
    </>
  );
}

export default AdjustToolPanel;
