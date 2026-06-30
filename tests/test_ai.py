import os
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

    def test_get_suggestion_returns_none_when_no_key(self):
        env = {k: v for k, v in os.environ.items() if k != 'DISCUS'}
        with patch.dict(os.environ, env, clear=True):
            result = get_suggestion([{'path': 'C:\\a\\photo.jpg', 'size': 1000, 'mtime': 1700000000, 'ext': '.jpg'}])
            self.assertIsNone(result)

    def test_get_suggestion_no_full_paths_in_prompt(self):
        """Verify full paths are never sent to OpenAI."""
        with patch.dict(os.environ, {'DISCUS': 'test-key'}):
            mock_response = MagicMock()
            mock_response.choices[0].message.content = 'Keep the newer one.'

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
                # But filenames should appear
                self.assertIn('photo.jpg', full_text)
                self.assertEqual(result, 'Keep the newer one.')

    def test_get_suggestion_returns_none_on_api_error(self):
        with patch.dict(os.environ, {'DISCUS': 'test-key'}):
            with patch('sidecar.ai.OpenAI') as MockOpenAI:
                mock_client = MagicMock()
                MockOpenAI.return_value = mock_client
                mock_client.chat.completions.create.side_effect = Exception('API error')

                result = get_suggestion([{'path': 'C:\\a\\file.txt', 'size': 100, 'mtime': 0, 'ext': '.txt'}])
                self.assertIsNone(result)

if __name__ == '__main__':
    unittest.main()
