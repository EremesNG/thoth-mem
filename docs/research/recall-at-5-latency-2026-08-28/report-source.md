# Deep Research: cómo llevar thoth-mem a RecallAny@5 ≈ 95% sin abandonar el CORE local

**Fecha:** 28 de agosto de 2026<br>
**Proyecto:** thoth-mem<br>
**Decisión investigada:** siguiente cuello de botella de recuperación en el CORE SQLite-first<br>
**Alcance:** recuperación local; no propone ampliar la superficie pública de seis tools ni introducir servicios remotos

## Decisión de producto posterior

Después de ejecutar E0, el usuario separó explícitamente dos objetivos que esta investigación había combinado: la fase lexical sin embeddings compite contra **agentmemory BM25-only**, mientras que el `95.2%` de **agentmemory BM25+Vector** queda reservado para una futura fase semántica si se reconsideran embeddings. Agentmemory atribuye el salto publicado de `86.2%` a `95.2%` a `all-MiniLM-L6-v2` y declara que no hay un LLM en el loop de ese benchmark de recuperación; sus LLM opcionales pertenecen a otras funciones del producto.

En el subconjunto común de 470 preguntas, agentmemory BM25-only alcanza `409/470 = 87.021%` y E0 alcanza `419/470 = 89.149%`. E0 también cumple su gate de p95, huella SQLite idéntica, procedencia completa y cero llamadas. Por decisión posterior, `strict-selected-any-cap5-rrf-v1` se promueve como default lexical. El objetivo híbrido de 447/470, los gates originales y el `retain_default` del reporte v3 permanecen como evidencia histórica de la política investigada aquí, no como un bloqueo vigente para la promoción lexical.

## Resumen ejecutivo

thoth-mem ya tiene dos mitades de la solución, pero todavía no las reúne dentro del presupuesto de latencia:

- El default local `any-prefix-v1` cumple el gate de latencia y alcanza **RecallAny@5 82.553% (388/470)** con p95 **1.3659 ms**.
- El pase amplio `all-then-any-prefix-v1` alcanza **94.894% (446/470)**, prácticamente el nivel de agentmemory hybrid en las mismas 470 preguntas (**95.106%, 447/470**), pero su p95 **3.6591 ms** incumple el techo congelado de **2× el control**, que en la corrida r4 equivale a **1.9054 ms**.

La conclusión central es que **un router selectivo por sí solo no resuelve el problema**. El pase amplio recupera 66 consultas que el default pierde, pero el default conserva 8 que el pase amplio desplaza. Incluso un selector perfecto tendría que activar expansión para al menos **14.0%** de las consultas. Si esa expansión sigue costando 3.66 ms, su masa cae dentro de la cola que determina p95. El segundo pase debe hacerse intrínsecamente barato; después tiene sentido decidir cuándo ejecutarlo.

La arquitectura recomendada es una **cascada léxica de dos fases con fusión estable**:

1. Mantener el lookup estructurado y el pase rápido.
2. Sustituir el proxy “términos más largos” por selección de términos realmente discriminativos mediante document frequency/IDF local.
3. Recuperar hasta cinco candidatos con un segundo pase barato, respaldado primero por FTS5 y, si no basta, por una proyección derivada de impactos/postings acotados.
4. Fusionar las listas rápida y ampliada en vez de dejar que una reemplace a la otra.
5. Añadir un gate de confianza solo cuando el segundo pase ya esté dentro del presupuesto.

El primer experimento es deliberadamente pequeño: **los tres términos seleccionados actuales, cap interno 5, fusión de listas y benchmark co-run**. Si no alcanza simultáneamente ≥95% y p95 ≤2×, el siguiente paso es **selección por IDF + cap 5**. La proyección de impactos es el plan B técnicamente sólido; embeddings locales no deben ser el siguiente movimiento porque agentmemory no publica una distribución de latencia comparable y la inferencia de la query amenaza el presupuesto de ~1.9 ms.

## 1. Pregunta y contrato de éxito

