import sys
import json
import os


def main():
    from sidecar.pipe import DiscusPipe
    from sidecar.hasher import group_by_hash, _check_gpu
    from sidecar.ai import get_suggestion, check_api_key

    model = os.environ.get('DISCUS_MODEL', 'gpt-4o-mini')

    # Validate API key
    if not check_api_key():
        print(json.dumps({'type': 'error', 'message': 'DISCUS env var not set'}), flush=True)

    # Check GPU
    gpu_available = _check_gpu()

    # Start pipe — write sentinel first so Electron knows the pipe name is registered
    pipe = DiscusPipe()
    print('DISCUS_READY', flush=True)
    pipe.start()  # blocks until Electron connects

    # Send GPU status
    pipe.send({'type': 'gpu_status', 'mode': 'gpu' if gpu_available else 'cpu'})

    # Message loop
    total_skipped = 0
    try:
        for msg in pipe.recv_messages():
            msg_type = msg.get('type')

            if msg_type == 'batch':
                files = msg.get('files', [])
                # Build metadata lookup: path -> {size, mtime, ext}
                meta_by_path = {f['path']: {'size': f.get('size', 0), 'mtime': f.get('mtime', 0), 'ext': f.get('ext', '')} for f in files}

                pipe.send({'type': 'progress', 'stage': 'hashing', 'hashed': 0, 'total': len(files)})
                groups, skipped = group_by_hash(files)
                total_skipped += skipped
                pipe.send({'type': 'progress', 'stage': 'hashing', 'hashed': len(files), 'total': len(files)})

                pipe.send({'type': 'progress', 'stage': 'analyzing', 'analyzed': 0, 'total': len(groups)})
                for i, group in enumerate(groups):
                    file_meta_list = [{'path': p, **meta_by_path.get(p, {})} for p in group['files']]
                    ai_result = get_suggestion(
                        [f for f in files if f['path'] in group['files']],
                        model=model
                    )
                    pipe.send({
                        'type': 'group',
                        'group_type': group['group_type'],
                        'files': group['files'],
                        'fileMeta': file_meta_list,
                        'classification': ai_result['classification'],
                        'suggestion': ai_result['suggestion'],
                    })
                    pipe.send({'type': 'progress', 'stage': 'analyzing', 'analyzed': i + 1, 'total': len(groups)})

            elif msg_type == 'done':
                pipe.send({'type': 'complete', 'skipped': total_skipped})
                total_skipped = 0  # reset for next scan

            elif msg_type == 'shutdown':
                pipe.close()
                sys.exit(0)

    except Exception as e:
        try:
            pipe.send({'type': 'error', 'message': str(e)})
        except Exception:
            pass
    finally:
        pipe.close()


if __name__ == '__main__':
    main()
