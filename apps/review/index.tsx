import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@reviewtrail/review-editor';
import { setDiagramRemoteLoads } from '@reviewtrail/ui/utils/diagramRemoteLoadsPolicy';
import { ReviewWorkerPoolProvider } from '@reviewtrail/review-editor/worker-pool';
import '@reviewtrail/review-editor/styles';
import '@reviewtrail/review-editor/tree-styles';

// A diagram in reviewed source may reference external images or styles.
setDiagramRemoteLoads(false);

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
