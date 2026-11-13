"""Deterministic exact-restoration baseline; no LLM classifications.

An exact restoration attributes one event to the preceding revision's author.
Multi-edit restores can undo multiple people: this conservative attribution is
deliberate, visible in the methodology, and is not partial-revert detection.
"""
from collections import Counter, defaultdict
from datetime import timedelta


def detect_reverts(rows):
    seen = {}
    events = []
    previous = None
    for row in rows:
        sha = row.get('sha1')
        if sha and previous and sha != previous.get('sha1') and sha in seen:
            restored = seen[sha]
            if row.get('user') and previous.get('user') and row['user'] != previous['user']:
                events.append({
                    'rev_id': row['rev_id'], 'reverted_rev_id': previous['rev_id'],
                    'restored_rev_id': restored['rev_id'], 'timestamp': row['timestamp'],
                    'actor': row['user'], 'target': previous['user'],
                    'comment': row.get('comment') or '',
                })
        if sha:
            seen[sha] = row
        previous = row
    return events


def score_window(rows, events, start, end):
    # All real edits are the denominator; no unreliable "minor means cosmetic" assumption.
    edits = [r for r in rows if start <= r['timestamp'] <= end]
    selected = [e for e in events if start <= e['timestamp'] <= end]
    directions = {(e['actor'], e['target']) for e in selected}
    mutual = [e for e in selected if (e['target'], e['actor']) in directions]
    counts = Counter(r['user'] for r in rows if r['timestamp'] <= end and r.get('user'))
    people = {u for e in mutual for u in (e['actor'], e['target'])}
    volume = len(people) * sum(min(counts[e['actor']], counts[e['target']]) for e in mutual)
    return {'edits': len(edits), 'reverts': len(selected), 'mutual': len(mutual),
            'participants': len(people), 'historicalVolume': volume,
            'events': sorted(selected, key=lambda e: e['timestamp'], reverse=True)}


def smooth_score(mutual, edits, baseline, strength=20):
    return 100 * (mutual + strength * baseline) / (edits + strength)
