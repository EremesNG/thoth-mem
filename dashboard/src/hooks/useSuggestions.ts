import { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export function useSuggestions(project?: string) {
  const [projects, setProjects] = useState<string[]>([]);
  const [topicKeys, setTopicKeys] = useState<string[]>([]);

  // Fetch projects from stats
  useEffect(() => {
    let active = true;
    api.getStats()
      .then((stats) => {
        if (active && stats.projects) {
          setProjects(stats.projects);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch project suggestions', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch topic keys for the selected project
  useEffect(() => {
    if (!project || !project.trim()) {
      setTopicKeys([]);
      return;
    }

    let active = true;
    api.getProjectTopicKeys(project)
      .then((res) => {
        if (active && res.topics) {
          const keys = res.topics.map((t) => t.topic_key);
          setTopicKeys(keys);
        }
      })
      .catch((err) => {
        console.error(`Failed to fetch topic key suggestions for project ${project}`, err);
      });

    return () => {
      active = false;
    };
  }, [project]);

  return { projects, topicKeys };
}
