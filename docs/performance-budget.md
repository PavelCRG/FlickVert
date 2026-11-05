# Performance budget

Initial Windows baseline for FlickVert 0.1.4. These are regression ceilings, not claims about every supported machine. Re-measure on the same host and method before changing a ceiling.

| Scenario | Budget | Observed baseline | Measurement |
| --- | ---: | ---: | --- |
| Cold launch to native main window | ≤ 500 ms | 266 ms | Release executable, stopwatch from process start until a native window handle appears. This does not measure first React paint. |
| Quick wheel show | p95 ≤ 150 ms | p50 45.9 ms; p95 92.3 ms | 30 warmed calls through the same Rust `show_quick` path used by the global shortcut; includes Tauri IPC, show/focus, and two animation frames. |
| Catalog search response | p95 ≤ 50 ms | p50 31.1 ms; p95 32 ms | 30 searches in the running UI; input event through two animation frames. |
| Native ZIP worker memory, 256 MiB input | ≤ 16 MiB peak working set | 5.6 MiB | `creates_zip_for_256_mib_input`; 256 MiB input, 1,221,655-byte archive, 2,723 ms compression time. |

The ZIP memory figure covers the Rust test process only; it excludes the main app, WebView2 child processes, filesystem cache, and other conversions. The 256 MiB fixture is deliberately highly compressible, so its output size is not a general archive-size estimate. Do not use this number as a whole-application memory claim.

The launch and UI timings are local Windows observations, not CI guarantees. For comparisons, keep the build mode, machine, warm-up, and sample count the same. The current ZIP test is an ignored manual test and must be invoked explicitly with `cargo test creates_zip_for_256_mib_input -- --ignored --nocapture`.
