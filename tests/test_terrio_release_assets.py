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

class WheelAcquisitionTests(unittest.TestCase):
    """One reviewed wheel per platform, verified before it is given its name."""

    def setUp(self):
        import json
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.wheel = self.root/'src'/'terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_17_x86_64.whl'
        self.wheel.parent.mkdir()
        self.wheel.write_bytes(b'reviewed wheel')
        native = {'schema_version': 2, 'source_commit': r.COMMIT, 'version': '0.6.1',
                  'python_sha256': {'__init__.py': '0'*64},
                  'native': {'linux_x86_64': {'sys_platform': 'linux', 'machine': 'x86_64',
                                              'file': '_terrio.abi3.so', 'sha256': '1'*64,
                                              'wheel_platform': 'manylinux_2_17_x86_64'}}}
        release = {'schema_version': 2, 'source_commit': r.COMMIT, 'wheels': {'linux_x86_64': {
            'name': self.wheel.name, 'bytes': 14, 'sha256': r.digest(self.wheel)}}}
        self.native, self.release = self.root/'native.json', self.root/'release.json'
        self.native.write_text(json.dumps(native))
        self.release.write_text(json.dumps(release))

    def acquire(self, dest, **kw):
        kw.setdefault('key', 'linux_x86_64')
        return r.acquire_wheel(dest, release_lock=self.release, python_lock=self.native, **kw)

    def test_offline_and_download(self):
        got = self.acquire(self.root/'a', wheel=self.wheel)
        self.assertEqual(got.read_bytes(), b'reviewed wheel')
        def run(command, check):
            self.assertEqual(command[:9], ['gh', 'release', 'download', r.TAG, '--repo', r.REPO,
                                           '--pattern', self.wheel.name, '--dir'])
            import shutil
            shutil.copyfile(self.wheel, Path(command[-1])/self.wheel.name)
        with patch.object(r.subprocess, 'run', side_effect=run):
            self.assertEqual(self.acquire(self.root/'b').read_bytes(), b'reviewed wheel')

    def test_altered_renamed_existing_and_unknown_refused(self):
        self.wheel.write_bytes(b'altered wheel!')
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            self.acquire(self.root/'a', wheel=self.wheel)
        self.assertFalse((self.root/'a').exists())
        other = self.root/'other.whl'
        other.write_bytes(b'reviewed wheel')
        with self.assertRaisesRegex(ValueError, 'filename'):
            self.acquire(self.root/'b', wheel=other)
        (self.root/'c').mkdir()
        with self.assertRaisesRegex(ValueError, 'exist'):
            self.acquire(self.root/'c', wheel=self.wheel)
        with patch('pipeline.common.terrio_runtime.platform.machine', return_value='sparc64'),                 self.assertRaisesRegex(RuntimeError, 'No reviewed Terrio native artifact'):
            r.acquire_wheel(self.root/'d', release_lock=self.release, python_lock=self.native)
        self.assertFalse((self.root/'d').exists())


class CommittedLockTests(unittest.TestCase):
    def test_bundle_view_is_the_reviewed_windows_inventory(self):
        hashes = r.lock(Path(__file__).parents[1]/'pipeline/common/terrio-python.lock.json')
        self.assertEqual(hashes['_terrio.pyd'],
                         '9ce8973a9420707d94694f5f02df92ffaed19d7ad50c52692774ae26ec8a14d3')
        self.assertEqual(len(hashes), 51)

    def test_every_reviewed_native_has_exactly_one_released_wheel(self):
        import json
        root = Path(__file__).parents[1]/'pipeline/common'
        native = json.loads((root/'terrio-python.lock.json').read_text())
        release = json.loads((root/'terrio-release.lock.json').read_text())
        self.assertEqual(set(native['native']), set(release['wheels']))
        names = set()
        for key, wheel in release['wheels'].items():
            platform = native['native'][key]['wheel_platform']
            self.assertEqual(wheel['name'],
                             f"terrio-{release['wheel_version']}-cp310-abi3-{platform}.whl")
            self.assertRegex(wheel['sha256'], '^[0-9a-f]{64}$')
            names.add(wheel['name'])
        self.assertEqual(len(names), len(release['wheels']))


if __name__ == '__main__':
    unittest.main()
