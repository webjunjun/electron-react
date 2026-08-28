import { ReactNode } from 'react';
import { ColorPicker, InputNumber, Segmented, Slider, Space, Switch, Typography } from 'antd';
import { ArrowRightOutlined, BorderOutlined } from '@ant-design/icons';
import type { ShapeType } from '../../store/imageEditorStore';

const { Text } = Typography;

/** 新建形状标注时的默认样式。 */
export interface DefaultShapeStyle {
  shape: ShapeType;
  size: number;
  color: string;
  /** 是否填充（仅矩形/椭圆生效）。 */
  fill: boolean;
}

interface ShapeToolPanelProps {
  defaultStyle: DefaultShapeStyle;
  onDefaultStyleChange: (patch: Partial<DefaultShapeStyle>) => void;
}

const SIZE_MIN = 1;
const SIZE_MAX = 100;

/** 椭圆图标：antd 缺少现成"圆"图标，用 CSS 直接画更直观。 */
const EllipseIcon = () => (
  <span
    style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      border: '2px solid currentColor',
      borderRadius: '50%',
    }}
  />
);

/** 直线图标：一条短粗线。 */
const LineIcon = () => (
  <span
    style={{
      display: 'inline-block',
      width: 16,
      height: 0,
      borderTop: '2px solid currentColor',
    }}
  />
);

const shapeOptions: { value: ShapeType; label: ReactNode; title: string }[] = [
  { value: 'rect', label: <BorderOutlined />, title: '矩形' },
  { value: 'ellipse', label: <EllipseIcon />, title: '椭圆（按 Shift 锁圆）' },
  { value: 'line', label: <LineIcon />, title: '直线' },
  { value: 'arrow', label: <ArrowRightOutlined />, title: '箭头' },
];

/** 形状工具的属性面板：形状类型、填充、线宽、颜色。 */
function ShapeToolPanel({ defaultStyle, onDefaultStyleChange }: ShapeToolPanelProps) {
  const setSize = (value: number | null) => {
    if (value == null) return;
    onDefaultStyleChange({ size: value });
  };

  // 填充仅对矩形/椭圆有效；切换到直线/箭头时禁用开关
  const fillDisabled =
    defaultStyle.shape === 'line' || defaultStyle.shape === 'arrow';

  return (
    <>
      <div className="editor-panel__section-title">形状</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text type="secondary">
          在画布上按住并拖动即可绘制几何形状。按住 Shift 可锁定等比。
        </Text>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            形状
          </Text>
          <Segmented
            block
            value={defaultStyle.shape}
            onChange={(v) => onDefaultStyleChange({ shape: v as ShapeType })}
            options={shapeOptions}
          />
        </div>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            填充
          </Text>
          <Switch
            checked={defaultStyle.fill}
            disabled={fillDisabled}
            onChange={(checked) => onDefaultStyleChange({ fill: checked })}
          />
          {fillDisabled && (
            <Text type="secondary" style={{ marginLeft: 8 }}>
              仅矩形/椭圆可用
            </Text>
          )}
        </div>

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

export default ShapeToolPanel;
