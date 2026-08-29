import { useRef } from 'react';
import { App, Button, ColorPicker, Input, InputNumber, Slider, Space, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useImageEditorStore } from '../../store/imageEditorStore';
import type { TextAnnotation } from '../../store/imageEditorStore';

const { Text } = Typography;

/** 新建文字时的默认样式（不含 content）。 */
export interface DefaultTextStyle {
  fontSize: number;
  color: string;
}

interface TextToolPanelProps {
  /** 当前选中的文字对象，未选中为 null。 */
  selected: TextAnnotation | null;
  /** 新建文字的默认样式。 */
  defaultStyle: DefaultTextStyle;
  /** 修改默认样式（未选中对象时生效）。 */
  onDefaultStyleChange: (patch: Partial<DefaultTextStyle>) => void;
  /** 更新选中对象的属性。 */
  onUpdateSelected: (patch: Partial<TextAnnotation>) => void;
  /** 删除选中对象。 */
  onDeleteSelected: () => void;
}

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

/**
 * 文字工具的右侧属性面板。选中对象时编辑该对象，
 * 未选中时编辑新建文字的默认样式。
 */
function TextToolPanel({
  selected,
  defaultStyle,
  onDefaultStyleChange,
  onUpdateSelected,
  onDeleteSelected,
}: TextToolPanelProps) {
  const { message } = App.useApp();
  const pushHistory = useImageEditorStore((s) => s.pushHistory);

  // 当前面板取值来源：选中对象 或 默认样式
  const fontSize = selected ? selected.fontSize : defaultStyle.fontSize;
  const color = selected ? selected.color : defaultStyle.color;

  // 一次手势（拖动滑块/连续输入）只记一次历史：首次修改时 push（记录旧值），手势结束后复位
  const fontSizeDirtyRef = useRef(false);
  const colorDirtyRef = useRef(false);
  const contentDirtyRef = useRef(false);

  const setFontSize = (value: number | null) => {
    if (value == null) return;
    if (selected) {
      if (!fontSizeDirtyRef.current) {
        pushHistory(); // 记录修改前的字号
        fontSizeDirtyRef.current = true;
      }
      onUpdateSelected({ fontSize: value });
    } else {
      onDefaultStyleChange({ fontSize: value });
    }
  };
  // 滑块拖动结束 / 输入框失焦视为一次手势结束
  const settleFontSize = () => {
    fontSizeDirtyRef.current = false;
  };

  const setColor = (hex: string) => {
    if (selected) {
      if (!colorDirtyRef.current) {
        pushHistory(); // 记录修改前的颜色
        colorDirtyRef.current = true;
      }
      onUpdateSelected({ color: hex });
    } else {
      onDefaultStyleChange({ color: hex });
    }
  };
  const settleColor = () => {
    colorDirtyRef.current = false;
  };

  // 内容输入：一次聚焦会话内的连续输入合并为一条历史
  const handleContentChange = (value: string) => {
    if (!selected) return;
    if (!contentDirtyRef.current) {
      pushHistory(); // 记录输入前的内容
      contentDirtyRef.current = true;
    }
    onUpdateSelected({ content: value });
  };

  return (
    <>
      <div className="editor-panel__section-title">文字</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {selected ? (
          <div>
            <Text type="secondary">内容</Text>
            <Input.TextArea
              value={selected.content}
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder="输入文字内容"
              onChange={(e) => handleContentChange(e.target.value)}
              onBlur={() => {
                contentDirtyRef.current = false;
              }}
            />
          </div>
        ) : (
          <Text type="secondary">
            未选中文字。选择“文字”工具后点击画布即可添加，此处设置为新建文字的默认样式。
          </Text>
        )}

        <div>
          <Text type="secondary">字号</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Slider
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={fontSize}
              onChange={setFontSize}
              onChangeComplete={settleFontSize}
              style={{ flex: 1 }}
            />
            <InputNumber
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={fontSize}
              onChange={setFontSize}
              onBlur={settleFontSize}
              style={{ width: 72 }}
            />
          </div>
        </div>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            颜色
          </Text>
          <ColorPicker
            value={color}
            onChange={(c) => setColor(c.toHexString())}
            onChangeComplete={settleColor}
            showText
          />
        </div>

        {selected && (
          <Button
            danger
            block
            icon={<DeleteOutlined />}
            onClick={() => {
              pushHistory(); // 记录删除前的状态，使删除可撤销
              onDeleteSelected();
              message.success('已删除文字');
            }}
          >
            删除文字
          </Button>
        )}
      </Space>
    </>
  );
}

export default TextToolPanel;
