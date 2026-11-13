# Vendored offline pipeline

Source: https://github.com/tfpgh/wikigraph
Commit: `34dd1c07044753253d23c9c9c04ee1ec506c3cf4`
Retrieved: 2026-11-13
Copyright: 2026 Toby Penner, MIT (see LICENSE).

The `offline/`, `slurm/`, Python project metadata and upstream README are retained unmodified. No Wikipedia dumps, generated tiles, layout files or routing data are included. The separate `tfpgh/website` frontend is not included: no license was found in its inspected tree.

These scripts have not been executed here. The upstream pipeline expects Linux/NVIDIA CUDA for graph processing, hardcoded English May 2026 multistream dump paths, and output directories relative to its working directory. Its example GPU job requests 256 GB RAM and an RTX6000; that is an upstream job allocation, not a benchmarked minimum requirement.

Before execution, create `dumps`, `intermediates`, `logs` and `output` inside this directory and provide inputs. Generated content is ignored. Inspect the upstream parser's English namespace/reference filters before using another language. Adapt input configuration and extraction policy explicitly; do not treat its regex graph as every rendered Wikipedia link.

The application does not yet consume these outputs. Integration and measured deployment prerequisites are recorded in ../../docs/MAP-ARCHITECTURE.md.
