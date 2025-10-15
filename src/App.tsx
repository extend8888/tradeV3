import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Wallets from './pages/Wallets';
import Trading from './pages/Trading';
import Volume from './pages/Volume';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Monitor from './pages/Monitor';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-white flex">
        {/* 导航侧边栏 */}
        <Navigation />

        {/* 主内容区域 */}
        <main className="flex-1 lg:ml-0">
          <div className="min-h-screen">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/wallets" element={<Wallets />} />
              <Route path="/trading" element={<Trading />} />
              <Route path="/volume" element={<Volume />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/monitor" element={<Monitor />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
