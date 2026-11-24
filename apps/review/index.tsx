import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@reviewtrail/review-editor';
import { ReviewWorkerPoolProvider } from '@reviewtrail/review-editor/worker-pool';
import '@reviewtrail/review-editor/styles';
import '@reviewtrail/review-editor/tree-styles';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* Worker-pool syntax highlighting — tokenization off the main thread
        (diffshub parity). Pierre's CodeView/FileDiff pick the pool up from
        context automatically. */}
    <ReviewWorkerPoolProvider>
      <App />
    </ReviewWorkerPoolProvider>
  </React.StrictMode>
);
