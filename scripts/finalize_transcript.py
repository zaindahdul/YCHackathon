#!/usr/bin/env python3
"""Merge documented focused MLX repairs; preserve the original full engine output."""
import copy
import hashlib
import json
import re
import shutil
from pathlib import Path
from mlx_whisper.writers import get_writer

ROOT = Path(__file__).resolve().parents[1]
directory = ROOT / 'transcripts'
stem = 'hackathon-recording-35'
original = directory / 'attempts/full-unconditioned'
original.mkdir(parents=True, exist_ok=True)
for extension in ('txt', 'json', 'srt', 'vtt', 'tsv'):
    target = original / f'{stem}.{extension}'
    if not target.exists():
        shutil.copy2(directory / target.name, target)
base = json.loads((original / f'{stem}.json').read_text())
manifest_path = directory / 'attempts/recovered-clips/manifest.json'
manifest = json.loads(manifest_path.read_text())
segments = copy.deepcopy(base['segments'])
for clip in manifest['clips']:
    start, end = clip['start'], clip['end']
    segments = [s for s in segments if not start - 0.001 <= s['start'] < end - 0.001]
    result = json.loads((manifest_path.parent / f'{clip["name"]}.json').read_text())
    for segment in result['segments']:
        segment['start'] = round(start + segment['start'], 2)
        segment['end'] = round(start + segment['end'], 2)
        segment['seek'] += round(start * 100)
        for word in segment.get('words', []):
            word['start'] = round(start + word['start'], 2)
            word['end'] = round(start + word['end'], 2)
        segment['provenance'] = f'attempts/recovered-clips/{clip["name"]}.json'
        segments.append(segment)
segments.sort(key=lambda s: s['start'])
for number, segment in enumerate(segments):
    segment['id'] = number
    segment.setdefault('provenance', f'attempts/full-unconditioned/{stem}.json')
    if segment['end'] < segment['start']:
        raise ValueError(f'Negative duration in segment {number}; repair required')
base['segments'] = segments
base['text'] = ''.join(segment['text'] for segment in segments)
base['processing'] = {'base': f'attempts/full-unconditioned/{stem}.json',
                      'replacements': manifest['clips'],
                      'note': 'Engine text retained; focused repairs replace segment windows, no manual name/spelling correction.'}
get_writer('all', str(directory))(base, stem)
source_path = directory / 'source.json'
source = json.loads(source_path.read_text())
source['processing_script'] = 'scripts/finalize_transcript.py'
source['repair_script'] = 'scripts/recover_transcript_clips.py'
source['repair_manifest'] = 'transcripts/attempts/recovered-clips/manifest.json'
source['notes'] = [n for n in source['notes'] if n != 'Raw outputs are retained without silent spelling corrections.']
source['notes'].append('Final five formats merge full-model output with three focused normalized redecodes. Original engine outputs retained; no manual name/spelling correction.')
source['notes'] = list(dict.fromkeys(source['notes']))
source_path.write_text(json.dumps(source, indent=2) + '\n')
words = re.findall(r"[a-z']+", base['text'].lower())
flags = []
previous = ''
run = 0
for s in segments:
    reasons = []
    if s.get('avg_logprob', 0) < -0.9:
        reasons.append('low average log probability')
    if s.get('compression_ratio', 0) > 2.4:
        reasons.append('high compression/repetition score')
    if s['end'] - s['start'] > 15 and len(s['text'].split()) < 5:
        reasons.append('long low-content segment; possible room pause/hallucination')
    normal = re.sub(r'\W+', '', s['text'].lower())
    run = run + 1 if normal == previous and normal else 1
    if run >= 4:
        reasons.append('four or more consecutive identical segments')
    previous = normal
    if reasons:
        flags.append({'start': s['start'], 'end': s['end'], 'text': s['text'], 'reasons': reasons})
gaps = []
latest_end = 0
for s in segments:
    if s['start'] - latest_end > 10:
        gaps.append({'start': latest_end, 'end': s['start'], 'seconds': round(s['start'] - latest_end, 2)})
    latest_end = max(latest_end, s['end'])
report = {'model': source['model'], 'duration_seconds': source['duration_seconds'],
          'segment_count': len(segments), 'word_count': len(words),
          'first_segment_seconds': segments[0]['start'], 'last_segment_end_seconds': segments[-1]['end'],
          'transcript_sha256': hashlib.sha256((directory / f'{stem}.json').read_bytes()).hexdigest(),
          'filler_fraction': sum(w in {'uh', 'um'} for w in words) / len(words),
          'focused_repairs': manifest, 'remaining_review_flags': flags, 'gaps_over_10_seconds': gaps,
          'interpretation': 'Complete audio was processed. Gaps and flags do not establish missing speech or word accuracy; names/URLs/chatter remain uncertain. No complete human listening audit.'}
(directory / 'quality-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Finalized {len(segments)} segments, {len(words)} words, {len(flags)} review flags')
