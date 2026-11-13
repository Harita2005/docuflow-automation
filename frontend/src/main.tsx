import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';

const originalFetch = window.fetch;
const inflightGetRequests = new Map<string, Promise<Response>>();

async function executeFetch(url: RequestInfo | URL, options: any, retryCount = 1): Promise<Response> {
  try {
    const res = await originalFetch.call(window, url, options);
    // If backend proxy returned 503 (server restarting), retry once after brief backoff
    if (res.status === 503 && retryCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 600));
      return executeFetch(url, options, retryCount - 1);
    }
    return res;
  } catch (err) {
    if (retryCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 600));
      return executeFetch(url, options, retryCount - 1);
    }
    throw err;
  }
}

window.fetch = async (url: RequestInfo | URL, options: any = {}) => {
  const token = localStorage.getItem("authToken");
  if (token && typeof url === 'string' && !url.includes('/api/auth/login')) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  const method = (options?.method || 'GET').toUpperCase();
  // Deduplicate concurrent in-flight GET requests within the browser
  if (method === 'GET' && typeof url === 'string' && !url.includes('/stream')) {
    const authHeader = options?.headers?.Authorization || (token ? `Bearer ${token}` : '');
    const cacheKey = `${url}::${authHeader}`;
    const existingPromise = inflightGetRequests.get(cacheKey);
    if (existingPromise) {
      const res = await existingPromise;
      return res.clone();
    }
    const fetchPromise = executeFetch(url, options).then(res => {
      // Evict after 300ms so subsequent genuine user actions always fetch fresh data
      setTimeout(() => inflightGetRequests.delete(cacheKey), 300);
      return res;
    }).catch(err => {
      inflightGetRequests.delete(cacheKey);
      throw err;
    });
    inflightGetRequests.set(cacheKey, fetchPromise);
    const res = await fetchPromise;
    return res.clone();
  }

  return executeFetch(url, options);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
