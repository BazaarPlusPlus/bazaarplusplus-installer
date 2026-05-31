import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import GlobalShell from './layouts/GlobalShell';
import Install from './pages/Install';
import Stream from './pages/Stream';
import History from './pages/History';
import RunDetail from './pages/RunDetail';
import About from './pages/About';

export default function App() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<GlobalShell />}>
          <Route path="/" element={<Install />} />
          <Route path="/stream" element={<Stream />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:runId" element={<RunDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
