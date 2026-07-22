import React, { Suspense, lazy } from 'react';
import { ScadaProvider, useScada } from './context/ScadaContext';
import Header from './components/Header';
import ScenarioPanel from './components/ScenarioPanel';

const OverviewMap = lazy(() => import('./screens/OverviewMap'));
const HydraulicProfile = lazy(() => import('./screens/HydraulicProfile'));
const WaterBalance = lazy(() => import('./screens/WaterBalance'));
const AlarmsScreen = lazy(() => import('./screens/AlarmsScreen'));
const TrendsScreen = lazy(() => import('./screens/TrendsScreen'));
const EnergyScreen = lazy(() => import('./screens/EnergyScreen'));
const CybersecurityScreen = lazy(() => import('./screens/CybersecurityScreen'));
const ValveControl = lazy(() => import('./screens/ValveControl'));
const NetworkModel = lazy(() => import('./screens/NetworkModel'));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-blue-400 text-sm animate-pulse">Loading...</div>
    </div>
  );
}

function MainContent() {
  const { state } = useScada();

  return (
    <Suspense fallback={<LoadingSpinner />}>
      {state.activeScreen === 'overview' && <OverviewMap />}
      {state.activeScreen === 'hydraulic' && <HydraulicProfile />}
      {state.activeScreen === 'balance' && <WaterBalance />}
      {state.activeScreen === 'valves' && <ValveControl />}
      {state.activeScreen === 'network' && <NetworkModel />}
      {state.activeScreen === 'alarms' && <AlarmsScreen />}
      {state.activeScreen === 'trends' && <TrendsScreen />}
      {state.activeScreen === 'energy' && <EnergyScreen />}
      {state.activeScreen === 'security' && <CybersecurityScreen />}
    </Suspense>
  );
}

function AppShell() {
  return (
    <div className="flex flex-col h-full scada-bg">
      <Header />
      <div className="flex-1 overflow-hidden relative">
        <MainContent />
        <div className="absolute bottom-4 right-4 z-50">
          <ScenarioPanel />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScadaProvider>
      <AppShell />
    </ScadaProvider>
  );
}
