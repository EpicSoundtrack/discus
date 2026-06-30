import json
import win32pipe
import win32file
import pywintypes

PIPE_NAME = r'\\.\pipe\discus'
BUFFER_SIZE = 65536

class DiscusPipe:
    def __init__(self):
        self._handle = None
        self._buf = b''

    def start(self):
        self._handle = win32pipe.CreateNamedPipe(
            PIPE_NAME,
            win32pipe.PIPE_ACCESS_DUPLEX,
            win32pipe.PIPE_TYPE_BYTE | win32pipe.PIPE_READMODE_BYTE | win32pipe.PIPE_WAIT,
            1,  # max instances
            BUFFER_SIZE,
            BUFFER_SIZE,
            0,
            None,
        )
        win32pipe.ConnectNamedPipe(self._handle, None)

    def send(self, obj):
        data = (json.dumps(obj) + '\n').encode('utf-8')
        win32file.WriteFile(self._handle, data)

    def recv_messages(self):
        """Generator: yields parsed message dicts as they arrive."""
        while True:
            try:
                _, data = win32file.ReadFile(self._handle, BUFFER_SIZE)
            except pywintypes.error:
                return
            self._buf += data
            while b'\n' in self._buf:
                line, self._buf = self._buf.split(b'\n', 1)
                if line.strip():
                    yield json.loads(line)

    def close(self):
        if self._handle:
            win32file.CloseHandle(self._handle)
            self._handle = None
