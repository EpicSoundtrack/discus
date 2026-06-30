import os
import json
from openai import OpenAI


def check_api_key():
    key = os.environ.get('DISCUS', '').strip()
    return bool(key)


def get_suggestion(group_files, model='gpt-4o-mini'):
    """
    group_files: list of {path, size, mtime, ext}
    Returns {'classification': 'actionable'|'skip'|'unknown', 'suggestion': str|None}
    """
    api_key = os.environ.get('DISCUS', '').strip()
    if not api_key:
        return {'classification': 'unknown', 'suggestion': None}

    try:
        client = OpenAI(api_key=api_key)

        parts = []
        for f in group_files:
            name = os.path.basename(f['path'])
            dirname = os.path.basename(os.path.dirname(f['path']))
            parts.append(f"[{name}, {f['size']} bytes, {f['ext']}, modified {f['mtime']}, dir: {dirname}]")
        user_msg = "Duplicate group: " + ", ".join(parts) + ". Classify and suggest."

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": 'You are a file cleanup assistant. Given a group of duplicate files, do two things:\n1. Classify the group as \'actionable\' (user files worth cleaning up), \'skip\' (system/app artifacts), or \'unknown\'.\n2. If actionable, recommend which file to keep in one plain-text sentence.\n\nRespond in JSON: {"classification": "actionable"|"skip"|"unknown", "suggestion": "..." or null}'},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return {
            'classification': result.get('classification', 'unknown'),
            'suggestion': result.get('suggestion'),
        }
    except Exception:
        return {'classification': 'unknown', 'suggestion': None}
