#!/usr/bin/env python3
"""Verify transcript integrity and local planning references; does not test a future app."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def transcript():
    directory = ROOT / 'transcripts'
    stem = directory / 'hackathon-recording-35'
    for ext in ('txt', 'json', 'srt', 'vtt', 'tsv'):
        require(stem.with_suffix('.' + ext).stat().st_size > 0, f'Empty {ext} transcript')
    provenance = json.loads((directory / 'source.json').read_text())
    result = json.loads(stem.with_suffix('.json').read_text())
    segments = result['segments']
    require(segments, 'No transcript segments')
    duration = provenance['duration_seconds']
    require(result['language'] == 'en', 'Unexpected transcript language')
    require(len(provenance['source_sha256']) == 64, 'Missing source hash')
    require(segments[0]['start'] < 15, 'Opening audio not covered')
    require(segments[-1]['end'] >= duration - 45, 'Transcript ends too early')
    last = -1
    for segment in segments:
        require(0 <= segment['start'] <= segment['end'] <= duration + 1,
                f'Invalid timestamp at segment {segment["id"]}')
        require(segment['start'] >= last - 0.1, 'Segments go backward')
        last = segment['start']
    words = re.findall(r"[a-z']+", result['text'].lower())
    require(words, 'No words')
    filler_fraction = sum(w in {'uh', 'um'} for w in words) / len(words)
    require(filler_fraction < 0.2, f'ASR filler degeneration: {filler_fraction:.1%}')
    require(not re.search(r'\b(uh|um)(?:[\s.!?,]+\1){20}', result['text'], re.I),
            'Long repetitive filler loop')
    previous, repeated = '', 0
    for segment in segments:
        normalized = re.sub(r'\W+', '', segment['text'].lower())
        repeated = repeated + 1 if normalized and normalized == previous else 1
        require(repeated < 4, 'Consecutive repeated-segment degeneration')
        require(segment.get('compression_ratio', 0) < 4, 'Severe repetition/compression score')
        previous = normalized
    # The retained TXT should be the engine output, not an unrelated replacement.
    txt_words = re.findall(r"[a-z']+", stem.with_suffix('.txt').read_text().lower())
    require(txt_words == words, 'TXT and JSON text differ')
    quality = json.loads((directory / 'quality-report.json').read_text())
    require(quality['segment_count'] == len(segments), 'Stale quality report')
    require(quality['model'] == provenance['model'], 'Quality/provenance model mismatch')
    require(quality['transcript_sha256'] == hashlib.sha256(stem.with_suffix('.json').read_bytes()).hexdigest(),
            'Quality report is for a different transcript')
    print(f'Transcript: {len(segments)} ordered segments through {segments[-1]["end"]:.2f}s; '
          f'{len(words)} words; filler {filler_fraction:.1%}; all 5 formats present')


def local_links(paths):
    checked = 0
    for path in paths:
        text = path.read_text()
        for href in re.findall(r'\]\(([^)]+)\)', text):
            if '://' in href or href.startswith(('#', 'mailto:')):
                continue
            target = href.split('#', 1)[0]
            if not target:
                continue
            require((path.parent / target).exists(), f'Broken local link in {path}: {href}')
            checked += 1
    print(f'Local references: {checked} valid links')


def research():
    paths = [ROOT / 'docs/research' / name for name in ('naive-sdk.md', 'business-landscape.md')]
    for path in paths:
        body = path.read_text()
        require('November 7, 2026' in body, f'Research date missing: {path.name}')
        require(len(re.findall(r'https://[^)\s]+', body)) >= 5, f'Source links missing: {path.name}')
    local_links(paths)
    print('Research: dated SDK and supplier assessments with direct sources present; live integration is not asserted')


def plan():
    files = ('README.md', 'docs/hackathon-brief.md', 'docs/recording-digest.md',
             'docs/company-plan.md', 'docs/build-plan.md', 'docs/demo-playbook.md',
             'docs/customer-acquisition.md')
    paths = [ROOT / f for f in files]
    for path in paths:
        require(path.stat().st_size > 100, f'Missing/empty plan artifact: {path}')
    local_links(paths)
    print('Planning artifact/reference checks passed; content quality requires the separate independent review')


def delivery():
    def run(*arguments):
        return subprocess.check_output(arguments, cwd=ROOT, text=True).strip()
    branch = run('git', 'branch', '--show-current')
    commit = run('git', 'rev-parse', 'HEAD')
    pr = json.loads(run('gh', 'pr', 'view', branch, '--repo', 'zaindahdul/YCHackathon',
                        '--json', 'url,state,headRefOid,baseRefName,headRefName'))
    require(pr['state'] == 'OPEN', 'PR is not open')
    require(pr['baseRefName'] == 'master', 'PR targets wrong base')
    require(pr['headRefName'] == branch, 'PR branch differs')
    require(pr['headRefOid'] == commit, 'PR does not contain current local commit')
    remote = run('git', 'ls-remote', 'origin', f'refs/heads/{branch}').split()[0]
    require(remote == commit, 'Remote branch differs from local HEAD')
    record = (ROOT / 'docs/pr-delivery.md').read_text()
    require(pr['url'] in record, 'Delivery record omits actual PR URL')
    print(f'Delivery: open PR targets master and contains local HEAD: {pr["url"]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scope', choices=['transcript', 'research', 'plan', 'all', 'delivery'])
    args = parser.parse_args()
    try:
        if args.scope == 'delivery':
            delivery()
            return
        for name, fn in (('transcript', transcript), ('research', research), ('plan', plan)):
            if args.scope in (name, 'all'):
                fn()
        if args.scope == 'all':
            review = (ROOT / 'docs/review.md').read_text()
            require('Final disposition' in review, 'Final independent review disposition missing')
            require('No unresolved material findings' in review, 'Review still has material findings')
            print('Review disposition recorded; lead must still inspect its evidence')
    except (AssertionError, OSError, KeyError, ValueError) as error:
        parser.exit(1, f'FAIL: {error}\n')


if __name__ == '__main__':
    main()
