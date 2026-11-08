#!/usr/bin/env python3
"""Verify transcript integrity, repository references and published main; behavior uses npm run check."""
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
    files = ('README.md', 'ideas.md', 'AGENTS.md', 'docs/hackathon-brief.md',
             'docs/recording-digest.md', 'docs/OPERATING_MODEL.md', 'docs/ARCHITECTURE.md',
             'docs/NAIVE_SETUP.md', 'docs/REVIEW.md', 'docs/DELIVERY.md', 'docs/archive/README.md',
             'studio/README.md', 'docs/STUDIO_UPDATE.md', 'docs/STUDIO_REVIEW.md',
             'BOT_HANDOFF.md', 'CLAUDE.md', 'docs/IMPLEMENTATION_ACCEPTANCE.md',
             'docs/LAUNCHPAD_VERIFICATION.md', 'docs/context/prs/README.md',
             'docs/context/yc-founder-problems-pr6.md',
             'docs/customer-research/jesai-tarun-launch-interview.md',
             'docs/customer-research/aditya-sentient-launch-interview.md',
             'docs/customer-research/README.md')
    paths = [ROOT / f for f in files]
    for path in paths:
        require(path.stat().st_size > 100, f'Missing/empty plan artifact: {path}')
    for name in ('0001_init.sql', '0002_runs.sql', '0003_uploads.sql'):
        original = subprocess.check_output(['git', 'show', f'fc49da2:sql/{name}'], cwd=ROOT)
        require((ROOT / 'studio/sql' / name).read_bytes() == original,
                f'Applied studio migration changed: {name}')
    local_links([p for p in ROOT.rglob('*.md') if not any(x in p.parts for x in ('node_modules', '.git', 'data'))])
    handoff()
    print('Current and archived document/reference checks passed; behavior uses npm run check')



def handoff():
    directory = ROOT / 'docs/context/prs'
    index = json.loads((directory / 'index.json').read_text())
    require(index['repository'] == 'zaindahdul/YCHackathon', 'Wrong PR repository')
    require(index['capturedAt'].startswith('2026-11-08'), 'Missing dated capture')
    snapshots = {}
    for item in index['pullRequests']:
        number = item['number']
        snapshot = json.loads((directory / f'{number:02d}.json').read_text())
        for field in ('number', 'title', 'state', 'isDraft', 'baseRefName',
                      'headRefName', 'headRefOid', 'url', 'updatedAt'):
            require(snapshot[field] == item[field], f'PR {number} index/detail mismatch: {field}')
        for field in ('body', 'files', 'commits', 'comments', 'reviews'):
            require(field in snapshot, f'PR {number} missing source field: {field}')
        require(snapshot['url'] == f'https://github.com/zaindahdul/YCHackathon/pull/{number}',
                f'Wrong PR link: {number}')
        subprocess.run(['git', 'cat-file', '-e', snapshot['headRefOid'] + '^{commit}'],
                       cwd=ROOT, check=True)
        snapshots[number] = snapshot
    require(set(snapshots) == set(range(1, 8)), 'Expected all seven captured PRs')
    require(snapshots[7]['baseRefName'] == snapshots[6]['headRefName'] == 'launchpad',
            'Lost stacked PR7 -> PR6 relationship')
    subprocess.run(['git', 'merge-base', '--is-ancestor', snapshots[6]['headRefOid'],
                    snapshots[7]['headRefOid']], cwd=ROOT, check=True)
    require(snapshots[5]['headRefOid'] == index['mainAtCapture'], 'PR5 capture is not main')
    raw_notes = subprocess.check_output(['git', 'show',
        snapshots[6]['headRefOid'] + ':yc-founder-problems.md'], cwd=ROOT, text=True)
    require((ROOT / 'docs/context/yc-founder-problems-pr6.md').read_text().endswith(raw_notes),
            'Earlier source copy differs from PR6')
    for name in ('README.md', 'AGENTS.md', 'ideas.md'):
        require('BOT_HANDOFF.md' in (ROOT / name).read_text(), f'Handoff undiscoverable from {name}')
    print('Handoff: all 7 PR snapshots consistent with fetched commits; stacked ancestry and source provenance verified')


def delivery():
    def run(*arguments):
        return subprocess.check_output(arguments, cwd=ROOT, text=True).strip()
    branch = run('git', 'branch', '--show-current')
    commit = run('git', 'rev-parse', 'HEAD')
    require(branch == 'main', 'Current branch is not main')
    remote = run('git', 'ls-remote', 'origin', 'refs/heads/main').split()[0]
    require(remote == commit, 'Remote main differs from local HEAD')
    require(not run('git', 'status', '--porcelain'), 'Working tree is not clean')
    for ancestor in ('fd6eb33', 'b46bfe1', 'bd2a830', 'fc49da2'):
        subprocess.run(['git', 'merge-base', '--is-ancestor', ancestor, 'HEAD'], cwd=ROOT, check=True)
    repo = json.loads(run('gh', 'repo', 'view', 'zaindahdul/YCHackathon', '--json', 'url,defaultBranchRef'))
    record = (ROOT / 'docs/DELIVERY.md').read_text()
    require(repo['url'] + '/tree/main' in record, 'Delivery record omits published main URL')
    default = repo['defaultBranchRef']['name']
    require(default == 'main' or 'default branch remains' in record.lower(), 'Unrecorded default-branch blocker')
    print(f'Delivery: clean main matches origin ({commit[:12]}), all histories preserved; default={default}')


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
            review = (ROOT / 'docs/REVIEW.md').read_text()
            require('Final disposition' in review, 'Final independent review disposition missing')
            require('No unresolved material findings' in review, 'Review still has material findings')
            studio_review = (ROOT / 'docs/STUDIO_REVIEW.md').read_text()
            require('Final disposition' in studio_review, 'Studio independent review disposition missing')
            require('No unresolved material' in studio_review, 'Studio review still has material findings')
            print('Both review dispositions recorded; lead must still inspect their evidence')
    except (AssertionError, OSError, KeyError, ValueError, subprocess.CalledProcessError, IndexError) as error:
        parser.exit(1, f'FAIL: {error}\n')


if __name__ == '__main__':
    main()
