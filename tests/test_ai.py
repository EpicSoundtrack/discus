import os
import json
import unittest
from unittest.mock import patch, MagicMock
from sidecar.ai import get_suggestion, check_api_key

class TestAI(unittest.TestCase):
    def test_check_api_key_false_when_not_set(self):
        with patch.dict(os.environ, {}, clear=True):
            # Remove DISCUS if present
            env = {k: v for k, v in os.environ.items() if k != 'DISCUS'}
            with patch.dict(os.environ, env, clear=True):
                self.assertFalse(check_api_key())

    def test_check_api_key_true_when_set(self):
        with patch.dict(os.environ, {'DISCUS': 'test-key'}):
            self.assertTrue(check_api_key())

    def test_get_suggestion_returns_unknown_when_no_key(self):
        env = {k: v for k, v in os.environ.items() if k != 'DISCUS'}
        with patch.dict(os.environ, env, clear=True):
            result = get_suggestion([{'path': 'C:\\a\\photo.jpg', 'size': 1000, 'mtime': 1700000000, 'ext': '.jpg'}])
            self.assertEqual(result, {'classification': 'unknown', 'suggestion': None})

    def test_get_suggestion_no_full_paths_in_prompt(self):
        """Verify full paths are never sent to OpenAI, dirnames appear, result has correct shape."""
        with patch.dict(os.environ, {'DISCUS': 'test-key'}):
            mock_response = MagicMock()
            mock_response.choices[0].message.content = json.dumps(
                {"classification": "actionable", "suggestion": "Keep the newer one."}
            )

            with patch('sidecar.ai.OpenAI') as MockOpenAI:
                mock_client = MagicMock()
                MockOpenAI.return_value = mock_client
                mock_client.chat.completions.create.return_value = mock_response

                files = [
                    {'path': 'C:\\Users\\charles\\Downloads\\photo.jpg', 'size': 3355443, 'mtime': 1700000000, 'ext': '.jpg'},
                    {'path': 'C:\\backup\\photo.jpg', 'size': 3355443, 'mtime': 1690000000, 'ext': '.jpg'},
                ]
                result = get_suggestion(files)

                call_kwargs = mock_client.chat.completions.create.call_args
                messages = call_kwargs[1]['messages']
                full_text = str(messages)

                # Full paths must not appear in the prompt
                self.assertNotIn('C:\\Users\\charles\\Downloads', full_text)
                self.assertNotIn('C:\\backup', full_text)
                # But filenames and dirnames should appear
                self.assertIn('photo.jpg', full_text)
                self.assertIn('Downloads', full_text)
                self.assertIn('backup', full_text)
                # Result has correct shape
                self.assertEqual(result['classification'], 'actionable')
                self.assertEqual(result['suggestion'], 'Keep the newer one.')

    def test_get_suggestion_returns_unknown_on_api_error(self):
        with patch.dict(os.environ, {'DISCUS': 'test-key'}):
            with patch('sidecar.ai.OpenAI') as MockOpenAI:
                mock_client = MagicMock()
                MockOpenAI.return_value = mock_client
                mock_client.chat.completions.create.side_effect = Exception('API error')

                result = get_suggestion([{'path': 'C:\\a\\file.txt', 'size': 100, 'mtime': 0, 'ext': '.txt'}])
                self.assertEqual(result, {'classification': 'unknown', 'suggestion': None})

    def test_get_suggestion_returns_skip_classification(self):
        """Mock returns skip classification."""
        with patch.dict(os.environ, {'DISCUS': 'test-key'}):
            mock_response = MagicMock()
            mock_response.choices[0].message.content = json.dumps(
                {"classification": "skip", "suggestion": None}
            )

            with patch('sidecar.ai.OpenAI') as MockOpenAI:
                mock_client = MagicMock()
                MockOpenAI.return_value = mock_client
                mock_client.chat.completions.create.return_value = mock_response

                files = [
                    {'path': 'C:\\Windows\\System32\\kernel32.dll', 'size': 512000, 'mtime': 1600000000, 'ext': '.dll'},
                ]
                result = get_suggestion(files)
                self.assertEqual(result['classification'], 'skip')
                self.assertIsNone(result['suggestion'])

if __name__ == '__main__':
    unittest.main()
