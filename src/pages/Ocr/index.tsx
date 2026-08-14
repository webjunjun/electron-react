import { useNavigate } from 'react-router-dom';
import { Button, Space } from 'antd';
import {
  ArrowLeftOutlined,
  ScanOutlined,
  ImportOutlined,
  CopyOutlined,
  ExportOutlined,
} from '@ant-design/icons';

function Ocr() {
  const navigate = useNavigate();

  return (
    <div className="ocr-page">
      {/* 顶部工具条 */}
      <div className="ocr-toolbar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          返回
        </Button>
        <span className="ocr-toolbar__title">
          <ScanOutlined />
          文字识别
        </span>
        <div className="ocr-toolbar__spacer" />
        <Space>
          <Button icon={<ImportOutlined />}>导入</Button>
          <Button type="primary" icon={<ScanOutlined />} disabled>
            开始识别
          </Button>
          <Button icon={<CopyOutlined />} disabled>
            复制
          </Button>
          <Button icon={<ExportOutlined />} disabled>
            导出 TXT
          </Button>
        </Space>
      </div>

      {/* 双栏主体：左图右文 */}
      <div className="ocr-body">
        <div className="ocr-preview">
          <div className="ocr-preview__empty">
            <ScanOutlined style={{ fontSize: 48, marginBottom: 12 }} />
            <div>拖入图片或点击「导入」</div>
          </div>
        </div>

        <div className="ocr-result">
          <div className="ocr-result__title">识别结果</div>
          <textarea
            className="ocr-result__text"
            placeholder="识别结果将显示在这里，可手动修正…"
            readOnly
          />
        </div>
      </div>

      {/* 状态栏 */}
      <div className="ocr-status">
        <span className="ocr-status__item">未打开图片</span>
        <span className="ocr-status__item">状态：待识别</span>
        <span className="ocr-status__item">字符数：0</span>
      </div>
    </div>
  );
}

export default Ocr;
