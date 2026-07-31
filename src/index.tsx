import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import { HashRouter } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/index.less';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

const root = ReactDOM.createRoot(container);
root.render(
  <StrictMode>
    <HashRouter>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#177ddc',
            colorBgBase: '#1e1e1e',
            borderRadius: 4,
          },
        }}
      >
        <AntdApp>
          <App />
        </AntdApp>
      </ConfigProvider>
    </HashRouter>
  </StrictMode>
);
