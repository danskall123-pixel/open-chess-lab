import { useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router';
import { Layout } from './components/Layout';
import { useSession } from './state/session';
import { AnalysisPage } from './pages/AnalysisPage';
import { EnginePage } from './pages/EnginePage';
import { FriendPage } from './pages/FriendPage';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { HotSeatPage } from './pages/HotSeatPage';
import { ImportPage } from './pages/ImportPage';
import { InvitePage } from './pages/InvitePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ModerationPage } from './pages/ModerationPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewPage } from './pages/ReviewPage';

function GameStartRedirect() {
  const { socket } = useSession();
  const navigate = useNavigate();
  useEffect(
    () =>
      socket.subscribe((message) => {
        if (message.t === 'game.started') void navigate(`/game/${message.gameId}`);
      }),
    [socket, navigate],
  );
  return null;
}

export function App() {
  return (
    <Layout>
      <GameStartRedirect />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:id" element={<GamePage />} />
        <Route path="/invite/:id" element={<InvitePage />} />
        <Route path="/play/computer" element={<EnginePage />} />
        <Route path="/play/friend" element={<FriendPage />} />
        <Route path="/play/local" element={<HotSeatPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/@/:username" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/mod" element={<ModerationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
