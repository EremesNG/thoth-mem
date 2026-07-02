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
      '/version': {
        get: {
          summary: 'Get package version',
          responses: {
            '200': {
              description: 'Version payload',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { version: { type: 'string' } },
                    required: ['version'],
                  },
                },
              },
            },
          },
        },
      },
      '/operations': {
        get: {
          summary: 'List supported HTTP, MCP, and CLI-equivalent operations',
          responses: {
            '200': {
              description: 'Operation catalog',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OperationCatalogResponse' },
                },
              },
            },
          },
        },
      },
      '/operation-traces': {
        get: {
          summary: 'List sanitized operation traces',
          parameters: [
            { name: 'origin', in: 'query', schema: { type: 'string', enum: ['mcp', 'http', 'cli', 'system'] } },
            { name: 'target', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['ok', 'error'] } },
            { name: 'project', in: 'query', schema: { type: 'string' } },
            { name: 'session_id', in: 'query', schema: { type: 'string' } },
            { name: 'since', in: 'query', schema: { type: 'string' } },
            { name: 'until', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
          ],
          responses: {
            '200': {
              description: 'Trace list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OperationTraceListResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/operation-traces/{trace_id}': {
        get: {
          summary: 'Get one sanitized operation trace',
          parameters: [{ name: 'trace_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Trace detail',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OperationTrace' },
                },
              },
            },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/index/status': {
        get: {
          summary: 'Get semantic index and background queue status',
          parameters: [{ name: 'project', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Index status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IndexStatusResponse' },
                },
              },
            },
          },
        },
      },
      '/index/rebuild': {
        post: {
          summary: 'Queue semantic index rebuild work',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RebuildIndexRequest' },
              },
            },
          },
          responses: {
            '202': {
              description: 'Index rebuild queued',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RebuildIndexResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/graph/rebuild': {
        post: {
          summary: 'Rebuild graph-lite facts',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { project: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Graph rebuild result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RebuildGraphResponse' },
                },
              },
            },
          },
        },
      },
      '/graph/prune': {
        post: {
          summary: 'Prune superseded graph history',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PruneGraphRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Graph prune result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PruneGraphResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/communities/rebuild': {
        post: {
          summary: 'Rebuild project community summaries',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CommunityProjectRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Community rebuild result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommunityRebuildResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/communities/preview': {
        post: {
          summary: 'Preview project community summaries',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CommunityPreviewRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Community preview result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommunityPreviewResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/communities/status': {
        get: {
          summary: 'Get project community summary status',
          parameters: [{ name: 'project', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Community state result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommunityStateResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/communities': {
        delete: {
          summary: 'Drop derived community summary artifacts',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DropCommunitiesRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Drop community summaries result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DropCommunitiesResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/maintenance/preview': {
        post: {
          summary: 'Preview memory maintenance',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MaintenanceRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Maintenance preview result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MaintenanceRunPreview' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/maintenance/apply': {
        post: {
          summary: 'Apply memory maintenance',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MaintenanceRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Maintenance apply result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MaintenanceRunResult' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
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
      '/observatory/context': {
        get: {
          summary: 'Get observatory scoped context token and capabilities',
          parameters: [
            { name: 'project', in: 'query', schema: { type: 'string' } },
            { name: 'session_id', in: 'query', schema: { type: 'string' } },
            { name: 'topic_key', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: OBSERVATION_TYPE_SCHEMA },
            { name: 'observation_type', in: 'query', schema: OBSERVATION_TYPE_SCHEMA },
            { name: 'relation', in: 'query', schema: { type: 'string' } },
            { name: 'time_from', in: 'query', schema: { type: 'string' } },
            { name: 'time_to', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Observatory context', content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryContextResponse' } } } } },
        },
      },
      '/observatory/recall': {
        get: {
          summary: 'Get observatory hybrid lane recall payload',
          parameters: [
            { name: 'context_token', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'lanes', in: 'query', schema: { type: 'string', example: 'lexical,sentence-vector' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
          ],
          responses: { '200': { description: 'Observatory recall', content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryRecallResponse' } } } }, '400': { $ref: '#/components/responses/Error' } },
        },
      },
      '/observatory/pivot': {
        post: {
          summary: 'Resolve pivot token into scoped target context',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryPivotRequest' } } } },
          responses: { '200': { description: 'Pivot resolved', content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryPivotResponse' } } } }, '400': { $ref: '#/components/responses/Error' } },
        },
      },
      '/observatory/map/frontier': {
        post: {
          summary: 'Get deterministic map frontier expansion payload',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryMapFrontierRequest' } } } },
          responses: { '200': { description: 'Frontier payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryMapFrontierResponse' } } } }, '400': { $ref: '#/components/responses/Error' } },
        },
      },
      '/observatory/ledger/{id}': {
        get: {
          summary: 'Get structured ledger/provenance detail for observation',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
          responses: { '200': { description: 'Ledger detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryLedgerResponse' } } } }, '404': { $ref: '#/components/responses/Error' } },
        },
      },
      '/observatory/timeline': {
        get: {
          summary: 'Get scoped observatory timeline window',
          parameters: [
            { name: 'context_token', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'continuation', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Timeline payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/ObservatoryTimelineResponse' } } } }, '400': { $ref: '#/components/responses/Error' } },
        },
      },
      '/observatory/health': {
        get: {
          summary: 'Get observatory health/index readiness',
          parameters: [{ name: 'project', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Health payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/VizHealthResponse' } } } } },
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
          summary: 'Get project Knowledge Graph Ledger facts (legacy compatibility route)',
          parameters: [
            { name: 'project', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'topic_key', in: 'query', schema: { type: 'string' } },
            { name: 'relation', in: 'query', schema: GRAPH_RELATION_SCHEMA },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
            { name: 'max_chars', in: 'query', schema: { type: 'integer', minimum: 200, maximum: 20000, default: 6000 } },
          ],
          responses: {
            '200': {
              description: 'Project Knowledge Graph Ledger structured facts and compatible markdown payload for the legacy graph route',
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
      '/projects/{project}/communities': {
        get: {
          summary: 'Get bounded committed project community summaries',
          parameters: [
            { name: 'project', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 200 } },
            { name: 'max_chars', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20000 } },
          ],
          responses: {
            '200': {
              description: 'Project community summaries',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProjectCommunitiesResponse' },
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
        OperationCatalogEntry: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            origin: { type: 'string', enum: ['http', 'mcp', 'cli'] },
            label: { type: 'string' },
            kind: { type: 'string', enum: ['read', 'write', 'admin', 'sync', 'indexing'] },
            method: { type: 'string' },
            path: { type: 'string' },
            target: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['id', 'origin', 'label', 'kind', 'description'],
        },
        OperationCatalogResponse: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: { $ref: '#/components/schemas/OperationCatalogEntry' },
            },
          },
          required: ['operations'],
        },
        OperationTrace: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            trace_id: { type: 'string' },
            origin: { type: 'string', enum: ['mcp', 'http', 'cli', 'system'] },
            target: { type: 'string' },
            status: { type: 'string', enum: ['ok', 'error'] },
            project: { type: 'string', nullable: true },
            session_id: { type: 'string', nullable: true },
            started_at: { type: 'string' },
            finished_at: { type: 'string' },
            duration_ms: { type: 'integer' },
            request_json: { type: 'string' },
            response_json: { type: 'string', nullable: true },
            error: { type: 'string', nullable: true },
            request_truncated: { type: 'boolean' },
            response_truncated: { type: 'boolean' },
            created_at: { type: 'string' },
          },
          required: [
            'id', 'trace_id', 'origin', 'target', 'status', 'project', 'session_id',
            'started_at', 'finished_at', 'duration_ms', 'request_json', 'response_json',
            'error', 'request_truncated', 'response_truncated', 'created_at',
          ],
        },
        OperationTraceListResponse: {
          type: 'object',
          properties: {
            traces: {
              type: 'array',
              items: { $ref: '#/components/schemas/OperationTrace' },
            },
            total: { type: 'integer' },
          },
          required: ['traces', 'total'],
        },
        SemanticIndexProgress: {
          type: 'object',
          properties: {
            lanes: { type: 'array', items: { type: 'object' } },
            jobs: { type: 'array', items: { type: 'object' } },
            totals: { type: 'object' },
            coverage: { type: 'object' },
            recentErrors: { type: 'array', items: { type: 'object' } },
          },
          required: ['lanes', 'jobs', 'totals', 'coverage', 'recentErrors'],
        },
        IndexStatusResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            state: { type: 'object' },
            progress: { $ref: '#/components/schemas/SemanticIndexProgress' },
            health: { $ref: '#/components/schemas/VizHealthResponse' },
          },
          required: ['project', 'state', 'progress', 'health'],
        },
        RebuildIndexRequest: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            reason: { type: 'string' },
            process_limit: { type: 'integer', minimum: 0 },
          },
        },
        RebuildIndexResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            queued: { type: 'boolean' },
            dedupe_key: { type: 'string' },
            processed: { type: 'integer' },
            state: { type: 'object' },
            progress: { $ref: '#/components/schemas/SemanticIndexProgress' },
            health: { $ref: '#/components/schemas/VizHealthResponse' },
          },
          required: ['project', 'queued', 'dedupe_key', 'processed', 'state', 'progress', 'health'],
        },
        RebuildGraphResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            observations_scanned: { type: 'integer' },
            facts_deleted: { type: 'integer' },
            facts_created: { type: 'integer' },
          },
          required: ['project', 'observations_scanned', 'facts_deleted', 'facts_created'],
        },
        PruneGraphRequest: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            dryRun: { type: 'boolean' },
          },
        },
        PruneGraphResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            dry_run: { type: 'boolean' },
            slots_scanned: { type: 'integer' },
            triples_pruned: { type: 'integer' },
            entities_pruned: { type: 'integer' },
            dangling_refs_nulled: { type: 'integer' },
            superseded_before: { type: 'integer' },
            superseded_after: { type: 'integer' },
          },
          required: [
            'project',
            'dry_run',
            'slots_scanned',
            'triples_pruned',
            'entities_pruned',
            'dangling_refs_nulled',
            'superseded_before',
            'superseded_after',
          ],
        },
        CommunityProjectRequest: {
          type: 'object',
          properties: {
            project: { type: 'string' },
          },
          required: ['project'],
        },
        CommunityPreviewRequest: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            limit: { type: 'integer', minimum: 0, maximum: 200 },
            max_chars: { type: 'integer', minimum: 1, maximum: 20000 },
          },
          required: ['project'],
        },
        DropCommunitiesRequest: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            all: { type: 'boolean' },
          },
          description: 'Provide either project or all.',
        },
        CommunitySummarySnapshot: {
          type: 'object',
          properties: {
            community_id: { type: 'string' },
            level: { type: 'integer' },
            summary_text: { type: 'string' },
            entity_count: { type: 'integer' },
            triple_count: { type: 'integer' },
            source_observation_count: { type: 'integer' },
            top_entities: { type: 'array', items: { type: 'string' } },
            top_relations: { type: 'array', items: { type: 'string' } },
            source_observation_ids: { type: 'array', items: { type: 'integer' } },
            confidence: { type: 'number' },
            degraded: { type: 'boolean' },
            degraded_reasons: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'community_id',
            'level',
            'summary_text',
            'entity_count',
            'triple_count',
            'source_observation_count',
            'top_entities',
            'top_relations',
            'source_observation_ids',
            'confidence',
            'degraded',
            'degraded_reasons',
          ],
        },
        CommunityRebuildResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            run_id: { type: 'integer' },
            status: { type: 'string', enum: ['running', 'committed', 'failed'] },
            freshness: { type: 'string', enum: ['disabled', 'missing', 'fresh', 'stale', 'rebuilding', 'failed', 'empty', 'degraded'] },
            algorithm: { type: 'string', enum: ['connected_components'] },
            graph_signature: { type: 'string', nullable: true },
            communities_created: { type: 'integer' },
            entities_scanned: { type: 'integer' },
            triples_scanned: { type: 'integer' },
            source_observations_scanned: { type: 'integer' },
            degraded_reasons: { type: 'array', items: { type: 'string' } },
            error: { type: 'string' },
          },
          required: ['project', 'run_id', 'status', 'freshness', 'algorithm', 'graph_signature', 'communities_created', 'entities_scanned', 'triples_scanned', 'source_observations_scanned', 'degraded_reasons'],
        },
        CommunityPreviewResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            state: { type: 'string' },
            would_commit: { type: 'boolean' },
            graph_signature: { type: 'string', nullable: true },
            communities: { type: 'array', items: { $ref: '#/components/schemas/CommunitySummarySnapshot' } },
            entities_scanned: { type: 'integer' },
            triples_scanned: { type: 'integer' },
            source_observations_scanned: { type: 'integer' },
            truncated: { type: 'boolean' },
            degraded_reasons: { type: 'array', items: { type: 'string' } },
          },
          required: ['project', 'state', 'would_commit', 'graph_signature', 'communities', 'entities_scanned', 'triples_scanned', 'source_observations_scanned', 'truncated', 'degraded_reasons'],
        },
        CommunityStateResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            state: { type: 'string' },
            run_id: { type: 'integer', nullable: true },
            latest_committed_run_id: { type: 'integer', nullable: true },
            graph_signature: { type: 'string', nullable: true },
            current_graph_signature: { type: 'string', nullable: true },
            communities_count: { type: 'integer' },
            entities_count: { type: 'integer' },
            triples_count: { type: 'integer' },
            source_observations_count: { type: 'integer' },
            degraded: { type: 'boolean' },
            degraded_reasons: { type: 'array', items: { type: 'string' } },
            error: { type: 'string', nullable: true },
            updated_at: { type: 'string', nullable: true },
          },
          required: ['project', 'state', 'run_id', 'latest_committed_run_id', 'graph_signature', 'current_graph_signature', 'communities_count', 'entities_count', 'triples_count', 'source_observations_count', 'degraded', 'degraded_reasons', 'error', 'updated_at'],
        },
        ProjectCommunitiesResponse: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            state: { type: 'string' },
            run_id: { type: 'integer', nullable: true },
            graph_signature: { type: 'string', nullable: true },
            degraded_reasons: { type: 'array', items: { type: 'string' } },
            communities: { type: 'array', items: { $ref: '#/components/schemas/CommunitySummarySnapshot' } },
          },
          required: ['project', 'state', 'run_id', 'graph_signature', 'degraded_reasons', 'communities'],
        },
        DropCommunitiesResponse: {
          type: 'object',
          properties: {
            project: { type: 'string', nullable: true },
            runs_deleted: { type: 'integer' },
            communities_deleted: { type: 'integer' },
            members_deleted: { type: 'integer' },
            evidence_deleted: { type: 'integer' },
          },
          required: ['project', 'runs_deleted', 'communities_deleted', 'members_deleted', 'evidence_deleted'],
        },
        MaintenanceRequest: {
          type: 'object',
          properties: {
            all: { type: 'boolean' },
            project: { type: 'string' },
            topic_key: { type: 'string' },
            topic_prefix: { type: 'string' },
          },
          description: 'Provide exactly one scope field.',
        },
        MaintenanceCounts: {
          type: 'object',
          properties: {
            records_scanned: { type: 'integer' },
            consolidation_candidates: { type: 'integer' },
            reflection_candidates: { type: 'integer' },
            decay_candidates: { type: 'integer' },
            review_required: { type: 'integer' },
          },
          required: ['records_scanned', 'consolidation_candidates', 'reflection_candidates', 'decay_candidates', 'review_required'],
        },
        MaintenanceRunPreview: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', enum: [true] },
            scope: { type: 'object' },
            counts: { $ref: '#/components/schemas/MaintenanceCounts' },
            consolidations: { type: 'array', items: { type: 'object' } },
            reflections: { type: 'array', items: { type: 'object' } },
            decays: { type: 'array', items: { type: 'object' } },
            degraded: { type: 'array', items: { type: 'string' } },
          },
          required: ['dry_run', 'scope', 'counts', 'consolidations', 'reflections', 'decays', 'degraded'],
        },
        MaintenanceRunResult: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', enum: [false] },
            run_id: { type: 'integer' },
            scope: { type: 'object' },
            counts: { $ref: '#/components/schemas/MaintenanceCounts' },
            consolidations: { type: 'array', items: { type: 'object' } },
            reflections: { type: 'array', items: { type: 'object' } },
            decays: { type: 'array', items: { type: 'object' } },
            degraded: { type: 'array', items: { type: 'string' } },
          },
          required: ['dry_run', 'run_id', 'scope', 'counts', 'consolidations', 'reflections', 'decays', 'degraded'],
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
        ObservatoryScope: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            session_id: { type: 'string' },
            topic_key: { type: 'string' },
            query: { type: 'string' },
            type: OBSERVATION_TYPE_SCHEMA,
            observation_type: OBSERVATION_TYPE_SCHEMA,
            relation: { type: 'string' },
            time_from: { type: 'string' },
            time_to: { type: 'string' },
          },
        },
        ObservatoryContextResponse: {
          type: 'object',
          properties: {
            scope: { $ref: '#/components/schemas/ObservatoryScope' },
            context_token: { type: 'string' },
            health: { $ref: '#/components/schemas/VizHealthResponse' },
            capabilities: {
              type: 'object',
              properties: {
                viz_fallback_available: { type: 'boolean' },
                observatory_routes_available: { type: 'boolean' },
              },
              required: ['viz_fallback_available', 'observatory_routes_available'],
            },
          },
          required: ['scope', 'context_token', 'health', 'capabilities'],
        },
        ObservatoryRecallHit: {
          type: 'object',
          properties: {
            observation_id: { type: 'integer' },
            title: { type: 'string' },
            preview: { type: 'string' },
            type: OBSERVATION_TYPE_SCHEMA,
            project: { type: 'string', nullable: true },
            session_id: { type: 'string' },
            topic_key: { type: 'string', nullable: true },
            created_at: { type: 'string' },
            lane: { type: 'string', enum: ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'] },
            pivot_token: { type: 'string' },
          },
          required: ['observation_id', 'title', 'preview', 'type', 'project', 'session_id', 'topic_key', 'created_at', 'lane', 'pivot_token'],
        },
        ObservatoryRecallResponse: {
          type: 'object',
          properties: {
            context_token: { type: 'string' },
            lanes: {
              type: 'object',
              properties: {
                lexical: { type: 'array', items: { $ref: '#/components/schemas/ObservatoryRecallHit' } },
                'sentence-vector': { type: 'array', items: { $ref: '#/components/schemas/ObservatoryRecallHit' } },
                'chunk-vector': { type: 'array', items: { $ref: '#/components/schemas/ObservatoryRecallHit' } },
                'fact-kg': { type: 'array', items: { $ref: '#/components/schemas/ObservatoryRecallHit' } },
              },
              required: ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'],
            },
            lane_states: {
              type: 'object',
              properties: {
                lexical: { $ref: '#/components/schemas/ObservatoryLaneState' },
                'sentence-vector': { $ref: '#/components/schemas/ObservatoryLaneState' },
                'chunk-vector': { $ref: '#/components/schemas/ObservatoryLaneState' },
                'fact-kg': { $ref: '#/components/schemas/ObservatoryLaneState' },
              },
            },
          },
          required: ['context_token', 'lanes'],
        },
        ObservatoryLaneState: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ready', 'pending', 'degraded', 'unavailable'] },
            reason: {
              type: 'string',
              enum: ['ok', 'no-query', 'no-evidence', 'semantic-pending', 'semantic-stale', 'semantic-degraded', 'kg-no-match', 'unsupported-sync'],
            },
          },
          required: ['status', 'reason'],
        },
        ObservatoryPivotRequest: {
          type: 'object',
          properties: {
            pivot_token: { type: 'string' },
            target: { type: 'string', enum: ['map', 'timeline', 'ledger', 'recall'] },
          },
          required: ['pivot_token', 'target'],
        },
        ObservatoryPivotResponse: {
          type: 'object',
          properties: {
            context_token: { type: 'string' },
            scope: { $ref: '#/components/schemas/ObservatoryScope' },
            focus_node_id: { type: 'string' },
            target: { type: 'string', enum: ['map', 'timeline', 'ledger', 'recall'] },
          },
          required: ['context_token', 'scope', 'focus_node_id', 'target'],
        },
        ObservatoryFrontierState: {
          type: 'object',
          properties: {
            added_node_ids: { type: 'array', items: { type: 'string' } },
            already_visible_node_ids: { type: 'array', items: { type: 'string' } },
            exhausted: { type: 'boolean' },
            continuation: { type: 'string', nullable: true },
            reason: { type: 'string', enum: ['limit', 'no-neighbors', 'scope-filtered'] },
          },
          required: ['added_node_ids', 'already_visible_node_ids', 'exhausted', 'continuation'],
        },
        ObservatoryMapFrontierRequest: {
          type: 'object',
          properties: {
            context_token: { type: 'string' },
            focus_node_id: { type: 'string' },
            visible_node_ids: { type: 'array', items: { type: 'string' } },
            max_nodes: { type: 'integer', minimum: 1, maximum: 1200 },
            max_edges: { type: 'integer', minimum: 1, maximum: 3600 },
            continuation: { type: 'string' },
          },
          required: ['context_token', 'focus_node_id'],
        },
        ObservatoryMapFrontierResponse: {
          type: 'object',
          properties: {
            nodes: { type: 'array', items: { $ref: '#/components/schemas/VizNode' } },
            edges: { type: 'array', items: { $ref: '#/components/schemas/VizEdge' } },
            frontier_state: { $ref: '#/components/schemas/ObservatoryFrontierState' },
            health: { $ref: '#/components/schemas/VizHealthResponse' },
          },
          required: ['nodes', 'edges', 'frontier_state', 'health'],
        },
        ObservatoryLedgerResponse: {
          type: 'object',
          properties: {
            observation_id: { type: 'integer' },
            title: { type: 'string' },
            type: OBSERVATION_TYPE_SCHEMA,
            what: { type: 'array', items: { type: 'string' } },
            why: { type: 'array', items: { type: 'string' } },
            where: { type: 'array', items: { type: 'string' } },
            learned: { type: 'array', items: { type: 'string' } },
            facts: { type: 'array', items: { $ref: '#/components/schemas/ProjectGraphFact' } },
            provenance: {
              type: 'object',
              properties: {
                session_id: { type: 'string' },
                project: { type: 'string', nullable: true },
                topic_key: { type: 'string', nullable: true },
                created_at: { type: 'string' },
              },
              required: ['session_id', 'project', 'topic_key', 'created_at'],
            },
          },
          required: ['observation_id', 'title', 'type', 'what', 'why', 'where', 'learned', 'facts', 'provenance'],
        },
        ObservatoryTimelineResponse: {
          type: 'object',
          properties: {
            context_token: { type: 'string' },
            events: { type: 'array', items: { $ref: '#/components/schemas/Observation' } },
            continuation: { type: 'string', nullable: true },
          },
          required: ['context_token', 'events', 'continuation'],
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
          properties: {
            semantic_state: { type: 'string', enum: ['ready', 'pending', 'degraded', 'rebuilding'] },
            pending_jobs: { type: 'integer' },
            semantic: {
              type: 'object',
              properties: {
                lanes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      lane: { type: 'string' },
                      pending: { type: 'boolean' },
                      degraded: { type: 'boolean' },
                      stale: { type: 'boolean' },
                      last_ready_at: { type: 'string', nullable: true },
                      updated_at: { type: 'string', nullable: true },
                    },
                    required: ['lane', 'pending', 'degraded', 'stale', 'last_ready_at', 'updated_at'],
                  },
                },
                jobs: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    pending: { type: 'integer' },
                    running: { type: 'integer' },
                    done: { type: 'integer' },
                    failed: { type: 'integer' },
                    oldest_pending_at: { type: 'string', nullable: true },
                    queue_lag_ms: { type: 'integer', nullable: true },
                    by_kind: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          kind: { type: 'string' },
                          total: { type: 'integer' },
                          pending: { type: 'integer' },
                          running: { type: 'integer' },
                          done: { type: 'integer' },
                          failed: { type: 'integer' },
                          oldest_pending_at: { type: 'string', nullable: true },
                          oldest_pending_age_ms: { type: 'integer', nullable: true },
                        },
                        required: ['kind', 'total', 'pending', 'running', 'done', 'failed', 'oldest_pending_at', 'oldest_pending_age_ms'],
                      },
                    },
                  },
                  required: ['total', 'pending', 'running', 'done', 'failed', 'oldest_pending_at', 'queue_lag_ms', 'by_kind'],
                },
                coverage: {
                  type: 'object',
                  properties: {
                    observations: { type: 'integer' },
                    chunks: { type: 'integer' },
                    sentences: { type: 'integer' },
                    chunk_vectors: { type: 'integer' },
                    sentence_vectors: { type: 'integer' },
                    chunk_coverage: { type: 'number' },
                    sentence_coverage: { type: 'number' },
                  },
                  required: ['observations', 'chunks', 'sentences', 'chunk_vectors', 'sentence_vectors', 'chunk_coverage', 'sentence_coverage'],
                },
                recent_errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      job_key: { type: 'string' },
                      kind: { type: 'string' },
                      state: { type: 'string' },
                      attempt_count: { type: 'integer' },
                      last_error: { type: 'string', nullable: true },
                    },
                    required: ['id', 'job_key', 'kind', 'state', 'attempt_count', 'last_error'],
                  },
                },
              },
              required: ['lanes', 'jobs', 'coverage', 'recent_errors'],
            },
          },
          required: ['semantic_state', 'pending_jobs', 'semantic'],
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
