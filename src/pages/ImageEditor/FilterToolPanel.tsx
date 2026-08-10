import { Typography } from 'antd';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { FILTER_PRESETS } from '../../components/ImageCanvas/filterPresets';
import filter_sample from '../../assets/filter_sample.png';

const { Text } = Typography;

/** 缩览图使用的示意图片。 */
const SAMPLE_IMG = filter_sample;

/** 滤镜工具的属性面板：预设滤镜单选。 */
function FilterToolPanel() {
  const filterId = useImageEditorStore((s) => s.filterId);
  const setFilter = useImageEditorStore((s) => s.setFilter);
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  // 当前选中：filterId 为 null 时视为「原图」(id: none)
  const activeId = filterId ?? 'none';

  const handleSelect = (id: string) => {
    const next = id === 'none' ? null : id;
    if (next === filterId) return; // 点击当前已选中的，不产生历史
    pushHistory();
    // 选「原图」存 null，其余存对应 id
    setFilter(next);
  };

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
            onClick={() => handleSelect(preset.id)}
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
