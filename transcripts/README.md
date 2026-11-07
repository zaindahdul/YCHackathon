# Recording transcription notes

The input is the user's `New Recording 35.m4a` (64m45.46s). [source.json](source.json) records its path, SHA-256, file size, exact model, installed engine version and reproduction command. Source audio remains outside the repo; no audio was uploaded to an external transcription service. MLX Whisper ran locally using cached Hugging Face model files.

## Accepted pass

`mlx-community/whisper-large-v3-mlx`, using installed `mlx-whisper` 0.4.3, English transcription, with previous-text conditioning disabled. The final output formats are [TXT](hackathon-recording-35.txt), [JSON](hackathon-recording-35.json), [SRT](hackathon-recording-35.srt), [VTT](hackathon-recording-35.vtt) and [TSV](hackathon-recording-35.tsv). The final formats combine the full pass with three focused redecodes: 27:07.72–27:50.56, 50:20.80–51:01.30, and 57:02.70–58:21.32. Clips were extracted as mono 16kHz audio and normalized, then processed with word timestamps and a hallucination/silence threshold. [The recovery script](../scripts/recover_transcript_clips.py) and [merge script](../scripts/finalize_transcript.py) record the process. Raw engine outputs remain under `attempts/full-unconditioned/` and `attempts/recovered-clips/`. No speaker diarization was performed. Timestamps refer to recording time, not the event's wall clock.

These are automatic transcripts, not a certified verbatim record. Room acoustics, background voices, names, product names, URLs and spoken redemption codes can be misrecognized. The [recording digest](../docs/recording-digest.md) separates interpretation and uncertainty from raw output. Do not follow a guessed URL or code as if verified.

## Why there are two passes

The initial cached `whisper-large-v3-turbo` pass fell into extensive repeated filler and empty segments. It is retained under `attempts/turbo/` for provenance only and must not be used as the primary transcript. The replacement uses the full model and disables previous-text carryover to avoid propagating that decoding failure. No manual spelling or name correction was applied. Replaced windows and file origins are recorded in the final JSON.

## Quality and verification

[quality-report.json](quality-report.json) contains temporal coverage, word/segment counts, repetition screening and low-confidence regions for the final pass. These are review aids, not an accuracy percentage. Low-confidence output does not prove speech is wrong; high confidence does not prove it is right. Coverage means the whole audio was processed, not that every word was recovered.

Run `python3 scripts/verify_deliverables.py transcript` from the repo root to check the five outputs, ordered timestamps, end coverage, filler degeneration, TXT/JSON consistency and report hash. The digest documents any remaining uncertainty.

## Reproduce

Use the command in [source.json](source.json), with `AUDIO_PATH` set to the original audio or an identical copy. Keep the same model/options if comparing results. Files are deterministic evidence of this run, but a future library/model revision may produce different text.
