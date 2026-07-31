import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tooltip } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

export interface RailTool {
  key: string;
  label: string;
  icon: ReactNode;
}

interface EditorShellProps {
  /** Icon + name shown in the toolbar. */
  icon: ReactNode;
  title: string;
  /** Left tool rail items. */
  tools: RailTool[];
  activeTool: string;
  onToolChange: (key: string) => void;
  /** Toolbar actions rendered on the right side. */
  toolbarExtra?: ReactNode;
  /** Right-hand properties panel content. */
  panel: ReactNode;
  /** Center canvas content. */
  children: ReactNode;
  /** Status-bar items rendered on the left. */
  status?: ReactNode;
  /**
   * Optional full-width bottom region (e.g. a video timeline). When provided
   * it renders below the canvas row and above the status bar.
   */
  timeline?: ReactNode;
}

/**
 * Desktop-style editor shell: top toolbar, left tool rail, center canvas,
 * right properties panel, bottom status bar.
 */
function EditorShell({
  icon,
  title,
  tools,
  activeTool,
  onToolChange,
  toolbarExtra,
  panel,
  children,
  status,
  timeline,
}: EditorShellProps) {
  const navigate = useNavigate();

  return (
    <div className={'editor-page' + (timeline ? ' has-timeline' : '')}>
      <div className="editor-toolbar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          返回
        </Button>
        <span className="editor-toolbar__title">
          {icon}
          {title}
        </span>
        <div className="editor-toolbar__spacer" />
        {toolbarExtra}
      </div>

      <div className="editor-rail">
        {tools.map((tool) => (
          <Tooltip key={tool.key} title={tool.label} placement="right">
            <div
              className={
                'editor-rail__tool' + (tool.key === activeTool ? ' is-active' : '')
              }
              onClick={() => onToolChange(tool.key)}
            >
              {tool.icon}
            </div>
          </Tooltip>
        ))}
      </div>

      <div className="editor-canvas">{children}</div>

      <div className="editor-panel">{panel}</div>

      {timeline && <div className="editor-timeline">{timeline}</div>}

      <div className="editor-status">{status}</div>
    </div>
  );
}

export default EditorShell;
