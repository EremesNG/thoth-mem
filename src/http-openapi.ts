import { OBSERVATION_TYPES } from './store/types.js';

const OBSERVATION_TYPE_SCHEMA = {
  type: 'string',
  enum: [...OBSERVATION_TYPES],
};

const OBSERVATION_SCOPE_SCHEMA = {
  type: 'string',
  enum: ['project', 'personal'],
};

export function getOpenApiSpec(port: number): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: {
      title: 'thoth-mem HTTP API',
      version: '0.1.4',
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
                      chunk_file: { type: 'string' },
                      sessions: { type: 'integer' },
                      observations: { type: 'integer' },
                      prompts: { type: 'integer' },
                    },
                    required: ['chunk_id', 'chunk_file', 'sessions', 'observations', 'prompts'],
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
                      imported: { type: 'integer' },
                      skipped: { type: 'integer' },
                    },
                    required: ['imported', 'skipped'],
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
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
          required: ['error'],
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
