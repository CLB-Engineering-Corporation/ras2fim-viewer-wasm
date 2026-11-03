import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[1]/'scripts/terrio_release_assets.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.web = self.root/'web'
        self.native = self.root/'native'
        self.web.mkdir()
        self.native.mkdir()
        for n in (*r.LICENSES, 'terrio.js', 'terrio_bg.wasm'):
            (self.web/n).write_bytes(n.encode())
        for n in ('__init__.py', '_terrio.pyd', '_terrio.pyi', 'py.typed'):
            (self.native/n).write_bytes(n.encode())
        self.wl = {p.name: r.digest(p) for p in self.web.iterdir()}
        self.nl = {p.name: r.digest(p) for p in self.native.iterdir() if p.suffix in ('.py', '.pyd')}

    def make(self, name='bundle.zip', compression=zipfile.ZIP_STORED):
        out = self.root/name
        r.bundle(self.web, self.native, out, self.wl, self.nl, compression)
        return out

    def test_deterministic_and_roundtrip_both_modes(self):
        for mode in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            a = self.make(f'a{mode}.zip', mode)
            b = self.make(f'b{mode}.zip', mode)
            self.assertEqual(r.digest(a), r.digest(b))
            dest = self.root/f'extract{mode}'
            r.extract(a, r.digest(a), dest, self.wl, self.nl)
            self.assertEqual((dest/'python/terrio/_terrio.pyd').read_bytes(), b'_terrio.pyd')

    def test_external_hash_required(self):
        a = self.make()
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            r.extract(a, '0'*64, self.root/'out', self.wl, self.nl)
        self.assertFalse((self.root/'out').exists())

    def test_unsafe_paths(self):
        for n in ('../escape', '/root', 'C:/x', 'a\\b', 'a/./b', 'CON.txt', 'x.', 'a//b'):
            with self.subTest(n=n), self.assertRaises(ValueError):
                r.safe_name(n)

    def test_reject_duplicate_link_and_caps(self):
        for kind in ('duplicate', 'link', 'cap'):
            a = self.root/f'{kind}.zip'
            with zipfile.ZipFile(a, 'w') as z:
                if kind == 'duplicate':
                    z.writestr('A', b'a')
                    z.writestr('a', b'b')
                elif kind == 'link':
                    i = zipfile.ZipInfo('link')
                    i.create_system = 3
                    i.external_attr = 0o120777 << 16
                    z.writestr(i, b'target')
                else:
                    z.writestr('big', b'1234')
            with patch.object(r, 'MAX_FILE', 3), self.assertRaises(ValueError):
                r.extract(a, r.digest(a), self.root/'out', self.wl, self.nl)
            self.assertFalse((self.root/'out').exists())

    def test_changed_inner_lock_and_missing_license(self):
        a = self.make()
        wrong = dict(self.nl, **{'_terrio.pyd': '0'*64})
        with self.assertRaisesRegex(ValueError, 'inner lock'):
            r.extract(a, r.digest(a), self.root/'out', self.wl, wrong)
        self.assertFalse((self.root/'out').exists())
        (self.web/'NOTICE').unlink()
        with self.assertRaises(OSError):
            self.make('missing.zip')

    def test_extra_python_module_rejected(self):
        (self.native/'unexpected.py').write_text('bad')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            self.make()

    def test_remote_auth_download_and_import_handoff(self):
        import json
        for name, hashes in (('web.json', self.wl), ('native.json', self.nl)):
            (self.root/name).write_text(json.dumps({'source_commit': r.COMMIT, 'sha256': hashes}))
        a = self.make()
        calls = []
        def run(command, check):
            self.assertTrue(check)
            calls.append(command)
            if command[:3] == ['gh', 'release', 'download']:
                import shutil
                shutil.copyfile(a, Path(command[-1])/r.ASSET)
        dest = self.root/'out'
        native = self.root/'install'
        with patch.object(r.subprocess, 'run', side_effect=run):
            r.main(['--web-lock', str(self.root/'web.json'), '--python-lock', str(self.root/'native.json'),
                    'acquire', '--sha256', r.digest(a), '--destination', str(dest), '--native-destination', str(native)])
        self.assertEqual(calls[0], ['gh', 'auth', 'status'])
        self.assertEqual(calls[1][3:9], [r.TAG, '--repo', r.REPO, '--pattern', r.ASSET, '--dir'])
        self.assertEqual(calls[2], [r.sys.executable, '-m', 'pipeline.common.terrio_assets', '--package', str(dest/'web')])
        self.assertTrue((native/'terrio/_terrio.pyd').is_file())
        self.assertTrue((native/'licenses/NOTICE').is_file())

    def test_existing_destination_untouched(self):
        a = self.make()
        dest = self.root/'out'
        dest.mkdir()
        (dest/'keep').write_text('keep')
        with self.assertRaises(ValueError):
            r.extract(a, r.digest(a), dest, self.wl, self.nl)
        self.assertEqual((dest/'keep').read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
