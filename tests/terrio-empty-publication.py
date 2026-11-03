"""Build a synthetic dry / real wet static release for browser transition checks."""
import json
import shutil
from pathlib import Path

from osgeo import gdal

from pipeline.fim1d.depth_pmtiles import build_profile
from pipeline.fim1d.site import build

root = Path('.terrio-validation')
source = root / 'empty-source'
source.mkdir(exist_ok=True)
for name in ('index.html', 'app.js', 'styles.css'):
    shutil.copy2(Path('src/viewer-1d') / name, source / name)
shutil.copytree(root / 'real-1d/vendor', source / 'vendor', dirs_exist_ok=True)
manifest = json.loads((root / 'real-1d/manifest.json').read_text())
unit = manifest['units'][0]
model = unit['models'][0]
profiles = model['fim']['profiles']
wet = dict(profiles[0])
dry = dict(profiles[1])
wet['label'] = 'real-wet-control'
dry.update(label='synthetic-all-dry', depth_empty=True, depth_max_ft=0)
for entry in (wet, dry):
    (source / entry['depth_pmtiles']).parent.mkdir(parents=True, exist_ok=True)
wet_archive = source / wet['depth_pmtiles']
shutil.copy2(root / 'real-tile-comparison/gdal/depth_000.pmtiles', wet_archive)
wet['depth_pmtiles_bytes'] = wet_archive.stat().st_size
base = gdal.Open(str(root / 'real-1d' / wet['cog']))
dry_cog = source / 'synthetic-dry.tif'
ds = gdal.GetDriverByName('GTiff').Create(str(dry_cog), base.RasterXSize, base.RasterYSize, 1, gdal.GDT_Float32)
ds.SetGeoTransform(base.GetGeoTransform())
ds.SetProjection(base.GetProjection())
ds.GetRasterBand(1).SetNoDataValue(-9999)
ds.GetRasterBand(1).Fill(-9999)
ds = None
report = build_profile(dry_cog, source / dry['depth_pmtiles'], 0)
dry['depth_pmtiles_bytes'] = report['bytes']
model['fim'].update(profiles=[wet, dry], profile_count=2, profile_range=[0, 1])
unit['models'] = [model]
vector = source / unit['pmtiles']
vector.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(root / 'real-1d' / unit['pmtiles'], vector)
(source / 'manifest.json').write_text(json.dumps(manifest))
print(json.dumps(build(source, root / 'empty-site'), indent=2))
