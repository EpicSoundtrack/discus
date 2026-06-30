import json
import sys
import unittest
from unittest.mock import MagicMock, patch, call

# Mock win32 modules before importing pipe
sys.modules['win32pipe'] = MagicMock()
sys.modules['win32file'] = MagicMock()
sys.modules['pywintypes'] = MagicMock()

from sidecar.pipe import DiscusPipe

class TestDiscusPipe(unittest.TestCase):
    def test_send_encodes_json_with_newline(self):
        pipe = DiscusPipe()
        pipe._handle = MagicMock()
        with patch('sidecar.pipe.win32file') as mock_wf:
            pipe.send({'type': 'gpu_status', 'mode': 'gpu'})
            args = mock_wf.WriteFile.call_args[0]
            payload = args[1]
            assert payload.endswith(b'\n')
            assert json.loads(payload.strip()) == {'type': 'gpu_status', 'mode': 'gpu'}

    def test_recv_messages_yields_parsed_objects(self):
        pipe = DiscusPipe()
        pipe._handle = MagicMock()
        # Simulate two reads: first has a partial message, second completes it
        import pywintypes
        with patch('sidecar.pipe.win32file') as mock_wf, \
             patch('sidecar.pipe.pywintypes') as mock_py:
            mock_py.error = Exception
            data1 = b'{"type": "done"}\n{"type": "batch", '
            data2 = b'"files": []}\n'
            mock_wf.ReadFile.side_effect = [
                (0, data1),
                (0, data2),
                Exception('eof'),
            ]
            results = list(pipe.recv_messages())
            assert len(results) == 2
            assert results[0] == {'type': 'done'}
            assert results[1] == {'type': 'batch', 'files': []}

if __name__ == '__main__':
    unittest.main()
