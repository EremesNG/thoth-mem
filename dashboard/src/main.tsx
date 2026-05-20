import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, Route } from './router.js';
import Layout from './components/Layout.js';
import Overview from './components/Overview.js';
import ProjectDetail from './components/ProjectDetail.js';
import SearchExplorer from './components/SearchExplorer.js';
import ObservationDetail from './components/ObservationDetail.js';
import TopicKeyBrowser from './components/TopicKeyBrowser.js';
import GraphLiteView from './components/GraphLiteView.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider>
      <Layout>
        <Route path="/" component={Overview} />
        <Route path="/projects/:project" component={ProjectDetail} />
        <Route path="/search" component={SearchExplorer} />
        <Route path="/memory/:id" component={ObservationDetail} />
        <Route path="/topic-keys" component={TopicKeyBrowser} />
        <Route path="/graph" component={GraphLiteView} />
      </Layout>
    </RouterProvider>
  </React.StrictMode>
);
