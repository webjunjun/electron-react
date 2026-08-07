import { useState } from 'react';
import { Button, Segmented, Slider, Space, Typography } from 'antd';
import { ClearOutlined } from '@ant-design/icons';

const { Text } = Typography;

/** 马赛克效果类型。 */
export type MosaicMode = 'mosaic' | 'blur';

const STRENGTH_MIN = 5;
const STRENGTH_MAX = 50;

/** 马赛克工具的属性面板：效果类型 + 强度 + 清除。 */
function MosaicToolPanel() {
  // UI 阶段先用本地状态，后续接入 store
  const [mode, setMode] = useState<MosaicMode>('mosaic');
  const [strength, setStrength] = useState(15);

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
            value={mode}
            onChange={(v) => setMode(v as MosaicMode)}
            options={[
              { label: '马赛克', value: 'mosaic' },
              { label: '模糊', value: 'blur' },
            ]}
          />
        </div>

        <div>
          <Text type="secondary">
            {mode === 'mosaic' ? '格子大小' : '模糊强度'}
          </Text>
          <Slider
            min={STRENGTH_MIN}
            max={STRENGTH_MAX}
            value={strength}
            onChange={setStrength}
          />
        </div>

        <Button block danger icon={<ClearOutlined />}>
          清除全部
        </Button>
      </Space>
    </>
  );
}

export default MosaicToolPanel;
