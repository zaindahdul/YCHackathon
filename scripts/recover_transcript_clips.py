#!/usr/bin/env python3
"""Reprocess three diagnosed ASR regions; keep raw MLX results and offsets."""
import json
import subprocess
import tempfile
from pathlib import Path
import mlx_whisper
from mlx_whisper.writers import get_writer

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'transcripts/source.json').read_text())
output = ROOT / 'transcripts/attempts/recovered-clips'
output.mkdir(parents=True, exist_ok=True)
regions = [(1627.72, 1670.56), (3020.8, 3061.3), (3422.7, 3501.32)]
manifest = {'model': source['model'], 'preprocessing': 'ffmpeg mono 16kHz, loudnorm I=-20 TP=-2 LRA=11',
            'options': {'language': 'en', 'condition_on_previous_text': False, 'word_timestamps': True,
                        'hallucination_silence_threshold': 2.0}, 'clips': []}
writer = get_writer('all', str(output))
with tempfile.TemporaryDirectory(prefix='formshop-asr-') as temporary:
    for start, end in regions:
        name = f'clip-{start}-{end}'.replace('.', 'p')
        wav = Path(temporary) / f'{name}.wav'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(start), '-t', str(end-start),
                        '-i', source['source_path'], '-ac', '1', '-ar', '16000',
                        '-af', 'loudnorm=I=-20:TP=-2:LRA=11', str(wav)], check=True)
        result = mlx_whisper.transcribe(str(wav), path_or_hf_repo=source['model'], verbose=False,
                                        **manifest['options'])
        writer(result, name)
        manifest['clips'].append({'start': start, 'end': end, 'name': name})
        print(name, result['text'], flush=True)
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
