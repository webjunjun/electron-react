import { Button, Select, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useImageEditorStore } from '../../store/imageEditorStore';

const { Text } = Typography;

/** 比例预设。value 为字符串键，free=自由，orig=原图比例，其余为 w:h。 */
const RATIO_OPTIONS = [
  { label: '自定义', value: 'free' },
  { label: '原图', value: 'orig' },
  { label: '正方形', value: '1:1' },
  { label: '宽屏 - 16:9', value: '16:9' },
  { label: '3:2', value: '3:2' },
  { label: '4:3', value: '4:3' },
  { label: '7:5', value: '7:5' },
  { label: '10:8', value: '10:8' },
];

/** 裁剪工具的属性面板：比例预设 + 尺寸显示 + 重置画框。 */
function CropToolPanel() {
  const frame = useImageEditorStore((s) => s.frame);
  const cropRatio = useImageEditorStore((s) => s.cropRatio);
  const imageSize = useImageEditorStore((s) => s.imageSize);
  const setCropRatio = useImageEditorStore((s) => s.setCropRatio);
  const resetFrame = useImageEditorStore((s) => s.resetFrame);
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  // 由当前 cropRatio 反推选中的预设键
  const currentValue = (() => {
    if (cropRatio === null) return 'free';
    if (imageSize && Math.abs(cropRatio - imageSize.width / imageSize.height) < 1e-3) {
      return 'orig';
    }
    if (Math.abs(cropRatio - 1) < 1e-3) return '1:1';
    if (Math.abs(cropRatio - 4 / 3) < 1e-3) return '4:3';
    if (Math.abs(cropRatio - 16 / 9) < 1e-3) return '16:9';
    if (Math.abs(cropRatio - 3 / 2) < 1e-3) return '3:2';
    if (Math.abs(cropRatio - 7 / 5) < 1e-3) return '7:5';
    if (Math.abs(cropRatio - 10 / 8) < 1e-3) return '10:8';
    return 'free';
  })();

  const handleRatioChange = (value: string) => {
    if (value === currentValue) return; // 未变化不记录历史
    pushHistory();
    switch (value) {
      case 'free':
        setCropRatio(null);
        break;
      case '1:1':
        setCropRatio(1);
        break;
      case '4:3':
        setCropRatio(4 / 3);
        break;
      case '16:9':
        setCropRatio(16 / 9);
        break;
      case '3:2':
        setCropRatio(3 / 2);
        break;
      case '7:5':
        setCropRatio(7 / 5);
        break;
      case '10:8':
        setCropRatio(10 / 8);
        break;
      case 'orig':
        if (imageSize) setCropRatio(imageSize.width / imageSize.height);
        break;
    }
  };

  const disabled = !imageSize || !frame;

  return (
    <>
      <div className="editor-panel__section-title">裁剪</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text type="secondary">拖动画框边角调整输出范围，框外区域将被裁掉。</Text>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            纵横比
          </Text>
          <Select
            style={{ width: '100%' }}
            disabled={disabled}
            value={currentValue}
            onChange={handleRatioChange}
          >
            {RATIO_OPTIONS.map((item) => (
              <Select.Option key={item.value} value={item.value}>
                {item.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            输出尺寸
          </Text>
          <Text>
            {frame
              ? `${Math.round(frame.width)} × ${Math.round(frame.height)} px`
              : '—'}
          </Text>
        </div>

        <Button
          block
          icon={<ReloadOutlined />}
          disabled={disabled}
          onClick={() => {
            pushHistory();
            resetFrame();
          }}
        >
          重置画框
        </Button>
      </Space>
    </>
  );
}

export default CropToolPanel;
