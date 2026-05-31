import { Route } from './router.js';
import Layout from './components/Layout.js';
import Overview from './components/Overview.js';
import ProjectDetail from './components/ProjectDetail.js';
import SearchExplorer from './components/SearchExplorer.js';
import ObservationDetail from './components/ObservationDetail.js';
import TopicKeyBrowser from './components/TopicKeyBrowser.js';
import GraphLiteView from './components/GraphLiteView.js';
import MapWorkspace from './components/map/MapWorkspace.js';

export default function App() {
  return (
    <Layout>
      <Route path="/" component={MapWorkspace} />
      <Route path="/overview" component={Overview} />
      <Route path="/projects/:project" component={ProjectDetail} />
      <Route path="/search" component={SearchExplorer} />
      <Route path="/memory/:id" component={ObservationDetail} />
      <Route path="/topic-keys" component={TopicKeyBrowser} />
      <Route path="/graph" component={GraphLiteView} />
    </Layout>
  );
}