La pregunta no es “cómo mejorar la búsqueda” en abstracto. Es:

> ¿Cómo recuperar al menos 447 de las 470 preguntas no-abstention de LongMemEval-S en Top-5, preservando el CORE 100% local, SQLite-first, sin llamadas de red/modelo/LLM y sin superar 2× el p95 de un control co-ejecutado?

Se usa **RecallAny@5** como métrica primaria porque el usuario preguntó por “Recall@5” en el sentido publicado por agentmemory: una pregunta cuenta como hit si al menos una sesión gold aparece en los primeros cinco resultados. Deben seguir visibles las métricas más exigentes —Recall@5 fraccional, RecallAll@5, NDCG@10 y MRR— para impedir que un hit binario oculte una degradación de cobertura o de ranking.

### Gates propuestos

| Dimensión | Gate mínimo de investigación | Objetivo de paridad |
|---|---:|---:|
| RecallAny@5 | ≥ 95.0% | ≥ 95.106% (447/470) |
| Recall@5 fraccional | no regresión frente al mejor candidato | ≥ 89.415% |
| RecallAll@5 | no regresión frente al mejor candidato | ≥ 82.128% |
| NDCG@10 | no regresión frente al mejor candidato | ≥ 88.028% |
| Latencia | p95 ≤ 2× control co-run | margen operativo, no empate al límite |
| Huella | mismos bytes SQLite entre lanes | sin estado opaco no contabilizado |
| Dependencias | 0 red, 0 modelo, 0 LLM | 100% local y reproducible |

Los objetivos de paridad provienen de la recomputación de agentmemory hybrid sobre las mismas 470 preguntas. No son afirmaciones sobre su latencia.

## 2. Dónde estamos realmente

Fuente local: `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json` y recomputación del artefacto de agentmemory sobre el subconjunto común de 470 preguntas.

| Sistema / estrategia | RecallAny@5 | Recall@5 frac. | RecallAll@5 | NDCG@10 | MRR | p95 comparable |
|---|---:|---:|---:|---:|---:|---:|
| thoth default `any-prefix-v1` | 82.553% | 67.702% | 54.043% | 69.654% | 79.468% | 1.3659 ms |
| thoth `all-then-any-prefix-v1` | 94.894% | 87.926% | 78.723% | 85.383% | 87.167% | 3.6591 ms |
| agentmemory BM25 | 87.021% | 76.507% | 67.021% | 74.039% | 72.466% | no publicado de forma comparable |
| agentmemory hybrid | 95.106% | 89.415% | 82.128% | 88.028% | 88.378% | no publicado de forma comparable |

La cifra headline de agentmemory, 95.2%, se calcula sobre 500 registros. En el protocolo de thoth-mem se excluyen las 30 preguntas cuyo ID termina en `_abs`, por lo que la comparación justa usa 470. La diferencia práctica es mínima para hybrid, pero importante para evitar comparar denominadores distintos.

### El Pareto aprendido en cuatro rondas

| Variante any-prefix | Selección / cap | RecallAny@5 | p95 | Lectura |
|---|---|---:|---:|---|
| ronda inicial | hasta 10 filas | 94.894% | 2.9549 ms | calidad suficiente, cola demasiado cara |
| r2 | 4 términos iniciales / 5 filas | 53.191% | 2.0404 ms | las palabras frecuentes destruyen selectividad |
| r3 | 3 términos iniciales / 2 filas | 28.511% | 2.1348 ms | menos filas no arreglan posting lists malas |
| r4 | 3 términos más largos / 2 filas | 82.553% | 1.3659 ms | seleccionar términos importa más que hidratar filas |

Esto invalida una intuición simplista: bajar Top-K no garantiza bajar la latencia si los términos elegidos abren posting lists muy largas. La mejora de r4 vino de selectividad, no solo del cap.

### Qué revela el cruce por pregunta

Al comparar el Top-5 del default r4 con el pase amplio:

| Caso | Preguntas |
|---|---:|
| Ambos aciertan | 380 |
| Solo default | 8 |
| Solo pase amplio | 66 |
| Ninguno | 16 |

