# Evals

Quality evals for the AI layer: search, indexing, the Canvas graph and the Assistant chat. They are measured on a generated testbed of
realistic files. They aren't part of `npm test`: they print tables, write a JSON result, and only assert that the pipeline is wired
correctly. The numbers are for comparing before and after a change.

## Run

```bash
npm run eval          # search + index + graph (+ chat when FILDOS_EVAL_LLM is set), real models
npm run eval:smoke    # same suites on bag-of-words embeddings: no model downloads (CI runs this)
npm run eval:search   # one suite: eval:search | eval:index | eval:graph | eval:chat
```

Environment:

| Variable | Default | Meaning |
|---|---|---|
| `FILDOS_MODELS_DIR` | `eval/.models` | Embedding model cache. Point it at the app's `userData/models` to reuse its downloads. |
| `FILDOS_LLM_DIR` | `eval/.models/llm` | Chat model weights (GGUF). The app keeps them in `userData/models/llm`. |
| `FILDOS_EVAL_LLM` | unset | Chat model id from `LLM_MODELS` (e.g. `qwen3-4b`). The chat suite is skipped without it. |
| `FILDOS_EVAL_LABEL` | `local` | Names the run in the result file (`baseline`, `pr2`…). |
| `FILDOS_TESTBED` | `eval/testbed-data` | Where the testbed is built. |

To reuse the app's downloads on a Mac:

```bash
FILDOS_MODELS_DIR="$HOME/Library/Application Support/fildos-app/models" FILDOS_LLM_DIR="$HOME/Library/Application Support/fildos-app/models/llm" FILDOS_EVAL_LLM=qwen3-4b FILDOS_EVAL_LABEL=baseline npm run eval
```

Results land in `eval/results/<date>-<label>-<provider>-<suite>.json`. Commit the before and after files with a PR that changes
search, indexing, the graph or chat, and quote the deltas in the PR description.

## The testbed

`testbed/manifest.ts` declares everything and `testbed/build.ts` builds it. The build is deterministic and is only redone when the
manifest changes. It contains:

- notes, recipes, finance and travel documents, in English, Bengali, Spanish and Arabic
- a 9-page lease and a 200-page field guide (PDFs with facts on known pages), and a DOCX
- a codebase (`projects/webapp`), of which only the docs should be indexed
- pictures, a screenshot, audio and video, fetched from a pinned Hugging Face revision and checked against their SHA-256
- traps that must never be indexed: secrets (`.env`, `.pem`, credentials), a `CACHEDIR.TAG` folder, a dataset-like folder of
  220 machine-named frames, and an exact duplicate picture

The indexer's built-in rules check every path segment, so the testbed must not sit under a dot-folder, `tmp`, `Library` and so on.

## Suites

- **Search** (`search.eval.ts`, queries in `queries/search.json`): R@1, R@5 and MRR per tag. Place accuracy checks the right page or
  moment for expectations pinned with `file.pdf@p7` or `clip.mp4@t0-30`. "Nothing found" precision covers unanswerable queries.
  Also p50/p95 latency. Keyword-only, meaning-only and fused lanes are scored separately.
- **Index** (`index.eval.ts`): a fresh index each time. It checks:
  - skip rules respected, and expected files indexed
  - extraction probes per document
  - PDF pages kept, the long book's tail reached, and mostly-numeric text stored with no vector
  - cost: model seconds per chunk and per image, vector bytes, index size
- **Graph** (`graph.eval.ts`, groups in `manifest.ts#GROUPS`), all on the Canvas similarity graph:
  - neighbour recall and precision within topical groups
  - picture↔text links
  - group cohesion and cluster purity
- **Chat** (`chat.eval.ts`, cases in `queries/chat.json`): the real LLM with the production prompt and tools.
  - `/find` and research questions: was the right file retrieved, was it cited, does the answer hold the fact
  - file actions run on a scratch copy of the testbed: did the expected tool run, and is the disk in the expected state afterwards
    (read-only cases must change nothing)

Indexing with real models is cached per provider, models and testbed in `eval/.cache`. Search, graph and chat reuse that index;
the index suite always rebuilds.
