import React from 'react';
import ReactDOM from 'react-dom/client';
import cssText from '@/index.css?inline';
const st=document.createElement('style');
st.textContent=cssText;
document.head.appendChild(st);
import '../settings-bridge.js';
import PopupApp from './PopupApp.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
