
Here is my main.tsx

import {createRoot} from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import { APIProvider } from '@vis.gl/react-google-maps';
import App from './App.tsx';
import './index.css';

// Client-Side Quota Defense for Google Maps Platform Demo Key
(window as any).gm_authFailure = () => {
window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
origError.apply(console, args);
const msg = args.map((a) => String(a)).join(' ');
if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
}
};

const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

createRoot(getElementByIdRoot()).render(
<APIProvider apiKey={googleMapsApiKey} libraries={['marker', 'geometry']}>
<App />
</APIProvider>
);

function getElementByIdRoot() {
return document.getElementById('root')!;
}
