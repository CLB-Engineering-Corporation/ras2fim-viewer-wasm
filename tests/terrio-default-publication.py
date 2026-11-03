"""Real-pilot default dispatch: installed wheel, exact tiles and supplied-array codec bounds.

Run with modern GDAL, Pillow/pmtiles and the reviewed native runtime installed.
Pairwise lossy encodings may differ by twice the codec bound; each writer must
meet the original bound against identical exact supplied arrays.
"""
import sys,io,json,shutil
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace as S
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from osgeo import gdal
from PIL import Image
from pmtiles.reader import Reader,all_tiles
from pipeline.fim1d import cogs,depth_pmtiles as tiles
source=sorted(Path('.terrio-validation/real-1d/cogs').rglob('depth_*.tif'))[-1].resolve()
root=Path('.terrio-validation/adoption-default-dispatch');root.mkdir(exist_ok=True)
def archive(p):
 body=p.read_bytes();read=lambda o,n:body[o:o+n]
 return Reader(read).header(),{tuple(k):np.asarray(Image.open(io.BytesIO(v)).convert('RGBA')) for k,v in all_tiles(read)}
record=tiles.build_profile(source,root/'depth_071.pmtiles',31.83563232421875)
assert record['provenance']['backend']=='terrio'
ah,a=archive(Path('.terrio-validation/real-tile-comparison/gdal')/source.with_suffix('.pmtiles').name)
bh,b=archive(record['pmtiles']);assert a.keys()==b.keys()
assert all(np.array_equal(a[k],b[k]) for k in a)
assert all(ah[k]==bh[k] for k in ['min_zoom','max_zoom','min_lon_e7','min_lat_e7','max_lon_e7','max_lat_e7'])
unit=S(unit_name='pilot',huc8='pilot',model_unit='ft',crs='EPSG:4326')
model=S(slug='pilot',model_id='pilot',name='pilot',profiles=[S(index=71,label='071',depth_tif=source)])
original=cogs.cp.finish_cog
counter=[0]
def capture(stage,target,**kw):
 report=original(stage,target,**kw)
 shutil.copyfile(stage,root/f"reference-{counter[0]}.tif");counter[0]+=1
 return report
with patch.object(cogs.cp,'finish_cog',side_effect=capture):
 reports=[cogs.build_model(unit,model,root/'gdal',writer_backend='gdal',verbose=False,force=True), cogs.build_model(unit,model,root/'terrio',verbose=False,force=True)]
assert reports[1]['profiles'][0]['writer']['backend']=='terrio'
refs=[]
for name in ['gdal','terrio']:
 ds=gdal.Open(str(root/name/'pilot/pilot/depth_071.tif'));band=ds.GetRasterBand(1)
 refs.append((ds.GetGeoTransform(),ds.GetProjection(),ds.GetMetadata(),band.GetNoDataValue(),[band.ReadAsArray()]+[band.GetOverview(i).ReadAsArray() for i in range(band.GetOverviewCount())]))
assert refs[0][:4]==refs[1][:4];assert len(refs[0][4])==len(refs[1][4])
stages=[]
for i in range(2):
 ds=gdal.Open(str(root/f"reference-{i}.tif"));band=ds.GetRasterBand(1)
 stages.append([band.ReadAsArray()]+[band.GetOverview(j).ReadAsArray() for j in range(band.GetOverviewCount())])
assert len(stages[0])==len(stages[1]);assert all(np.array_equal(x,y) for x,y in zip(*stages))
errors=[]
for x,y in zip(refs[0][4],refs[1][4]):
 assert x.shape==y.shape;assert np.array_equal(x==-9999,y==-9999)
 errors.append(float(np.max(np.abs(x-y))))
writer_errors=[]
for i in range(2):
 row=[]
 for original,decoded in zip(stages[i],refs[i][4]):
  err=float(np.max(np.abs(original-decoded)));tol=.01+float(np.spacing(np.float32(np.max(np.abs(original)))))
  assert err<=tol,(i,err,tol);row.append(err)
 writer_errors.append(row)
print(json.dumps({'default_tiles':'exact full RGBA/bounds/zooms','tiles':len(a),'default_cog_writer':reports[1]['profiles'][0]['writer'],'lossy_writer_pair_errors':errors,'each_writer_vs_exact_supplied_arrays':writer_errors,'supplied_arrays_between_backends':'exact'},indent=2))
