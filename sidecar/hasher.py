import os
import xxhash
from concurrent.futures import ThreadPoolExecutor

LARGE_FILE_THRESHOLD = 500 * 1024 * 1024  # 500 MB
MEMORY_CAP = 2 * 1024 * 1024 * 1024       # 2 GB
CHUNK_SIZE = 64 * 1024                     # 64 KB
GPU_AVAILABLE = False


def _check_gpu():
    """Returns True if CUDA is available via cupy, False otherwise."""
    global GPU_AVAILABLE
    try:
        import cupy as cp
        cp.cuda.Device(0).compute_capability  # verify device exists
        GPU_AVAILABLE = True
    except Exception:
        GPU_AVAILABLE = False
    return GPU_AVAILABLE


def _hash_file_cpu(path):
    """Hash a single file using xxhash on CPU. Streams in chunks."""
    h = xxhash.xxh64()
    try:
        with open(path, 'rb') as f:
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _hash_files_gpu(paths):
    """Hash files using GPU via cupy + warp. Returns dict of path -> hex digest."""
    import cupy as cp
    import warp as wp

    @wp.kernel
    def xxhash64_kernel(data: wp.array(dtype=wp.uint8), size: int, out: wp.array(dtype=wp.uint64)):
        tid = wp.tid()
        if tid == 0:
            # Simplified placeholder — real implementation uses full xxHash64
            h = wp.uint64(14695981039346656037)
            for i in range(size):
                h = h ^ wp.uint64(data[i])
                h = h * wp.uint64(1099511628211)
            out[0] = h

    results = {}

    def read_file(path):
        try:
            with open(path, 'rb') as f:
                return path, f.read()
        except OSError:
            return path, None

    with ThreadPoolExecutor() as executor:
        file_data = dict(executor.map(read_file, paths))

    for path, data in file_data.items():
        if data is None:
            results[path] = None
            continue
        gpu_data = wp.array(list(data), dtype=wp.uint8)
        out = wp.zeros(1, dtype=wp.uint64)
        wp.launch(xxhash64_kernel, dim=1, inputs=[gpu_data, len(data), out])
        results[path] = hex(int(out.numpy()[0]))[2:]

    return results


def _split_batches(files):
    """Split file list into sub-batches respecting MEMORY_CAP."""
    batches = []
    current = []
    current_size = 0
    for f in files:
        size = f.get('size', 0)
        if current_size + size > MEMORY_CAP and current:
            batches.append(current)
            current = [f]
            current_size = size
        else:
            current.append(f)
            current_size += size
    if current:
        batches.append(current)
    return batches


def _phash_group(paths):
    """
    Given a list of image paths that are exact duplicates,
    return sub-groups of near-duplicates (Hamming distance <= 10).
    Returns list of lists (each sub-list is a near-duplicate group).
    """
    from PIL import Image
    import imagehash

    IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    hashes = {}
    for path in paths:
        ext = os.path.splitext(path)[1].lower()
        if ext not in IMAGE_EXTS:
            continue
        try:
            with Image.open(path) as img:
                hashes[path] = imagehash.phash(img)
        except Exception:
            pass

    if not hashes:
        return [paths]

    groups = []
    seen = set()
    path_list = list(hashes.keys())
    for i, p in enumerate(path_list):
        if p in seen:
            continue
        group = [p]
        seen.add(p)
        for j in range(i + 1, len(path_list)):
            q = path_list[j]
            if q not in seen and (hashes[p] - hashes[q]) <= 10:
                group.append(q)
                seen.add(q)
        groups.append(group)
    return groups


def group_by_hash(file_batch):
    """
    Takes a list of file metadata dicts: [{path, size, mtime, ext}, ...]
    Returns (groups, skipped) where groups is a list of:
      {'group_type': 'exact'|'near', 'files': [path, ...]}
    Only groups with 2+ files are returned.
    """
    large = [f for f in file_batch if f['size'] > LARGE_FILE_THRESHOLD]
    small = [f for f in file_batch if f['size'] <= LARGE_FILE_THRESHOLD]

    hash_map = {}  # hash -> [path]
    skipped = 0

    # Hash large files on CPU
    for f in large:
        h = _hash_file_cpu(f['path'])
        if h is None:
            skipped += 1
        else:
            hash_map.setdefault(h, []).append(f['path'])

    # Hash small files: GPU if available, else CPU threadpool
    sub_batches = _split_batches(small)
    for batch in sub_batches:
        paths = [f['path'] for f in batch]
        if GPU_AVAILABLE:
            try:
                gpu_results = _hash_files_gpu(paths)
                for path, h in gpu_results.items():
                    if h is None:
                        skipped += 1
                    else:
                        hash_map.setdefault(h, []).append(path)
            except Exception:
                # Fall back to CPU if GPU fails
                for path in paths:
                    h = _hash_file_cpu(path)
                    if h is None:
                        skipped += 1
                    else:
                        hash_map.setdefault(h, []).append(path)
        else:
            with ThreadPoolExecutor() as executor:
                results = list(executor.map(_hash_file_cpu, paths))
            for path, h in zip(paths, results):
                if h is None:
                    skipped += 1
                else:
                    hash_map.setdefault(h, []).append(path)

    IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    groups = []
    for h, paths in hash_map.items():
        if len(paths) < 2:
            continue
        all_images = all(os.path.splitext(p)[1].lower() in IMAGE_EXTS for p in paths)
        if all_images:
            sub_groups = _phash_group(paths)
            for sg in sub_groups:
                if len(sg) >= 2:
                    groups.append({'group_type': 'near', 'files': sg})
        else:
            groups.append({'group_type': 'exact', 'files': paths})

    return groups, skipped
