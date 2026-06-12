/** Root component. Wires React Router; each route lives in `src/routes/`. */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { Entry } from './routes/Entry';
import { GameLayout } from './routes/GameLayout';
import { MyPicks } from './routes/MyPicks';
import { Groups } from './routes/Groups';
import { Knockouts } from './routes/Knockouts';
import { MatchDetail } from './routes/MatchDetail';
import { Leaderboard } from './routes/Leaderboard';
import { Connect } from './routes/Connect';
import { Admin } from './routes/Admin';

export function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <Routes>
                    <Route path="/" element={<Entry />} />
                    <Route path="/game/:gameId" element={<GameLayout />}>
                        <Route index element={<MyPicks />} />
                        <Route path="groups" element={<Groups />} />
                        <Route path="knockouts" element={<Knockouts />} />
                        <Route path="leaderboard" element={<Leaderboard />} />
                        <Route path="connect" element={<Connect />} />
                        <Route path="match/:matchId" element={<MatchDetail />} />
                    </Route>
                    <Route path="/admin/*" element={<Admin />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </ToastProvider>
        </BrowserRouter>
    );
}
