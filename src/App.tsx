import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import ImageEditor from './pages/ImageEditor';
import VideoEditor from './pages/VideoEditor';

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/image-editor" element={<ImageEditor />} />
        <Route path="/video-editor" element={<VideoEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
