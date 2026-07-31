import { useState } from 'react';
import { Button, Slider, Space, Typography } from 'antd';
import {
  VideoCameraOutlined,
  DragOutlined,
  ScissorOutlined,
  FontSizeOutlined,
  SoundOutlined,
  AppstoreOutlined,
  ExportOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import EditorShell, { RailTool } from '../../components/EditorShell';

const { Text } = Typography;

const tools: RailTool[] = [
  { key: 'select', label: '选择', icon: <DragOutlined /> },
  { key: 'split', label: '分割', icon: <ScissorOutlined /> },
  { key: 'text', label: '字幕', icon: <FontSizeOutlined /> },
  { key: 'audio', label: '音频', icon: <SoundOutlined /> },
  { key: 'transition', label: '转场', icon: <AppstoreOutlined /> },
];

const ticks = ['00:00', '00:05', '00:10', '00:15', '00:20', '00:25'];

function VideoEditor() {
  const [activeTool, setActiveTool] = useState('select');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(80);

  const toolbarExtra = (
    <Space>
      <Button type="text" icon={<StepBackwardOutlined />} />
      <Button
        type="text"
        icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
        onClick={() => setPlaying((p) => !p)}
      />
      <Button type="text" icon={<StepForwardOutlined />} />
      <Button type="primary" icon={<ExportOutlined />}>
        导出
      </Button>
    </Space>
  );

  const panel = (
    <>
      <div className="editor-panel__section-title">属性</div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text type="secondary">音量</Text>
          <Slider min={0} max={100} value={volume} onChange={setVolume} />
        </div>
        <div>
          <Text type="secondary">播放进度</Text>
          <Slider min={0} max={100} value={progress} onChange={setProgress} />
        </div>
      </Space>
    </>
  );

  const timeline = (
    <>
      <div className="editor-timeline__ruler">
        {ticks.map((t) => (
          <div key={t} className="editor-timeline__tick">
            {t}
          </div>
        ))}
      </div>
      <div className="editor-timeline__tracks">
        <div className="editor-timeline__track">
          <span className="editor-timeline__track-label">视频</span>
          <div className="editor-timeline__clip" style={{ width: '45%' }}>
            片段 1
          </div>
          <div className="editor-timeline__clip" style={{ width: '25%' }}>
            片段 2
          </div>
        </div>
        <div className="editor-timeline__track">
          <span className="editor-timeline__track-label">音频</span>
          <div
            className="editor-timeline__clip editor-timeline__clip--audio"
            style={{ width: '60%' }}
          >
            背景音乐
          </div>
        </div>
      </div>
    </>
  );

  const status = (
    <>
      <span className="editor-status__item">工具：{activeTool}</span>
      <span className="editor-status__item">{playing ? '播放中' : '已暂停'}</span>
      <span className="editor-status__item">时长：00:30</span>
    </>
  );

  return (
    <EditorShell
      icon={<VideoCameraOutlined />}
      title="视频剪辑"
      tools={tools}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      toolbarExtra={toolbarExtra}
      panel={panel}
      status={status}
      timeline={timeline}
    >
      <div className="editor-canvas__placeholder">
        <VideoCameraOutlined style={{ fontSize: 48, marginBottom: 12 }} />
        <div>导入视频素材开始剪辑</div>
      </div>
    </EditorShell>
  );
}

export default VideoEditor;
