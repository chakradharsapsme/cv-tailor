#!/usr/bin/env python3
"""
Daily job collector for CV Tailor. Free, official sources only:
  * Reed.co.uk Jobseeker API   (free key: https://www.reed.co.uk/developers/jobseeker)
  * Adzuna API                 (free app id + key: https://developer.adzuna.com)
Reads jobs.config.json, merges results into data/jobs.json (the website reads this file).
Keys come from environment variables (GitHub Actions secrets):
  REED_API_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY
A source without keys is skipped. Standard library only.
"""
import base64, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'jobs.config.json')
OUT = os.path.join(ROOT, 'data', 'jobs.json')
UA = 'CV-Tailor-job-collector/1.0 (personal job search; GitHub Actions)'
NOW = datetime.now(timezone.utc)


def http_json(url, headers=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def clean(text, limit=1500):
    text = re.sub(r'<[^>]+>', ' ', str(text or ''))
    text = re.sub(r'&nbsp;|&#160;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:limit]


def money(lo, hi, per='year'):
    vals = [v for v in (lo, hi) if isinstance(v, (int, float)) and v > 0]
    if not vals:
        return ''
    fmt = lambda v: '£{:,.0f}'.format(v)
    if len(vals) == 2 and vals[0] != vals[1]:
        return f'{fmt(vals[0])}-{fmt(vals[1])} per {per}'
    return f'{fmt(vals[0])} per {per}'


def norm(s):
    s = re.sub(r'\b(ltd|limited|plc|llp|uk|group|inc)\b', '', str(s or '').lower())
    return re.sub(r'[^a-z0-9]+', '', s)


# ---------------------------------------------------------------- Reed
def reed(query, cfg, key):
    params = {'keywords': query, 'resultsToTake': 100}
    loc = cfg.get('location', '')
    if loc and not re.fullmatch(r'(?i)united kingdom|uk', loc):
        params['locationName'] = loc
        params['distanceFromLocation'] = cfg.get('distance_miles', 30)
    auth = base64.b64encode((key + ':').encode()).decode()
    data = http_json('https://www.reed.co.uk/api/1.0/search?' + urllib.parse.urlencode(params), {'Authorization': 'Basic ' + auth})
    out = []
    for j in data.get('results', []):
        posted = ''
        m = re.match(r'(\d{2})/(\d{2})/(\d{4})', j.get('date') or '')
        if m:
            posted = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
        lo, hi = j.get('minimumSalary'), j.get('maximumSalary')
        per = 'day' if isinstance(hi or lo, (int, float)) and (hi or lo) < 3000 else 'year'
        out.append({
            'title': j.get('jobTitle', ''), 'company': j.get('employerName', ''), 'location': j.get('locationName', ''),
            'pay': money(lo, hi, per), 'url': j.get('jobUrl') or f"https://www.reed.co.uk/jobs/{j.get('jobId')}",
            'posted': posted, 'source': 'Reed', 'sourceId': str(j.get('jobId', '')), 'snippet': clean(j.get('jobDescription')),
            'type': '', 'query': query
        })
    return out


# ---------------------------------------------------------------- Adzuna
def adzuna(query, cfg, app_id, app_key):
    params = {'app_id': app_id, 'app_key': app_key, 'what': query, 'results_per_page': 50,
              'max_days_old': cfg.get('max_days_old', 21), 'sort_by': 'date', 'content-type': 'application/json'}
    loc = cfg.get('location', '')
    if loc and not re.fullmatch(r'(?i)united kingdom|uk', loc):
        params['where'] = loc
        params['distance'] = int(cfg.get('distance_miles', 30) * 1.6)
    data = http_json('https://api.adzuna.com/v1/api/jobs/gb/search/1?' + urllib.parse.urlencode(params))
    out = []
    for j in data.get('results', []):
        predicted = str(j.get('salary_is_predicted', '0')) == '1'
        lo, hi = j.get('salary_min'), j.get('salary_max')
        per = 'day' if isinstance(hi or lo, (int, float)) and (hi or lo) < 3000 else 'year'
        ctype = {'permanent': 'Permanent', 'contract': 'Contract'}.get(j.get('contract_type') or '', '')
        ctime = {'full_time': 'Full-time', 'part_time': 'Part-time'}.get(j.get('contract_time') or '', '')
        out.append({
            'title': clean(j.get('title'), 200), 'company': (j.get('company') or {}).get('display_name', ''),
            'location': (j.get('location') or {}).get('display_name', ''),
            'pay': '' if predicted else money(lo, hi, per), 'url': j.get('redirect_url', ''),
            'posted': (j.get('created') or '')[:10], 'source': 'Adzuna', 'sourceId': str(j.get('id', '')),
            'snippet': clean(j.get('description')), 'type': ', '.join(x for x in (ctype, ctime) if x), 'query': query
        })
    return out


def main():
    cfg = json.load(open(CONFIG))
    reed_key = os.environ.get('REED_API_KEY', '').strip()
    az_id, az_key = os.environ.get('ADZUNA_APP_ID', '').strip(), os.environ.get('ADZUNA_APP_KEY', '').strip()
    old = {'jobs': []}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT))
        except Exception:
            pass
    known = {j['key']: j for j in old.get('jobs', []) if j.get('key')}

    found, errors, sources = [], [], []
    if reed_key:
        sources.append('Reed')
    if az_id and az_key:
        sources.append('Adzuna')
    if not sources:
        errors.append('No API keys set. Add REED_API_KEY and/or ADZUNA_APP_ID + ADZUNA_APP_KEY as GitHub secrets.')
    for q in cfg.get('searches', [])[:10]:
        if reed_key:
            try:
                found += reed(q, cfg, reed_key)
            except Exception as e:
                errors.append(f'Reed "{q}": {e}')
            time.sleep(1)
        if az_id and az_key:
            try:
                found += adzuna(q, cfg, az_id, az_key)
            except Exception as e:
                errors.append(f'Adzuna "{q}": {e}')
            time.sleep(1)

    exclude = [w.lower() for w in cfg.get('exclude', [])]
    stamp = NOW.isoformat(timespec='seconds')
    added = 0
    for j in found:
        if not j['title'] or any(w in j['title'].lower() for w in exclude):
            continue
        key = norm(j['title']) + '|' + norm(j['company'])
        if key in known:
            k = known[key]
            k['lastSeen'] = stamp
            k.setdefault('sources', [])
            if j['source'] not in k['sources']:
                k['sources'].append(j['source'])
            for f in ('pay', 'snippet', 'type', 'posted', 'url'):
                if not k.get(f) and j.get(f):
                    k[f] = j[f]
        else:
            j.update(key=key, firstSeen=stamp, lastSeen=stamp, sources=[j['source']])
            known[key] = j
            added += 1

    cutoff = (NOW - timedelta(days=cfg.get('keep_days', 45))).isoformat()
    jobs = [j for j in known.values() if (j.get('lastSeen') or '') >= cutoff]
    jobs.sort(key=lambda j: (j.get('posted') or j.get('firstSeen') or ''), reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'updated': stamp, 'sources': sources, 'added': added, 'errors': errors[:10], 'jobs': jobs[:600]},
              open(OUT, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(found)} results, {added} new, {len(jobs)} kept. Sources: {sources or "none"}.')
    for e in errors:
        print('WARN', e, file=sys.stderr)


if __name__ == '__main__':
    main()
