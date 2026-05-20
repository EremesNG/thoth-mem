import { Store } from '../store/index.js';

interface ProjectGraphOptions {
  topicKey?: string;
  relation?: string;
  limit?: number;
  maxChars?: number;
}

export function formatProjectSummary(store: Store, project: string, limit: number = 10): string {
  return [
    `## Project Summary: ${project}`,
    '',
    store.getContext({ project, limit }),
  ].join('\n');
}

export function formatProjectGraph(store: Store, project: string, options: ProjectGraphOptions = {}): string {
  const limit = options.limit ?? 100;
  const maxChars = options.maxChars ?? 6000;
  const facts = store
    .getObservationFacts({ project, topic_key: options.topicKey })
    .filter((fact) => !options.relation || fact.relation === options.relation);
  const limitedFacts = facts.slice(0, limit);
  const factLines = limitedFacts.map((fact) => `- ${fact.subject} -- ${fact.relation} --> ${fact.object}`);
  const filterParts = [
    options.topicKey ? `topic_key=${options.topicKey}` : null,
    options.relation ? `relation=${options.relation}` : null,
  ].filter((part): part is string => part !== null);

  const headerLines = [
    `## Graph Lite: ${project}`,
    '',
    filterParts.length > 0 ? `Filters: ${filterParts.join(', ')}` : null,
    `Showing ${limitedFacts.length} of ${facts.length} fact(s).`,
    '',
  ].filter((line): line is string => line !== null);

  if (facts.length === 0) {
    return [...headerLines, 'No graph-lite facts found.'].join('\n');
  }

  const omittedByLimit = facts.length - limitedFacts.length;
  const omittedLine = omittedByLimit > 0
    ? `Omitted ${omittedByLimit} fact(s). Narrow with relation, topic_key, or a lower limit.`
    : null;
  const fullLines = [
    ...headerLines,
    ...factLines,
    omittedLine,
  ].filter((line): line is string => line !== null);
  const fullText = fullLines.join('\n');

  if (fullText.length <= maxChars) {
    return fullText;
  }

  const truncationLine = 'Output truncated by max_chars. Narrow with relation, topic_key, or a lower limit.';
  const truncatedLines = [...headerLines];

  for (const line of factLines) {
    const candidate = [...truncatedLines, line, truncationLine].join('\n');

    if (candidate.length > maxChars) {
      break;
    }

    truncatedLines.push(line);
  }

  let truncatedText = [...truncatedLines, truncationLine].join('\n');

  if (truncatedText.length > maxChars) {
    truncatedText = truncatedText.slice(0, maxChars);
  }

  return truncatedText;
}

export function formatTopicKeyList(store: Store, project?: string): string {
  const topics = store.listTopicKeys(project);
  const lines = topics.map((topic) => [
    `- **${topic.topic_key}**`,
    `project=${topic.project ?? 'unknown'}`,
    `type=${topic.type}`,
    `observations=${topic.observation_count}`,
    `updated=${topic.updated_at}`,
    `latest="${topic.title}"`,
  ].join(' | '));

  return [
    project ? `## Topic Keys: ${project}` : '## Topic Keys',
    '',
    lines.length > 0 ? lines.join('\n') : 'No topic keys found.',
  ].join('\n');
}

export function formatTopicKeyContext(
  store: Store,
  project: string,
  topicKey: string,
  maxChars: number = 6000,
  limit: number = 10
): string {
  const context = store.searchObservationsFormatted({
    query: topicKey,
    project,
    topic_key_exact: topicKey,
    mode: 'context',
    max_chars: maxChars,
    limit,
  });

  return [
    `## Topic Key: ${topicKey}`,
    `Project: ${project}`,
    '',
    context,
  ].join('\n');
}
