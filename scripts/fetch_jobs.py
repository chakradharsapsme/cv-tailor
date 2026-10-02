#!/usr/bin/env python3
"""
Daily job collector for Applywise. Free sources only, each with a hard budget so nothing can cost money:
  * Reed.co.uk Jobseeker API   (free key: https://www.reed.co.uk/developers/jobseeker)
  * Adzuna API                 (free app id + key: https://developer.adzuna.com)
  * Jooble API                 (free key, 500 requests for the life of the key: https://jooble.org/api/about)
  * Google Jobs through Apify  (your Apify account's free monthly credit; capped well below it)
    Google Jobs gathers adverts from LinkedIn, Indeed, Reed, Totaljobs, company sites and more,
    so LinkedIn adverts arrive without scraping LinkedIn itself.
Reads jobs.config.json, merges results into data/jobs.json (the website reads this file).
Keys come from environment variables (GitHub Actions secrets):
  REED_API_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY, JOOBLE_API_KEY, APIFY_TOKEN
A source without keys is skipped. Standard library only.
"""
import base64, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'jobs.config.json')
OUT = os.path.join(ROOT, 'data', 'jobs.json')
UA = 'CV-Tailor-job-collector/1.0 (personal job search; GitHub Actions)'
NOW = datetime.now(timezone.utc)


