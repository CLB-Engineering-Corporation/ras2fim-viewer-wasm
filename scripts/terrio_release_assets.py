"""CLB release producer/acquirer: stdlib + authenticated gh; no fallback."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.common.terrio_runtime import load_lock, platform_key, platform_view  # noqa: E402

COMMIT = '9c644f4a1729e253f9714813912f54d32e306c38'
REPO = 'CLB-Engineering-Corporation/ras2fim-viewer-wasm'
TAG = 'viewer-runtime-9c644f4'
ASSET = 'terrio-viewer-runtime-9c644f4.zip'
RELEASE_LOCK = Path(__file__).resolve().parents[1]/'pipeline/common/terrio-release.lock.json'
# The runtime bundle carries the reviewed Windows extension; its inner Python
# inventory is the win_amd64 view of the multi-platform lock.
BUNDLE_PLATFORM = 'win_amd64'
LICENSES = ('LICENSE', 'NOTICE', 'LICENSE-THIRD-PARTY.md')
# 154,677,760 byte native extension plus ~14 MB WASM: bounded headroom.
MAX_TOTAL, MAX_FILE, MAX_ENTRIES = 256*1024*1024, 192*1024*1024, 1024


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_name(name):
    p = PurePosixPath(name)
    reserved = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{a}{i}' for a in ('COM', 'LPT') for i in range(10)}
    if (not name or name != p.as_posix() or p.is_absolute()
            or any(c in name for c in '\\:\x00')
            or any(x in ('.', '..') or x.endswith(('.', ' ')) or x.split('.')[0].upper() in reserved for x in p.parts)):
        raise ValueError(f'unsafe path: {name!r}')
    return name


def lock(path):
    obj = json.loads(Path(path).read_text(encoding='utf-8'))
    if obj.get('schema_version') == 2:
        obj = platform_view(load_lock(path), BUNDLE_PLATFORM)
    if obj.get('source_commit') != COMMIT or not obj.get('sha256'):
        raise ValueError('lock must identify reviewed source and hashes')
    for n, h in obj['sha256'].items():
        safe_name(n)
        if not re.fullmatch('[0-9a-f]{64}', h):
            raise ValueError('invalid inner digest')
    return obj['sha256']


def validate(root, web, native):
    m = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    if m.get('schema_version') != 1 or m.get('source_commit') != COMMIT:
        raise ValueError('invalid manifest')
    actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()} - {'manifest.json'}
    if set(m['files']) != actual:
        raise ValueError('incomplete inventory')
    for n, entry in m['files'].items():
        safe_name(n)
        if (root/n).stat().st_size != entry['size'] or digest(root/n) != entry['sha256']:
            raise ValueError(f'inventory mismatch: {n}')
    if not set(LICENSES) <= web.keys() or not {'__init__.py', '_terrio.pyd'} <= native.keys():
        raise ValueError('locks must include licenses, package and native extension')
    allowed = {'web/'+n for n in web} | {'python/terrio/'+n for n in native} | {'licenses/'+n for n in LICENSES}
    allowed |= {n for n in actual if n.startswith('python/terrio/') and (n.endswith('.pyi') or n == 'python/terrio/py.typed')}
    if actual != allowed:
        raise ValueError('unexpected files or missing package inventory')
    for prefix, hashes in (('web/', web), ('python/terrio/', native), ('licenses/', {n: web[n] for n in LICENSES})):
        for n, h in hashes.items():
            if digest(root/(prefix+n)) != h:
                raise ValueError(f'inner lock mismatch: {prefix+n}')


def extract(archive, expected, destination, web, native):
    if not re.fullmatch('[0-9a-f]{64}', expected) or digest(archive) != expected:
        raise ValueError('archive SHA256 mismatch: externally approved pin required')
    destination = Path(destination)
    if destination.exists():
        raise ValueError('destination must not exist')
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        names = [safe_name(i.filename) for i in entries]
        if len(entries) > MAX_ENTRIES or len({n.casefold() for n in names}) != len(names):
            raise ValueError('duplicate entries or entry cap exceeded')
        if sum(i.file_size for i in entries) > MAX_TOTAL:
            raise ValueError('expansion cap exceeded')
        for i in entries:
            if (i.is_dir() or stat.S_IFMT(i.external_attr >> 16) not in (0, stat.S_IFREG)
                    or i.file_size > MAX_FILE or i.flag_bits & 1
                    or i.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    or (i.filename == 'manifest.json' and i.file_size > 1024*1024)):
                raise ValueError('unsafe entry or size cap exceeded')
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=destination.parent.resolve(), prefix='.terrio-') as tmp:
            root = Path(tmp)/'bundle'
            root.mkdir()
            for i in entries:
                target = root/i.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(i) as source, target.open('xb') as out:
                    shutil.copyfileobj(source, out, 1024*1024)
            validate(root, web, native)
            root.rename(destination)


def bundle(web_root, native_root, output, web, native, compression):
    for source in web_root.rglob('*'):
        if source.is_symlink() or getattr(source, 'is_junction', lambda: False)():
            raise ValueError('source links prohibited')
    files = {'web/'+n: web_root/n for n in web}
    # Include all Python modules/type declarations, not PDBs or bytecode caches.
    for p in native_root.rglob('*'):
        if p.is_symlink() or getattr(p, 'is_junction', lambda: False)():
            raise ValueError('source links prohibited')
        if p.is_file() and (p.suffix in ('.py', '.pyi', '.pyd') or p.name == 'py.typed'):
            files['python/terrio/'+p.relative_to(native_root).as_posix()] = p
    files.update({'licenses/'+n: web_root/n for n in LICENSES})
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for n, source in files.items():
            safe_name(n)
            base = web_root if n.startswith(('web/', 'licenses/')) else native_root
            if source.is_symlink() or not source.resolve().is_relative_to(base.resolve()):
                raise ValueError('source escapes package')
            target = root/n
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        inventory = {n: {'size': (root/n).stat().st_size, 'sha256': digest(root/n)} for n in sorted(files)}
        (root/'manifest.json').write_text(json.dumps({'schema_version': 1, 'source_commit': COMMIT, 'files': inventory}, sort_keys=True, indent=2)+'\n', encoding='utf-8', newline='\n')
        validate(root, web, native)
        paths = sorted([*files, 'manifest.json'])
        if len(paths) > MAX_ENTRIES or sum((root/n).stat().st_size for n in paths) > MAX_TOTAL or any((root/n).stat().st_size > MAX_FILE for n in paths):
            raise ValueError('bundle exceeds extraction caps')
        with zipfile.ZipFile(output, 'x', compression=compression) as z:
            for n in paths:
                info = zipfile.ZipInfo(n, (1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = compression
                with (root/n).open('rb') as source, z.open(info, 'w') as out:
                    shutil.copyfileobj(source, out, 1024*1024)
    print(digest(output))


def acquire_wheel(destination, key=None, wheel=None, release_lock=RELEASE_LOCK, python_lock=None):
    """Download (or take offline) the reviewed wheel for one platform; verify before naming it."""
    native = load_lock(python_lock) if python_lock else load_lock()
    key = key or platform_key(native)
    release = json.loads(Path(release_lock).read_text(encoding='utf-8'))
    if release.get('schema_version') != 2:
        raise ValueError('release lock must be schema_version 2')
    if release.get('source_commit') != COMMIT or native['source_commit'] != COMMIT:
        raise ValueError('release and Python locks must identify the reviewed source')
    entry = release['wheels'][key]
    if not entry['name'].endswith(native['native'][key]['wheel_platform']+'.whl'):
        raise ValueError('release wheel does not match the reviewed native platform')
    destination = Path(destination)
    if destination.exists():
        raise ValueError('destination must not exist')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent.resolve(), prefix='.terrio-wheel-') as tmp:
        staged = Path(tmp)/'wheel'
        staged.mkdir()
        if wheel is None:
            subprocess.run(['gh', 'release', 'download', TAG, '--repo', REPO, '--pattern', entry['name'], '--dir', str(staged)], check=True)
        else:
            if Path(wheel).name != entry['name']:
                raise ValueError('offline wheel must carry the reviewed filename')
            shutil.copyfile(wheel, staged/entry['name'])
        got = staged/entry['name']
        if sorted(p.name for p in staged.iterdir()) != [entry['name']]:
            raise ValueError('unexpected download inventory')
        if got.stat().st_size != entry['bytes'] or digest(got) != entry['sha256']:
            raise ValueError(f'wheel SHA256 mismatch for {key}: reviewed pin required')
        staged.rename(destination)
    return destination/entry['name']


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    here = Path(__file__).resolve().parents[1]/'pipeline/common'
    p.add_argument('--web-lock', type=Path, default=here/'terrio-assets.lock.json')
    p.add_argument('--python-lock', type=Path, default=here/'terrio-python.lock.json')
    sub = p.add_subparsers(dest='command', required=True)
    b = sub.add_parser('bundle')
    for name in ('web', 'python', 'output'):
        b.add_argument('--'+name, type=Path, required=True)
    b.add_argument('--compression', choices=('stored', 'deflated'), default='stored')
    a = sub.add_parser('acquire')
    a.add_argument('--archive', type=Path, help='offline input; otherwise authenticated gh download')
    a.add_argument('--sha256', required=True, help='externally approved archive digest')
    a.add_argument('--destination', type=Path, required=True)
    a.add_argument('--native-destination', type=Path, help='new explicit import root containing terrio/ and licenses/')
    w = sub.add_parser('wheel', help='acquire the reviewed native wheel for one platform')
    w.add_argument('--destination', type=Path, required=True, help='new directory')
    w.add_argument('--platform', help='lock entry key; default: this interpreter')
    w.add_argument('--wheel', type=Path, help='offline input with the reviewed filename')
    args = p.parse_args(argv)
    if args.command == 'wheel':
        print(acquire_wheel(args.destination, args.platform, args.wheel, python_lock=args.python_lock))
        return 0
    web, native = lock(args.web_lock), lock(args.python_lock)
    if args.command == 'bundle':
        bundle(args.web, args.python, args.output, web, native, zipfile.ZIP_STORED if args.compression == 'stored' else zipfile.ZIP_DEFLATED)
        return 0
    if not re.fullmatch('[0-9a-f]{64}', args.sha256):
        raise ValueError('externally approved SHA256 required')
    with tempfile.TemporaryDirectory(prefix='terrio-download-') as tmp:
        archive = args.archive
        if archive is None:
            subprocess.run(['gh', 'auth', 'status'], check=True)
            subprocess.run(['gh', 'release', 'download', TAG, '--repo', REPO, '--pattern', ASSET, '--dir', tmp], check=True)
            archive = Path(tmp)/ASSET
        extract(archive, args.sha256, args.destination, web, native)
    if args.native_destination:
        dest = args.native_destination
        if dest.exists():
            raise ValueError('native destination must not exist; Python environment is never modified')
        dest.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=dest.parent, prefix='.terrio-native-') as tmp:
            staged = Path(tmp)/'native'
            shutil.copytree(args.destination/'python', staged)
            shutil.copytree(args.destination/'licenses', staged/'licenses')
            staged.rename(dest)
    subprocess.run([sys.executable, '-m', 'pipeline.common.terrio_assets', '--package', str(args.destination/'web')], check=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError, RuntimeError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        sys.exit(f'Terrio release acquisition failed; no fallback: {error}')
