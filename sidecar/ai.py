import os
from openai import OpenAI


def check_api_key():
    key = os.environ.get('DISCUS', '').strip()
    return bool(key)


def get_suggestion(group_files, model='gpt-4o-mini'):
    """
    group_files: list of {path, size, mtime, ext}
    Returns suggestion string or None on failure.
    """
    api_key = os.environ.get('DISCUS', '').strip()
    if not api_key:
        return None

    try:
        client = OpenAI(api_key=api_key)

        # Build user message — filenames and metadata only, NO full paths
        parts = []
        for f in group_files:
            name = os.path.basename(f['path'])
            parts.append(f"[{name}, {f['size']} bytes, {f['ext']}, modified {f['mtime']}]")
        user_msg = "Duplicate group: " + ", ".join(parts) + ". Which should be kept?"

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a file cleanup assistant. Given a group of duplicate files, recommend which to keep in one plain-text sentence with a brief reason."},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=150,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return None
