import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { checkHealth } from './lib/api';
import './App.css';
import { AuthProvider, useAuth } from 'react-oidc-context';

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Q0TsexXQo",
  client_id: "2379vvdglb5j8hopm9tcjr13a5",
  redirect_uri: "http://localhost:5173/",
  response_type: "code",
  scope: "email openid phone",
};

function HomePage() {

  const auth = useAuth();

  const signOutRedirect = () => {
    auth.stopSilentRenew();
    auth.removeUser();
    const clientId = "2379vvdglb5j8hopm9tcjr13a5";
    const logoutUri = "http://localhost:5173/";
    const cognitoDomain = "https://us-east-1q0tsexxqo.auth.us-east-1.amazoncognito.com";
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
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
    <AuthProvider {...cognitoAuthConfig}>
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