La unión oracle alcanza **454/470 = 96.596%**. Por tanto, el techo observado de una fusión léxica ya supera agentmemory hybrid; no hace falta asumir que embeddings son obligatorios para cruzar 95%. Sí hace falta preservar las ocho victorias del pase rápido y recuperar una parte suficiente de las 66 victorias del pase amplio.

## 3. Evidencia externa relevante

### 3.1 FTS5 ayuda, pero no incorpora una ejecución Top-K tipo WAND

SQLite FTS5 ofrece índices de prefijo, BM25, `fts5vocab`, custom tokenizers y funciones auxiliares. Los índices de prefijo evitan que cada prefijo tenga que resolverse como un rango sobre el vocabulario, a cambio de más entradas de índice. La documentación también permite que una función auxiliar itere coincidencias y ejecute una query de una frase; no expone, sin embargo, una abstracción pública de upper bounds por bloque equivalente a Block-Max WAND. Por eso una implementación WAND real requeriría una extensión nativa más profunda o una proyección derivada propia, no solo cambiar el SQL. Fuente oficial: [SQLite FTS5](https://www.sqlite.org/fts5.html) y [API de extensión FTS5](https://sqlite.org/src/doc/trunk/ext/fts5/fts5.h).

### 3.2 La poda dinámica demuestra que Top-K no requiere evaluación exhaustiva

WAND usa información parcial y upper bounds para descartar documentos que no pueden entrar al Top-K. El trabajo original reportó más de 90% menos evaluaciones completas con pérdidas prácticamente nulas de precisión/recall en su colección. Block-Max WAND refina el principio con upper bounds por bloques; la variante de bloques variables reportó aproximadamente 2× sobre el estado del arte y una representación comprimida de bounds cercana a 50%, con degradación de velocidad menor a 10%. No son números transferibles directamente a thoth-mem, pero sí evidencia fuerte de que el cuello es algorítmico, no inherente a un OR amplio. Fuentes primarias: [Broder et al., WAND](https://doi.org/10.1145/956863.956944) y [Mallia et al., Variable Block-Max WAND](https://pages.di.unipi.it/rossano/assets/pdf/papers/SIGIR17A.pdf).

### 3.3 Una primera cascada especializada puede ser mucho más barata

Wang, Dimopoulos y Suel propusieron estructuras de uno y dos términos, acceso condicionado por un presupuesto y terminación temprana. Su evaluación encontró candidatos aproximadamente un orden de magnitud más rápido que un Top-K conjuntivo, con calidad esencialmente equivalente en su pipeline. La equivalencia útil para thoth-mem es una proyección rebuildable de candidatos por término —y, solo si los datos lo justifican, por pares— seguida de BM25 exacto sobre una unión acotada. Fuente primaria: [Fast First-Phase Candidate Generation for Cascading Rankers](https://research.engineering.nyu.edu/~suel/papers/candi.pdf).

### 3.4 El costo debe optimizarse junto con la efectividad

Las cascadas multi-stage no se optimizan únicamente por relevancia: deben considerar costo de features, número de candidatos y cutoffs por etapa. Esa es precisamente la forma correcta de tratar los features de confianza y una expansión léxica: el gate no es “inteligente” si ignora el costo del branch que activa. Fuente primaria: [Efficient Cost-Aware Cascade Ranking](https://rueycheng.github.io/paper/efficient-cost-aware-cascade.pdf).

### 3.5 Query performance prediction es útil, pero frágil

NQC y predictores relacionados usan la dispersión de scores del ranking inicial como señal de dificultad o query drift. Son baratos y compatibles con BM25. Pero el trabajo sobre selective query expansion encontró que, incluso en un escenario ideal, se necesitaba Kendall τ ≥ 0.5 para mejorar de forma consistente, un nivel que muchos predictores no alcanzaban. Por ello, el router debe entrenarse y evaluarse en split retenido contra la decisión real “¿el segundo pase aporta un gold Top-5?”, no validarse solo por correlación global. Fuentes primarias: [Normalized Query Commitment Revisited](https://research.ibm.com/publications/normalized-query-commitment-revisited) y [When is query performance prediction effective?](https://eprints.gla.ac.uk/34668/).

### 3.6 Agentmemory confirma el valor de la fusión, no nuestro presupuesto

El código local de agentmemory genera candidatos BM25 y vectoriales, añade resultados de grafo y los combina mediante reciprocal rank fusion ponderado, con un bonus por acuerdo y diversificación por sesión. Esa arquitectura explica por qué hybrid mejora BM25. Sin una distribución de latencia LongMemEval comparable —mismo hardware, corpus residente, definición query-only y percentiles— no demuestra que su query embedding o su triple stream quepan en el gate de thoth-mem. La enseñanza transferible inmediata es la **fusión de listas heterogéneas**, no la adopción automática de embeddings.

## 4. Arquitectura recomendada

### 4.1 Flujo objetivo

```text
query
  ├─ lookup estructurado exacto
  └─ Stage A: selección discriminativa → OR acotado → top-5 rápido
         ├─ confianza alta → fusión/finalización
         └─ confianza baja → Stage B: proyección de impactos acotada
                                → rerank BM25 exacto de candidatos
                                → fusión con Stage A
```

### 4.2 Stage A: de “más largo” a “más discriminativo”

La longitud funcionó como proxy barato de rareza, pero no representa document frequency. FTS5 ya ofrece `fts5vocab`; la implementación puede mantener un mapa in-memory `{token → doc_freq}` reconstruible al abrir/rebuild del índice o consultar una tabla derivada indexada. Para cada query:

1. sanitizar/deduplicar dentro de la ventana congelada de 32 términos;
2. asignar IDF o una función monotónica de document frequency;
3. conservar tres términos discriminativos con desempate estable por posición;
4. preservar el orden original para construir la query;
5. pedir cinco resultados, no dos;
6. devolver features numéricos de diagnóstico sin texto privado.

Este cambio ataca simultáneamente calidad y costo: evita listas frecuentes y aprovecha el Top-5 real. Debe congelarse en el `configHash`.

### 4.3 Stage B: proyección de impactos rebuildable

Si FTS5 con tres términos IDF y cap 5 aún rebasa el p95 o queda por debajo de 95%, crear una proyección derivada, no autoritativa:

- por token discriminativo, conservar una lista corta de `memory_id` ordenada por impacto estático compatible con BM25;
- opcionalmente materializar pares solo para combinaciones frecuentes donde el análisis offline demuestre ganancia;
- en query, unir listas de los términos seleccionados bajo un presupuesto fijo de postings/candidatos;
- hidratar y calcular BM25/temporalidad exactos únicamente para esa unión;
- registrar versión, config hash, source watermark, bytes y estado ready/stale/rebuilding con `ProjectionRegistry`.

Esta proyección sigue el patrón ya existente de estado rebuildable y permite invalidación determinista. No sustituye el ledger SQLite ni se convierte en una nueva fuente de verdad.

### 4.4 Fusión estable

El servicio actual llena una `Map` en orden de etapa; el segundo pase no vuelve a puntuar la primera lista. Debe existir un componente explícito de fusión:

- unión por `memory_id`;
- RRF de dos listas o normalización rank-based, evitando comparar BM25 crudo entre queries/planes distintos;
- bonus pequeño y versionado para acuerdo entre stages;
- desempate estable por mejor rank, `created_at` e ID;
- diversificación por sesión/topic solo si la métrica muestra duplicación problemática;
- structured exact siempre conserva prioridad.

La fusión es obligatoria porque el pase amplio pierde ocho casos que el default gana. Un reemplazo secuencial nunca puede alcanzar el techo oracle de 96.596%.

### 4.5 Gate de confianza

El gate se añade después de abaratar Stage B. Features candidatas, todas locales y numéricas:

- cantidad de resultados Stage A;
- score gap rank 1–2 y rank 2–5;
- dispersión/NQC de scores;
- suma/promedio de IDF y cobertura de términos seleccionados;
- overlap entre resultados strict y relaxed;
- número de términos con document frequency alta;
- costo estimado: suma de longitudes de posting lists.

La etiqueta offline correcta es ganancia marginal de Stage B en Top-5, no question type ni el ID gold. Entrenar/tunear en una partición y congelar umbral antes de evaluar el holdout. Un gate que solo reduce promedio pero no p95 no cumple el contrato.

## 5. Secuencia de experimentos

### E0 — Cap 5 con los tres términos largos actuales

**Cambio:** `maxLexicalResults: 5`, fusión explícita Stage A/strict cuando aplique, sin nueva proyección.<br>
**Por qué primero:** es el experimento más barato que falta en el Pareto; r2 no lo representa porque usaba términos iniciales no selectivos.<br>
**Decisión:** promover solo si ≥95% RecallAny@5 y p95 ≤2× control. Si la calidad sube pero el p95 falla por poco, pasar a E1.

### E1 — Tres términos por IDF, cap 5

**Cambio:** document frequency local versionada; seleccionar rarest/discriminative; mismo SQL/hidratación.<br>
**Ablaciones:** 2/3/4 términos × cap 3/5; exact token vs prefix; longest vs IDF.<br>
**Decisión:** escoger el punto Pareto por gate, no por una métrica aislada.

### E2 — Proyección de candidatos por impacto

**Cambio:** nueva proyección derivada y rebuildable con listas Top-M por token; unión presupuestada; rerank exacto.<br>
**Ablaciones:** M ∈ {8,16,32}; candidate union ∈ {16,32,64}; uno vs dos términos; con/sin pares.<br>
**Decisión:** exigir igualdad de bytes por lane y contabilizar los bytes de la proyección. Medir p50/p95/p99, postings visitados y candidatos exact-scored.

### E3 — Router de confianza

**Cambio:** activar Stage B selectivamente usando features del Stage A.<br>
**Validación:** split fijo, config hash, curva RecallAny@5 contra trigger rate y p95; comparar contra always-on Stage B.<br>
**Decisión:** aceptar solo si no pierde el gate de calidad y crea margen real de cola.

### E4 — Residual semántico local, solo si queda una brecha

Si E0–E3 quedan por debajo de 95%, estudiar una proyección semántica local únicamente sobre los 16 casos que ambas estrategias léxicas pierden o sobre clases de fallo verificadas. Requisitos antes de adoptarla:

- corpus embeddings offline y rebuildables;
- query encoder medido en el mismo host;
- modelo/índice contabilizados;
- query inference dentro de un subpresupuesto explícito o fuera de la ruta síncrona;
- fusión con BM25 mediante ranks, no scores crudos;
- benchmark sin red y con warm/cold separados.

No debe saltarse directamente a embeddings: podrían mejorar recall y aun así hacer imposible el gate de latencia.

## 6. Mapeo al CORE actual

Superficies de implementación identificadas:

- `src/memory-core/sqlite/fts.ts`: configuración versionada, selección de términos y query plan.
- `src/memory-core/service.ts`: ejecución de stages, cap, unión, hidratación, scoring y diagnostics.
- `src/memory-core/retrieval/projections.ts`: lifecycle rebuildable para una eventual proyección de impactos.
- `tests/memory-core/retrieval.test.ts`: contratos de plan, caps, orden y fusión.
- `benchmarks/longmemeval/run.mjs`: evidencia co-run y gates.

El diseño no requiere una tool nueva. Recall continúa entrando por la misma API pública; la cascada es un detalle del CORE.

## 7. Riesgos y controles

| Riesgo | Control |
|---|---|
| Leakage al ajustar sobre las 470 preguntas | split train/validation/holdout fijo; reporte separado del headline final |
| Sobreajuste a inglés/LongMemEval | features lingüísticamente neutras; corpus secundario de sesiones de código; análisis por tipo |
| p95 inestable por caché | warm-up declarado, query order hash, co-run control, repetir semillas/órdenes |
| Proyección desactualizada | watermark + config hash + fail-closed a FTS5 |
| Bytes ocultos | incluir tabla, índices, sidecar y memoria residente en recursos |
| Fusión mejora hits pero empeora rank | gates simultáneos de NDCG@10, MRR, fraccional y RecallAll |
| Router parece bueno por correlación | evaluar decisión downstream y curva trigger-rate, no solo Kendall/Pearson |

## 8. Recomendación final

El siguiente cuello de botella no es “falta de semántica”; es **falta de un Top-5 léxico amplio que sea barato y que se fusione con el ranking rápido**.

La orden de trabajo recomendada es:

1. ejecutar E0: tres términos largos + cap 5 + fusión;
2. si falla, ejecutar E1: selección IDF + matriz pequeña de caps/términos;
3. si el MATCH sigue dominando p95, implementar E2 como proyección de impactos rebuildable;
4. solo entonces entrenar E3 para ahorrar trabajo sin depender de un branch lento;
5. abrir E4 semántico únicamente contra fallos residuales demostrados.

Esta ruta tiene una ventaja estratégica: el corpus local ya demuestra un techo lexical-fusion de **96.596%**, superior a agentmemory hybrid en el mismo denominador. El objetivo de 95% es plausible sin renunciar a SQLite-first, pero no se conseguirá haciendo selectivo un pase que todavía es demasiado caro. Primero se abarata el candidato; luego se enruta.

## Fuentes

### Evidencia local

- `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json`
- `benchmarks/results/longmemeval-s-lexical-latency-report.json`
- `benchmarks/results/longmemeval-s-lexical-latency-report-r2.json`
- `benchmarks/results/longmemeval-s-lexical-latency-report-r3.json`
- `benchmarks/results/longmemeval-s-lexical-comparison-report.json`
- `openspec/changes/archive/2026-08-28-optimize-relaxed-lexical-latency/research.md`
- `C:/DEV/Proyectos/Webstorm/agentmemory/src/state/hybrid-search.ts`
- `C:/DEV/Proyectos/Webstorm/agentmemory/eval/runner/adapters/agentmemory.ts`

### Literatura y documentación primaria

- SQLite. [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html).
- SQLite. [FTS5 Extension API](https://sqlite.org/src/doc/trunk/ext/fts5/fts5.h).
- Broder et al. (2003). [Efficient query evaluation using a two-level retrieval process](https://doi.org/10.1145/956863.956944).
- Mallia et al. (2017). [Faster BlockMax WAND with Variable-sized Blocks](https://pages.di.unipi.it/rossano/assets/pdf/papers/SIGIR17A.pdf).
- Wang, Dimopoulos y Suel (2016). [Fast First-Phase Candidate Generation for Cascading Rankers](https://research.engineering.nyu.edu/~suel/papers/candi.pdf).
- Chen et al. (2017). [Efficient Cost-Aware Cascade Ranking in Multi-Stage Retrieval](https://rueycheng.github.io/paper/efficient-cost-aware-cascade.pdf).
- Hauff y Azzopardi (2009). [When is query performance prediction effective?](https://eprints.gla.ac.uk/34668/).
- Roitman (2019). [Normalized Query Commitment Revisited](https://research.ibm.com/publications/normalized-query-commitment-revisited).
- Cronen-Townsend, Zhou y Croft (2004). [A framework for selective query expansion](https://ciir.cs.umass.edu/pubfiles/ir-375.pdf).

## Nota metodológica

La investigación separa hechos de inferencias. Las métricas de thoth-mem y agentmemory son hechos recalculados en artefactos locales. Los speedups de WAND/cascades pertenecen a sus colecciones y solo justifican la dirección algorítmica. Que una proyección de impactos permitirá cumplir 1.9 ms es una hipótesis a verificar, no un resultado. La priorización E0→E4 combina esas fuentes con el perfil observado del CORE actual.
