import { useState } from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

/** 滤镜预设定义。preview 为面板缩览图的 CSS 滤镜，仅用于 UI 预览示意。 */
interface FilterPreset {
  id: string;
  name: string;
  /** 缩览图预览用的 CSS filter；'none' 表示原图。 */
  preview: string;
}

/** 第一期滤镜预设（一键套用，单选）。 */
export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: '原图', preview: 'none' },
  { id: 'grayscale', name: '黑白', preview: 'grayscale(1)' },
  { id: 'sepia', name: '复古', preview: 'sepia(0.8)' },
  { id: 'cool', name: '冷色', preview: 'hue-rotate(180deg) saturate(1.2)' },
  { id: 'warm', name: '暖色', preview: 'sepia(0.4) saturate(1.6) hue-rotate(-15deg)' },
  { id: 'contrast', name: '高对比', preview: 'contrast(1.5)' },
];

/** 缩览图使用的示意图片。 */
const SAMPLE_IMG =
  'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=colorful%20landscape%20mountain%20sunset%20vivid%20photography&image_size=square';

/** 滤镜工具的属性面板：预设滤镜单选。 */
function FilterToolPanel() {
  // UI 阶段先用本地状态，后续接入 store
  const [activeId, setActiveId] = useState('none');

  return (
    <>
      <div className="editor-panel__section-title">滤镜</div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        点击预设即可一键套用，同一时刻仅生效一个。
      </Text>
      <div className="filter-grid">
        {FILTER_PRESETS.map((preset) => (
          <div
            key={preset.id}
            className={
              'filter-grid__item' + (preset.id === activeId ? ' is-active' : '')
            }
            onClick={() => setActiveId(preset.id)}
          >
            <div
              className="filter-grid__swatch"
              style={{
                backgroundImage: `url(${SAMPLE_IMG})`,
                filter: preset.preview,
              }}
            />
            <span className="filter-grid__name">{preset.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default FilterToolPanel;
