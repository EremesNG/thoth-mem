import { OBSERVATION_TYPES } from './store/types.js';
import { VERSION } from './version.js';

const OBSERVATION_TYPE_SCHEMA = {
  type: 'string',
  enum: [...OBSERVATION_TYPES],
};

const OBSERVATION_SCOPE_SCHEMA = {
  type: 'string',
  enum: ['project', 'personal'],
};

const GRAPH_RELATION_SCHEMA = {
  type: 'string',
  enum: ['HAS_TYPE', 'IN_PROJECT', 'HAS_TOPIC_KEY', 'HAS_WHAT', 'HAS_WHY', 'HAS_WHERE', 'HAS_LEARNED'],
};

export function getOpenApiSpec(port: number): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: {
      title: 'thoth-mem HTTP API',
      version: VERSION,
      description: 'Structured REST API for thoth-mem sessions, observations, prompts, and sync utilities.',
    },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string', example: 'ok' } },
                    required: ['status'],
                  },
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          summary: 'OpenAPI spec',
          responses: {
            '200': {
              description: 'OpenAPI document',
            },
          },
        },
      },
      '/docs': {
        get: {
          summary: 'Swagger UI docs',
          responses: {
            '200': {
              description: 'Swagger UI HTML page',
              content: {
                'text/html': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
      '/observations': {
        post: {
          summary: 'Create observation',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateObservationRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Observation created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ObservationMutationResult' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
        '/observations/search': {
          get: {
            summary: 'Search observations',
            parameters: [
              { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
              { name: 'type', in: 'query', schema: OBSERVATION_TYPE_SCHEMA },
              { name: 'project', in: 'query', schema: { type: 'string' } },
              { name: 'session_id', in: 'query', schema: { type: 'string' } },
              { name: 'scope', in: 'query', schema: OBSERVATION_SCOPE_SCHEMA },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
              { name: 'mode', in: 'query', schema: { type: 'string', enum: ['compact', 'preview'], default: 'compact' } },
              { name: 'topic_key_exact', in: 'query', schema: { type: 'string' } },
            ],
           responses: {
             '200': {
               description: 'Search results',
               content: {
                 'application/json': {
                   schema: {
                     oneOf: [
                       { $ref: '#/components/schemas/CompactSearchResponse' },
                       { $ref: '#/components/schemas/PreviewSearchResponse' },
                     ],
                   },
                 },
               },
             },
             '400': { $ref: '#/components/responses/Error' },
           },
         },
       },
      '/observations/{id}': {
        get: {
          summary: 'Get observation by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
            { name: 'max_length', in: 'query', schema: { type: 'integer', minimum: 100 } },
          ],
          responses: {
            '200': {
              description: 'Observation record',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/Observation' },
                      { $ref: '#/components/schemas/PaginatedObservation' },
                    ],
                  },
                },
              },
            },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
        patch: {
          summary: 'Update observation',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateObservationRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Observation updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      revision: { type: 'integer' },
                    },
                    required: ['id', 'revision'],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Delete observation',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
            { name: 'hard_delete', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            '200': {
              description: 'Observation deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      deleted: { type: 'string', enum: ['soft', 'hard'] },
                    },
                    required: ['id', 'deleted'],
                  },
                },
              },
            },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sessions': {
        post: {
          summary: 'Start session',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    project: { type: 'string' },
                    directory: { type: 'string' },
                  },
                  required: ['id', 'project'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Session started',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      session_id: { type: 'string' },
                      project: { type: 'string' },
                    },
                    required: ['session_id', 'project'],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sessions/summary': {
        post: {
          summary: 'Save session summary and close session',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    project: { type: 'string' },
                    session_id: { type: 'string' },
                  },
                  required: ['content', 'project'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Session summary saved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      observation_id: { type: 'integer' },
                      session_id: { type: 'string' },
                    },
                    required: ['observation_id', 'session_id'],
                  },
                },
              },
            },
          },
        },
      },
      '/context': {
        get: {
          summary: 'Get structured context',
          parameters: [
            { name: 'project', in: 'query', schema: { type: 'string' } },
            { name: 'session_id', in: 'query', schema: { type: 'string' } },
            { name: 'scope', in: 'query', schema: OBSERVATION_SCOPE_SCHEMA },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            '200': {
              description: 'Structured context payload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContextResponse' },
                },
              },
            },
          },
        },
      },
      '/timeline': {
        get: {
          summary: 'Get observation timeline neighborhood',
          parameters: [
            { name: 'observation_id', in: 'query', required: true, schema: { type: 'integer', minimum: 1 } },
            { name: 'before', in: 'query', schema: { type: 'integer', minimum: 0 } },
            { name: 'after', in: 'query', schema: { type: 'integer', minimum: 0 } },
          ],
          responses: {
            '200': {
              description: 'Timeline neighborhood',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TimelineResponse' },
                },
              },
            },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/stats': {
        get: {
          summary: 'Get memory statistics',
          responses: {
            '200': {
              description: 'Aggregate stats',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Stats' },
                },
              },
            },
          },
        },
      },
      '/viz/slice': {
        get: {
          summary: 'Get visualization slice',
          parameters: [
            { name: 'project', in: 'query', schema: { type: 'string' } },
            { name: 'session_id', in: 'query', schema: { type: 'string' } },
            { name: 'topic_key', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: OBSERVATION_TYPE_SCHEMA },
            { name: 'observation_type', in: 'query', schema: OBSERVATION_TYPE_SCHEMA },
            { name: 'relation', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'depth', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 3 } },
            { name: 'max_nodes', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1200, default: 300 } },
            { name: 'max_edges', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 3600, default: 900 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Visualization slice', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizSliceResponse' } } } } },
        },
      },
      '/viz/expand': {
        post: {
          summary: 'Expand visualization node neighborhood (read-only)',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VizExpandRequest' } } } },
          responses: { '200': { description: 'Expanded slice', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizSliceResponse' } } } } },
        },
      },
      '/viz/inspect/node/{id}': {
        get: {
          summary: 'Inspect visualization node',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'project', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Node details', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizInspectNodeResponse' } } } } },
        },
      },
      '/viz/inspect/edge/{id}': {
        get: {
          summary: 'Inspect visualization edge',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'project', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Edge details', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizInspectEdgeResponse' } } } } },
        },
      },
      '/viz/filters': {
        get: {
          summary: 'Get visualization filters',
          parameters: [{ name: 'project', in: 'query', schema: { type: 'string' } }, { name: 'session_id', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Filter metadata', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizFiltersResponse' } } } } },
        },
      },
      '/viz/health': {
        get: {
          summary: 'Get visualization semantic health',
          parameters: [{ name: 'project', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Semantic health', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizHealthResponse' } } } } },
        },
      },
      '/projects/{project}/summary': {
        get: {
          summary: 'Get project summary',
          parameters: [
            { name: 'project', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20 } },
          ],
          responses: {
            '200': {
              description: 'Project summary markdown payload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProjectTextResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/projects/{project}/graph': {
        get: {
          summary: 'Get project graph-lite facts',
          parameters: [
            { name: 'project', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'topic_key', in: 'query', schema: { type: 'string' } },
            { name: 'relation', in: 'query', schema: GRAPH_RELATION_SCHEMA },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
            { name: 'max_chars', in: 'query', schema: { type: 'integer', minimum: 200, maximum: 20000, default: 6000 } },
          ],
          responses: {
            '200': {
              description: 'Project graph-lite structured facts and compatible markdown payload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProjectGraphResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/projects/{project}/topic-keys': {
        get: {
          summary: 'List project topic keys or read exact topic-key context',
          parameters: [
            { name: 'project', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'topic_key', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } },
            { name: 'max_chars', in: 'query', schema: { type: 'integer', minimum: 200, maximum: 20000, default: 6000 } },
          ],
          responses: {
            '200': {
              description: 'Topic-key listing or exact topic-key context',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/TopicKeysResponse' },
                      { $ref: '#/components/schemas/TopicKeyContextResponse' },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/prompts': {
        post: {
          summary: 'Save user prompt',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    session_id: { type: 'string' },
                    project: { type: 'string' },
                  },
                  required: ['content'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Prompt saved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { type: 'integer' } },
                    required: ['id'],
                  },
                },
              },
            },
          },
        },
      },
      '/suggest-topic-key': {
        post: {
          summary: 'Suggest topic key',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string' },
                    content: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Suggested topic key',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { topic_key: { type: 'string' } },
                    required: ['topic_key'],
                  },
                },
              },
            },
          },
        },
      },
      '/capture-passive': {
        post: {
          summary: 'Capture passive learnings',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    session_id: { type: 'string' },
                    project: { type: 'string' },
                    source: { type: 'string' },
                  },
                  required: ['content'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Passive capture result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      extracted: { type: 'integer' },
                      saved: { type: 'integer' },
                      duplicates: { type: 'integer' },
                    },
                    required: ['extracted', 'saved', 'duplicates'],
                  },
                },
              },
            },
          },
        },
      },
      '/export': {
        get: {
          summary: 'Export memory data',
          parameters: [{ name: 'project', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Export data payload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ExportData' },
                },
              },
            },
          },
        },
      },
      '/import': {
        post: {
          summary: 'Import memory data',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'string' },
                  },
                  required: ['data'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Import result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      imported: {
                        type: 'object',
                        properties: {
                          sessions: { type: 'integer' },
                          observations: { type: 'integer' },
                          prompts: { type: 'integer' },
                        },
                        required: ['sessions', 'observations', 'prompts'],
                      },
                      skipped: {
                        type: 'object',
                        properties: { total: { type: 'integer' } },
                        required: ['total'],
                      },
                    },
                    required: ['imported', 'skipped'],
                  },
                },
              },
            },
          },
        },
      },
       '/sync/export': {
         post: {
           summary: 'Export sync chunk',
           requestBody: {
             required: true,
             content: {
               'application/json': {
                 schema: {
                   type: 'object',
                   properties: {
                     sync_dir: { type: 'string' },
                     project: { type: 'string' },
                   },
                   required: ['sync_dir'],
                 },
               },
             },
           },
           responses: {
             '200': {
               description: 'Sync export result',
               content: {
                 'application/json': {
                   schema: {
                     type: 'object',
                     properties: {
                       chunk_id: { type: 'string' },
                       filename: { type: 'string' },
                       sessions: { type: 'integer' },
                       observations: { type: 'integer' },
                       prompts: { type: 'integer' },
                       exported: { type: 'integer' },
                       skipped: { type: 'integer' },
                       chunks: { type: 'integer' },
                       from_mutation_id: { type: 'integer', nullable: true },
                       to_mutation_id: { type: 'integer', nullable: true },
                       message: { type: 'string' },
                     },
                     required: ['chunk_id', 'filename', 'sessions', 'observations', 'prompts', 'exported', 'skipped', 'chunks', 'from_mutation_id', 'to_mutation_id'],
                   },
                 },
               },
             },
           },
         },
       },
       '/sync/import': {
         post: {
           summary: 'Import sync chunks',
           requestBody: {
             required: true,
             content: {
               'application/json': {
                 schema: {
                   type: 'object',
                   properties: { sync_dir: { type: 'string' } },
                   required: ['sync_dir'],
                 },
               },
             },
           },
           responses: {
             '200': {
               description: 'Sync import result',
               content: {
                 'application/json': {
                   schema: {
                     type: 'object',
                     properties: {
                       chunks_processed: { type: 'integer' },
                       imported: { type: 'integer' },
                       skipped: { type: 'integer' },
                       failed: { type: 'integer' },
                     },
                     required: ['chunks_processed', 'imported', 'skipped', 'failed'],
                   },
                 },
               },
             },
           },
         },
       },
      '/projects/migrate': {
        post: {
          summary: 'Migrate project name',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    old_project: { type: 'string' },
                    new_project: { type: 'string' },
                  },
                  required: ['old_project', 'new_project'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Migration result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      old_project: { type: 'string' },
                      new_project: { type: 'string' },
                      migrated: {
                        type: 'object',
                        properties: {
                          sessions: { type: 'integer' },
                          observations: { type: 'integer' },
                          prompts: { type: 'integer' },
                        },
                        required: ['sessions', 'observations', 'prompts'],
                      },
                    },
                    required: ['old_project', 'new_project', 'migrated'],
                  },
                },
              },
            },
          },
        },
      },
      '/projects/delete': {
        post: {
          summary: 'Delete project data safely',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteProjectRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Project deletion result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DeleteProjectResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/DeleteProjectConflict' },
          },
        },
      },
    },
    components: {
      responses: {
        Error: {
          description: 'Error response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        DeleteProjectConflict: {
          description: 'Project deletion conflict response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeleteProjectConflict' },
            },
          },
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
          required: ['error'],
        },
        DeleteProjectRequest: {
          type: 'object',
          properties: {
            project: { type: 'string' },
          },
          required: ['project'],
        },
        DeleteProjectConflict: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string', enum: ['project_delete_conflict'] },
            project: { type: 'string' },
            conflict: {
              type: 'object',
              properties: {
                session_id: { type: 'string' },
                entity_type: { type: 'string', enum: ['prompt', 'observation'] },
                foreign_project: { type: 'string' },
              },
              required: ['session_id', 'entity_type', 'foreign_project'],
            },
          },
          required: ['error', 'code', 'project', 'conflict'],
        },
        DeleteProjectResponse: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            deleted: {
              type: 'object',
              properties: {
                observations: { type: 'integer' },
                observation_versions: { type: 'integer' },
                prompts: { type: 'integer' },
                sessions: { type: 'integer' },
              },
              required: ['observations', 'observation_versions', 'prompts', 'sessions'],
            },
          },
          required: ['project', 'deleted'],
        },
        Observation: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            sync_id: { type: 'string', nullable: true },
            session_id: { type: 'string' },
            type: OBSERVATION_TYPE_SCHEMA,
            title: { type: 'string' },
            content: { type: 'string' },
            tool_name: { type: 'string', nullable: true },
            project: { type: 'string', nullable: true },
            scope: OBSERVATION_SCOPE_SCHEMA,
            topic_key: { type: 'string', nullable: true },
            normalized_hash: { type: 'string', nullable: true },
            revision_count: { type: 'integer' },
            duplicate_count: { type: 'integer' },
            last_seen_at: { type: 'string', nullable: true },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
            deleted_at: { type: 'string', nullable: true },
          },
          required: [
            'id',
            'sync_id',
            'session_id',
            'type',
            'title',
            'content',
            'tool_name',
            'project',
            'scope',
            'topic_key',
            'normalized_hash',
            'revision_count',
            'duplicate_count',
            'last_seen_at',
            'created_at',
            'updated_at',
            'deleted_at',
          ],
        },
        SearchResult: {
          allOf: [
            { $ref: '#/components/schemas/Observation' },
            {
              type: 'object',
              properties: {
                rank: { type: 'number' },
                preview: { type: 'string' },
              },
              required: ['rank', 'preview'],
            },
          ],
        },
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            project: { type: 'string' },
            directory: { type: 'string', nullable: true },
            started_at: { type: 'string' },
            ended_at: { type: 'string', nullable: true },
            summary: { type: 'string', nullable: true },
          },
          required: ['id', 'project', 'directory', 'started_at', 'ended_at', 'summary'],
        },
        Prompt: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            sync_id: { type: 'string', nullable: true },
            session_id: { type: 'string' },
            content: { type: 'string' },
            project: { type: 'string', nullable: true },
            created_at: { type: 'string' },
          },
          required: ['id', 'sync_id', 'session_id', 'content', 'project', 'created_at'],
        },
        Pagination: {
          type: 'object',
          properties: {
            total_length: { type: 'integer' },
            returned_from: { type: 'integer' },
            returned_to: { type: 'integer' },
            has_more: { type: 'boolean' },
            next_offset: { type: 'integer' },
          },
          required: ['total_length', 'returned_from', 'returned_to', 'has_more'],
        },
        PaginatedObservation: {
          allOf: [
            { $ref: '#/components/schemas/Observation' },
            {
              type: 'object',
              properties: {
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
              required: ['pagination'],
            },
          ],
        },
         CreateObservationRequest: {
           type: 'object',
           properties: {
             title: { type: 'string' },
             content: { type: 'string' },
             type: OBSERVATION_TYPE_SCHEMA,
             session_id: { type: 'string' },
             project: { type: 'string' },
             scope: OBSERVATION_SCOPE_SCHEMA,
             topic_key: { type: 'string' },
           },
           required: ['title', 'content'],
         },
         UpdateObservationRequest: {
           type: 'object',
           properties: {
             title: { type: 'string' },
             content: { type: 'string' },
             type: OBSERVATION_TYPE_SCHEMA,
             project: { type: 'string' },
             scope: OBSERVATION_SCOPE_SCHEMA,
             topic_key: { type: 'string' },
           },
         },
        ObservationMutationResult: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            action: { type: 'string', enum: ['created', 'deduplicated', 'upserted'] },
            revision: { type: 'integer' },
          },
          required: ['id', 'action', 'revision'],
        },
         CompactSearchResult: {
           type: 'object',
           properties: {
             id: { type: 'integer' },
             title: { type: 'string' },
             type: OBSERVATION_TYPE_SCHEMA,
             created_at: { type: 'string' },
           },
           required: ['id', 'title', 'type', 'created_at'],
         },
         PreviewSearchResult: {
           type: 'object',
           properties: {
             id: { type: 'integer' },
             title: { type: 'string' },
             type: OBSERVATION_TYPE_SCHEMA,
             project: { type: 'string', nullable: true },
             scope: OBSERVATION_SCOPE_SCHEMA,
             topic_key: { type: 'string', nullable: true },
             created_at: { type: 'string' },
             preview: { type: 'string' },
           },
           required: ['id', 'title', 'type', 'project', 'scope', 'topic_key', 'created_at', 'preview'],
         },
         CompactSearchResponse: {
           type: 'object',
           properties: {
             results: {
               type: 'array',
               items: { $ref: '#/components/schemas/CompactSearchResult' },
             },
             total: { type: 'integer' },
           },
           required: ['results', 'total'],
         },
         PreviewSearchResponse: {
           type: 'object',
           properties: {
             results: {
               type: 'array',
               items: { $ref: '#/components/schemas/PreviewSearchResult' },
             },
             total: { type: 'integer' },
           },
           required: ['results', 'total'],
         },
         SearchObservationsResponse: {
           type: 'object',
           properties: {
             results: {
               type: 'array',
               items: { $ref: '#/components/schemas/SearchResult' },
             },
             total: { type: 'integer' },
           },
           required: ['results', 'total'],
         },
        Stats: {
          type: 'object',
          properties: {
            sessions: { type: 'integer' },
            observations: { type: 'integer' },
            prompts: { type: 'integer' },
            projects: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['sessions', 'observations', 'prompts', 'projects'],
        },
        VizNode: {
          type: 'object',
          properties: {
            id: { type: 'string' }, kind: { type: 'string', enum: ['observation', 'fact', 'session', 'project', 'topic'] }, label: { type: 'string' }, snippet: { type: 'string' },
            project: { type: 'string', nullable: true }, topic_key: { type: 'string', nullable: true }, type: { ...OBSERVATION_TYPE_SCHEMA, nullable: true },
            session_id: { type: 'string', nullable: true },
            seed_x: { type: 'number' }, seed_y: { type: 'number' },
          },
          required: ['id', 'kind', 'label', 'snippet', 'project', 'topic_key', 'type', 'seed_x', 'seed_y', 'session_id'],
        },
        VizEdge: {
          type: 'object',
          properties: { id: { type: 'string' }, source_id: { type: 'string' }, target_id: { type: 'string' }, relation: { type: 'string' }, kind: { type: 'string', enum: ['semantic', 'metadata', 'fact'] }, label: { type: 'string' }, summary: { type: 'string' } },
          required: ['id', 'source_id', 'target_id', 'relation', 'label', 'summary', 'kind'],
        },
        VizHealthResponse: {
          type: 'object',
          properties: { semantic_state: { type: 'string', enum: ['ready', 'pending', 'degraded', 'rebuilding'] }, pending_jobs: { type: 'integer' } },
          required: ['semantic_state', 'pending_jobs'],
        },
        VizSliceResponse: {
          type: 'object',
          properties: {
            nodes: { type: 'array', items: { $ref: '#/components/schemas/VizNode' } },
            edges: { type: 'array', items: { $ref: '#/components/schemas/VizEdge' } },
            state: { type: 'string', enum: ['empty', 'sparse', 'dense'] },
            continuation: { type: 'string', nullable: true },
            truncated: { type: 'boolean' },
            health: { $ref: '#/components/schemas/VizHealthResponse' },
          },
          required: ['nodes', 'edges', 'state', 'continuation', 'truncated', 'health'],
        },
        VizExpandRequest: {
          type: 'object',
          properties: {
            node_id: { type: 'string' }, project: { type: 'string' }, session_id: { type: 'string' }, topic_key: { type: 'string' }, type: OBSERVATION_TYPE_SCHEMA, observation_type: OBSERVATION_TYPE_SCHEMA, relation: { type: 'string' }, query: { type: 'string' },
            depth: { type: 'integer', minimum: 1, maximum: 2 }, max_nodes: { type: 'integer', minimum: 1, maximum: 1200 }, max_edges: { type: 'integer', minimum: 1, maximum: 3600 },
            cursor: { type: 'string' },
          },
          required: ['node_id'],
        },
        VizInspectNodeResponse: {
          type: 'object',
          properties: { id: { type: 'string' }, kind: { type: 'string' }, label: { type: 'string' }, snippet: { type: 'string' }, metadata: { type: 'object' }, links: { type: 'array', items: { type: 'string' } } },
          required: ['id', 'kind', 'label', 'snippet', 'metadata', 'links'],
        },
        VizInspectEdgeResponse: {
          type: 'object',
          properties: { id: { type: 'string' }, source_id: { type: 'string' }, target_id: { type: 'string' }, relation: { type: 'string' }, label: { type: 'string' }, summary: { type: 'string' } },
          required: ['id', 'source_id', 'target_id', 'relation', 'label', 'summary'],
        },
        VizFiltersResponse: {
          type: 'object',
          properties: {
            projects: { type: 'array', items: { type: 'string' } },
            sessions: { type: 'array', items: { type: 'string' } },
            topic_keys: { type: 'array', items: { type: 'string' } },
            types: { type: 'array', items: OBSERVATION_TYPE_SCHEMA },
            relations: { type: 'array', items: { type: 'string' } },
          },
          required: ['projects', 'sessions', 'topic_keys', 'types', 'relations'],
        },
        ProjectTextResponse: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['project', 'text'],
        },
        ProjectGraphFact: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            observation_id: { type: 'integer' },
            subject: { type: 'string' },
            relation: GRAPH_RELATION_SCHEMA,
            object: { type: 'string' },
            project: { type: 'string', nullable: true },
            topic_key: { type: 'string', nullable: true },
            type: OBSERVATION_TYPE_SCHEMA,
            created_at: { type: 'string' },
          },
          required: ['id', 'observation_id', 'subject', 'relation', 'object', 'project', 'topic_key', 'type', 'created_at'],
        },
        ProjectGraphSummary: {
          type: 'object',
          properties: {
            shown: { type: 'integer' },
            total: { type: 'integer' },
            omitted: { type: 'integer' },
            truncated: { type: 'boolean' },
            text_truncated: { type: 'boolean' },
            limit: { type: 'integer' },
            max_chars: { type: 'integer' },
            filters: {
              type: 'object',
              properties: {
                topic_key: { type: 'string' },
                relation: GRAPH_RELATION_SCHEMA,
              },
            },
          },
          required: ['shown', 'total', 'omitted', 'truncated', 'text_truncated', 'limit', 'max_chars', 'filters'],
        },
        ProjectGraphResponse: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            text: { type: 'string' },
            facts: {
              type: 'array',
              items: { $ref: '#/components/schemas/ProjectGraphFact' },
            },
            summary: { $ref: '#/components/schemas/ProjectGraphSummary' },
          },
          required: ['project', 'text', 'facts', 'summary'],
        },
        TopicKeySummary: {
          type: 'object',
          properties: {
            topic_key: { type: 'string' },
            project: { type: 'string', nullable: true },
            title: { type: 'string' },
            type: OBSERVATION_TYPE_SCHEMA,
            observation_count: { type: 'integer' },
            updated_at: { type: 'string' },
          },
          required: ['topic_key', 'project', 'title', 'type', 'observation_count', 'updated_at'],
        },
        TopicKeysResponse: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            topics: {
              type: 'array',
              items: { $ref: '#/components/schemas/TopicKeySummary' },
            },
            text: { type: 'string' },
          },
          required: ['project', 'topics', 'text'],
        },
        TopicKeyContextResponse: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            topic_key: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['project', 'topic_key', 'text'],
        },
        ContextResponse: {
          type: 'object',
          properties: {
            sessions: {
              type: 'array',
              items: { $ref: '#/components/schemas/Session' },
            },
            observations: {
              type: 'array',
              items: { $ref: '#/components/schemas/Observation' },
            },
            prompts: {
              type: 'array',
              items: { $ref: '#/components/schemas/Prompt' },
            },
            stats: { $ref: '#/components/schemas/Stats' },
          },
          required: ['sessions', 'observations', 'prompts', 'stats'],
        },
        TimelineResponse: {
          type: 'object',
          properties: {
            focus: { $ref: '#/components/schemas/Observation' },
            before: {
              type: 'array',
              items: { $ref: '#/components/schemas/Observation' },
            },
            after: {
              type: 'array',
              items: { $ref: '#/components/schemas/Observation' },
            },
          },
          required: ['focus', 'before', 'after'],
        },
        ExportData: {
          type: 'object',
          properties: {
            version: { type: 'integer' },
            exported_at: { type: 'string' },
            project: { type: 'string', nullable: true },
            sessions: {
              type: 'array',
              items: { $ref: '#/components/schemas/Session' },
            },
            observations: {
              type: 'array',
              items: { $ref: '#/components/schemas/Observation' },
            },
            prompts: {
              type: 'array',
              items: { $ref: '#/components/schemas/Prompt' },
            },
          },
          required: ['version', 'exported_at', 'sessions', 'observations', 'prompts'],
        },
      },
    },
  };
}