def http_json(url, headers=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    hdr = {'User-Agent': UA, 'Accept': 'application/json', **(headers or {})}
    if data is not None:
        hdr['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=hdr, method='POST' if data is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8', 'replace')[:300]
        except Exception:
            pass
        raise RuntimeError(f'HTTP {e.code}: {detail}') from None


def ago(text):
    """'3 days ago' / '5 hours ago' / '2026-09-30' -> YYYY-MM-DD"""
    t = str(text or '').lower()
    m = re.search(r'(\d{4}-\d{2}-\d{2})', t)
    if m:
        return m.group(1)
    m = re.search(r'(\d+)\+?\s*(minute|hour|day|week|month)', t)
    if not m:
        return ''
    n, unit = int(m.group(1)), m.group(2)
    days = {'minute': 0, 'hour': 0, 'day': n, 'week': 7 * n, 'month': 30 * n}[unit]
    return (NOW - timedelta(days=days)).strftime('%Y-%m-%d')


def todays(items, n):
    """A different slice of the searches each day, so a small daily budget still covers them all."""
    if not items or n <= 0:
        return []
    start = (NOW.timetuple().tm_yday * n) % len(items)
    return [items[(start + i) % len(items)] for i in range(min(n, len(items)))]


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


def relevant(title, cfg):
    """Keep only titles that mention at least one of your terms (job boards often return loosely related roles)."""
    terms = [t.lower() for t in cfg.get('title_must_include_any', [])]
    t = str(title or '').lower()
    return not terms or any(x in t for x in terms)


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


# ---------------------------------------------------------------- Jooble
def jooble(query, cfg, key):
    loc = cfg.get('location', '') or 'United Kingdom'
    data = http_json('https://jooble.org/api/' + urllib.parse.quote(key), body={'keywords': query, 'location': loc, 'ResultOnPage': 50})
    out = []
    for j in data.get('jobs', []) or []:
        out.append({
            'title': clean(j.get('title'), 200), 'company': j.get('company', '') or '', 'location': j.get('location', '') or '',
            'pay': clean(j.get('salary'), 80), 'url': j.get('link', ''), 'posted': ago(j.get('updated')),
            'source': 'Jooble', 'sourceId': str(j.get('id', '')), 'snippet': clean(j.get('snippet')),
            'type': j.get('type', '') or '', 'query': query
        })
    return out


# ---------------------------------------------------------------- Google Jobs via Apify (pay per result, hard-capped)
def apify_spent(token):
    """This month's Apify usage in US dollars (everything on the account, not just this robot)."""
    d = http_json('https://api.apify.com/v2/users/me/limits', {'Authorization': 'Bearer ' + token}).get('data', {})
    return float((d.get('current') or {}).get('monthlyUsageUsd') or 0), float((d.get('limits') or {}).get('maxMonthlyUsageUsd') or 5)


def apify_google(queries, cfg, token, per_query):
    a = cfg.get('apify', {})
    actor = a.get('actor', 'farside~google-jobs-scraper')
    loc = cfg.get('location', '')
    body = {'queries': queries, 'countryCode': a.get('country', 'uk'), 'maxResultsPerQuery': per_query,
            'postedWithinDays': a.get('posted_within_days', 7)}
    if loc and not re.fullmatch(r'(?i)united kingdom|uk', loc):
        body['location'] = loc
    # maxTotalChargeUsd and maxItems make Apify stop charging at that point, whatever the actor does.
    url = (f'https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?'
           + urllib.parse.urlencode({'maxItems': per_query * len(queries), 'maxTotalChargeUsd': a.get('max_charge_per_run_usd', 0.1), 'timeout': 240}))
    data = http_json(url, {'Authorization': 'Bearer ' + token}, body=body, timeout=270)
    out = []
    for j in (data if isinstance(data, list) else []):
        if not isinstance(j, dict) or j.get('isRunReport') or not j.get('title'):
            continue
        links = [l for l in (j.get('applyLinks') or []) if isinstance(l, dict)]
        link = next((l.get('url') or l.get('link') or l.get('href') for l in links if l.get('url') or l.get('link') or l.get('href')), '') or j.get('shareUrl') or ''
        lo, hi = j.get('salaryMin'), j.get('salaryMax')
        per = {'day': 'day', 'hour': 'hour', 'week': 'week', 'month': 'month'}.get(str(j.get('salaryType') or '').lower(), 'year')
        pay = money(lo, hi, per) if (j.get('salaryCurrency') or 'GBP') == 'GBP' else ''
        via = re.sub(r'(?i)^via\s+', '', str(j.get('via') or '')).strip()
        out.append({
            'title': clean(j.get('title'), 200), 'company': j.get('company') or '', 'location': j.get('location') or '',
            'pay': pay or clean(j.get('salaryRaw'), 80), 'url': link, 'posted': ago(j.get('postedAt') or j.get('postedRelative')),
            'source': 'Google Jobs' + (f' \u00b7 {via}' if via else ''), 'sourceId': str(j.get('jobId') or '')[:120],
            'snippet': clean(j.get('description') or j.get('descriptionSnippet')), 'type': j.get('employmentType') or '',
            'query': j.get('query') or ''
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

    jooble_key, apify_token = os.environ.get('JOOBLE_API_KEY', '').strip(), os.environ.get('APIFY_TOKEN', '').strip()
    usage = old.get('usage', {})  # running totals that keep every source inside its free allowance

    found, errors, sources = [], [], []
    if reed_key:
        sources.append('Reed')
    if az_id and az_key:
        sources.append('Adzuna')
    if not (reed_key or (az_id and az_key) or jooble_key or apify_token):
        errors.append('No keys set. Add REED_API_KEY, ADZUNA_APP_ID + ADZUNA_APP_KEY, JOOBLE_API_KEY or APIFY_TOKEN as GitHub secrets.')
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

    # Jooble: a free key allows 500 requests in its lifetime, so use a few a day and stop before the end.
    if jooble_key:
        jc = cfg.get('jooble', {})
        used = int(usage.get('jooble_requests', 0))
        left = int(jc.get('lifetime_limit', 480)) - used
        for q in todays(cfg.get('searches', []), min(int(jc.get('requests_per_day', 1)), max(0, left))):
            try:
                found += jooble(q, cfg, jooble_key)
                if 'Jooble' not in sources:
                    sources.append('Jooble')
            except Exception as e:
                errors.append(f'Jooble "{q}": {e}')
            used += 1
            time.sleep(1)
        usage['jooble_requests'] = used
        if left <= 0:
            errors.append('Jooble: the free key has used its 480 requests. Ask Jooble for a new free key to continue.')

    # Google Jobs through Apify: pay per result. Two guards keep it free: the robot checks the account's real
    # spending this month and stops below the budget, and every run carries its own maximum charge.
    if apify_token:
        ac = cfg.get('apify', {})
        budget = float(ac.get('monthly_budget_usd', 3.5))
        try:
            spent, limit = apify_spent(apify_token)
        except Exception as e:
            spent, limit = None, 5
            errors.append(f'Google Jobs: could not read Apify usage, skipped to be safe ({e})')
        if spent is not None:
            usage['apify_spent_usd'] = round(spent, 2)
            if spent >= min(budget, limit - 0.5):
                errors.append(f'Google Jobs: paused for this month (Apify usage ${spent:.2f} of the ${budget:.2f} budget). It restarts next month.')
            else:
                qs = todays(cfg.get('searches', []), int(ac.get('searches_per_day', 2)))
                try:
                    got = apify_google(qs, cfg, apify_token, int(ac.get('results_per_search', 10)))
                    found += got
                    sources.append('Google Jobs')
                    usage['apify_results'] = int(usage.get('apify_results', 0)) + len(got)
                except Exception as e:
                    errors.append(f'Google Jobs {qs}: {e}')

    exclude = [w.lower() for w in cfg.get('exclude', [])]
    stamp = NOW.isoformat(timespec='seconds')
    added = 0
    for j in found:
        if not j['title'] or any(w in j['title'].lower() for w in exclude) or not relevant(j['title'], cfg):
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
    jobs = [j for j in known.values() if (j.get('lastSeen') or '') >= cutoff and relevant(j.get('title'), cfg)]
    jobs.sort(key=lambda j: (j.get('posted') or j.get('firstSeen') or ''), reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'updated': stamp, 'sources': sources, 'added': added, 'errors': errors[:10], 'usage': usage, 'jobs': jobs[:600]},
              open(OUT, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(found)} results, {added} new, {len(jobs)} kept. Sources: {sources or "none"}.')
    for e in errors:
        print('WARN', e, file=sys.stderr)


if __name__ == '__main__':
    main()
