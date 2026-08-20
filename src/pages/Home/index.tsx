import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card } from 'antd';
import { PictureOutlined, VideoCameraOutlined, ScanOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

interface EntryItem {
  key: string;
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  /** 是否在首页展示该入口。推广时把不想露出的功能设为 false 即可隐藏。 */
  enabled: boolean;
}

const entries: EntryItem[] = [
  {
    key: 'image',
    title: '图片编辑',
    description: '裁剪、滤镜、标注等图片处理功能',
    path: '/image-editor',
    icon: <PictureOutlined />,
    color: '#1890ff',
    enabled: true,
  },
  {
    key: 'video',
    title: '视频剪辑',
    description: '剪切、拼接、字幕等视频编辑功能',
    path: '/video-editor',
    icon: <VideoCameraOutlined />,
    color: '#722ed1',
    enabled: true,
  },
  {
    key: 'ocr',
    title: '文字识别',
    description: '从图片中扫描并提取文字(OCR)',
    path: '/ocr',
    icon: <ScanOutlined />,
    color: '#722ed1',
    enabled: true,
  },
];

function Home() {
  const navigate = useNavigate();

  return (
    <div className="page-container">
      <Title level={2}>欢迎使用 Electron React 应用</Title>
      <Paragraph type="secondary">请选择一个功能开始</Paragraph>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        {entries
          .filter((entry) => entry.enabled)
          .map((entry) => (
          <Col key={entry.key} xs={24} sm={12} lg={10} xl={8}>
            <Card
              hoverable
              onClick={() => navigate(entry.path)}
              style={{ textAlign: 'center' }}
              styles={{ body: { padding: '40px 24px' } }}
            >
              <div style={{ fontSize: 56, color: entry.color, marginBottom: 16 }}>
                {entry.icon}
              </div>
              <Title level={3} style={{ marginBottom: 8 }}>
                {entry.title}
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {entry.description}
              </Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default Home;
