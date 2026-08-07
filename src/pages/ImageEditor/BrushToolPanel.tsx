import { ColorPicker, InputNumber, Slider, Space, Typography } from 'antd';

const { Text } = Typography;

/** 新建笔迹时的默认样式。 */
export interface DefaultBrushStyle {
  size: number;
  color: string;
}

interface BrushToolPanelProps {
  /** 笔迹默认样式。 */
  defaultStyle: DefaultBrushStyle;
  /** 修改默认样式。 */
  onDefaultStyleChange: (patch: Partial<DefaultBrushStyle>) => void;
}

const SIZE_MIN = 1;
const SIZE_MAX = 100;

/** 画笔工具的属性面板：线宽与颜色。 */
function BrushToolPanel({ defaultStyle, onDefaultStyleChange }: BrushToolPanelProps) {
  const setSize = (value: number | null) => {
    if (value == null) return;
    onDefaultStyleChange({ size: value });
  };

  return (
    <>
      <div className="editor-panel__section-title">画笔</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text type="secondary">
          在画布上按住并拖动即可绘制。此处设置画笔的线宽与颜色。
        </Text>

        <div>
          <Text type="secondary">线宽</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Slider
              min={SIZE_MIN}
              max={SIZE_MAX}
              value={defaultStyle.size}
              onChange={setSize}
              style={{ flex: 1 }}
            />
            <InputNumber
              min={SIZE_MIN}
              max={SIZE_MAX}
              value={defaultStyle.size}
              onChange={setSize}
              style={{ width: 72 }}
            />
          </div>
        </div>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            颜色
          </Text>
          <ColorPicker
            value={defaultStyle.color}
            onChange={(c) => onDefaultStyleChange({ color: c.toHexString() })}
            showText
          />
        </div>
      </Space>
    </>
  );
}

export default BrushToolPanel;
