import { Button, Segmented, Slider, Space, Typography } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { DefaultMosaicStyle } from '../../components/ImageCanvas/useMosaicTool';

const { Text } = Typography;

const STRENGTH_MIN = 5;
const STRENGTH_MAX = 50;

interface MosaicToolPanelProps {
  /** 新建区域的默认参数。 */
  defaultStyle: DefaultMosaicStyle;
  /** 修改默认参数。 */
  onDefaultStyleChange: (patch: Partial<DefaultMosaicStyle>) => void;
}

/** 马赛克工具的属性面板：效果类型 + 强度 + 清除。 */
function MosaicToolPanel({ defaultStyle, onDefaultStyleChange }: MosaicToolPanelProps) {
  const mosaicCount = useImageEditorStore((s) => s.mosaics.length);
  const clearMosaics = useImageEditorStore((s) => s.clearMosaics);
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  const handleClear = () => {
    pushHistory();
    clearMosaics();
  };

  return (
    <>
      <div className="editor-panel__section-title">马赛克</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text type="secondary">在图片上拖动框选要处理的区域。</Text>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            效果
          </Text>
          <Segmented
            block
            value={defaultStyle.mode}
            onChange={(v) =>
              onDefaultStyleChange({ mode: v as DefaultMosaicStyle['mode'] })
            }
            options={[
              { label: '马赛克', value: 'mosaic' },
              { label: '模糊', value: 'blur' },
            ]}
          />
        </div>

        <div>
          <Text type="secondary">
            {defaultStyle.mode === 'mosaic' ? '格子大小' : '模糊强度'}
          </Text>
          <Slider
            min={STRENGTH_MIN}
            max={STRENGTH_MAX}
            value={defaultStyle.strength}
            onChange={(v) => onDefaultStyleChange({ strength: v })}
          />
        </div>

        <Button
          block
          danger
          icon={<ClearOutlined />}
          disabled={mosaicCount === 0}
          onClick={handleClear}
        >
          清除全部{mosaicCount > 0 ? `（${mosaicCount}）` : ''}
        </Button>
      </Space>
    </>
  );
}

export default MosaicToolPanel;
