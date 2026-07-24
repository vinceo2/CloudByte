import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { checkHealth } from './lib/api';
import './App.css';

function HomePage() {
  const [health, setHealth] = useState<string>('checking...');

  useEffect(() => {
    checkHealth()
      .then((data) => setHealth(`${data.status} (${data.service})`))
      .catch(() => setHealth('unreachable'));
  }, []);

  return (
    <div className="page">
      <h1>CloudByte</h1>
      <p>Your cloud storage, organized.</p>
      <p className="status">API: {health}</p>
      <nav>
        <Link to="/files">Browse files</Link>
      </nav>
    </div>
  );
}

function FilesPage() {
  return (
    <div className="page">
      <h1>Files</h1>
      <p>File browser coming in Phase 2.</p>
      <Link to="/">Back home</Link>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/files" element={<FilesPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
