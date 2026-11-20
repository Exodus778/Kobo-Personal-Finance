import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import RecoveryBoundary from './components/RecoveryBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><RecoveryBoundary><App /></RecoveryBoundary></React.StrictMode>
);
