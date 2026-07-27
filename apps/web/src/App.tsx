import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { checkHealth } from './lib/api';
import './App.css';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { authProviderConfig, cognitoConfig } from './config/cognito';

function HomePage() {

  const auth = useAuth();

  const signOutRedirect = () => {
    auth.stopSilentRenew();
    auth.removeUser();
    window.location.href = `${cognitoConfig.domain}/logout?client_id=${cognitoConfig.clientId}&logout_uri=${encodeURIComponent(cognitoConfig.redirectUri)}`;
  };

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

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
      {auth.isAuthenticated ? <p>Signed in as {auth.user?.profile?.email}</p> : <p>Not signed in</p>}
      <p className="status">API: {health}</p>
      <nav>
        <Link to="/files">Browse files</Link>
      </nav>
      <div>
      <button onClick={() => auth.signinRedirect()}>Sign in</button>
      <button onClick={() => signOutRedirect()}>Sign out</button>
    </div>
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
    <AuthProvider {...authProviderConfig}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/files" element={<FilesPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
