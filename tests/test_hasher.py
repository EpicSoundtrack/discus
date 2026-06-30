import os
import tempfile
import unittest
from sidecar.hasher import _hash_file_cpu, _split_batches, _check_gpu, group_by_hash, MEMORY_CAP

class TestHasher(unittest.TestCase):
    def test_hash_file_cpu_identical_files_same_hash(self):
        with tempfile.NamedTemporaryFile(delete=False) as f1, \
             tempfile.NamedTemporaryFile(delete=False) as f2:
            f1.write(b'hello world')
            f2.write(b'hello world')
            f1.flush(); f2.flush()
        try:
            h1 = _hash_file_cpu(f1.name)
            h2 = _hash_file_cpu(f2.name)
            self.assertEqual(h1, h2)
            self.assertIsNotNone(h1)
        finally:
            os.unlink(f1.name); os.unlink(f2.name)

    def test_hash_file_cpu_different_files_different_hash(self):
        with tempfile.NamedTemporaryFile(delete=False) as f1, \
             tempfile.NamedTemporaryFile(delete=False) as f2:
            f1.write(b'hello world')
            f2.write(b'different content')
            f1.flush(); f2.flush()
        try:
            h1 = _hash_file_cpu(f1.name)
            h2 = _hash_file_cpu(f2.name)
            self.assertNotEqual(h1, h2)
        finally:
            os.unlink(f1.name); os.unlink(f2.name)

    def test_hash_file_cpu_missing_file_returns_none(self):
        result = _hash_file_cpu('/nonexistent/path/file.txt')
        self.assertIsNone(result)

    def test_split_batches_single_batch(self):
        files = [{'size': 100, 'path': 'a'}, {'size': 200, 'path': 'b'}]
        batches = _split_batches(files)
        self.assertEqual(len(batches), 1)
        self.assertEqual(len(batches[0]), 2)

    def test_split_batches_splits_at_cap(self):
        # Two files each slightly over half the cap
        half = MEMORY_CAP // 2 + 1
        files = [{'size': half, 'path': 'a'}, {'size': half, 'path': 'b'}]
        batches = _split_batches(files)
        self.assertEqual(len(batches), 2)

    def test_check_gpu_returns_bool(self):
        result = _check_gpu()
        self.assertIsInstance(result, bool)

    def test_group_by_hash_finds_duplicates(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as f1, \
             tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as f2, \
             tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as f3:
            f1.write(b'duplicate content')
            f2.write(b'duplicate content')
            f3.write(b'unique content')
            for f in (f1, f2, f3): f.flush()
        try:
            file_batch = [
                {'path': f1.name, 'size': 17, 'mtime': 0, 'ext': '.txt'},
                {'path': f2.name, 'size': 17, 'mtime': 0, 'ext': '.txt'},
                {'path': f3.name, 'size': 14, 'mtime': 0, 'ext': '.txt'},
            ]
            groups, skipped = group_by_hash(file_batch)
            self.assertEqual(len(groups), 1)
            self.assertEqual(groups[0]['group_type'], 'exact')
            self.assertIn(f1.name, groups[0]['files'])
            self.assertIn(f2.name, groups[0]['files'])
            self.assertEqual(skipped, 0)
        finally:
            os.unlink(f1.name); os.unlink(f2.name); os.unlink(f3.name)

if __name__ == '__main__':
    unittest.main()
