"""Loopback-only exact producer fixture HTTP206 adversarial server."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json,re,zlib,time
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures/indexed-range'
NC=(FIX/'tiny-depth-stack.nc').read_bytes()
METRICS={'objectRequests':0,'objectBodyBytes':0}
INDEX=json.loads((FIX/'tiny-depth-stack.ranges.json').read_text())
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        u=urlparse(self.path); mode=parse_qs(u.query).get('mode',['ok'])[0]
        if u.path=='/metrics':
            data=json.dumps(METRICS).encode();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
        if u.path=='/index':
            x=json.loads(json.dumps(INDEX))
            if mode=='indexoversize': data=b' '*1048577
            else:
                if mode=='overlap': x['chunks']['offsets'][1]=x['chunks']['offsets'][0]
                if mode=='outoffile': x['chunks']['offsets'][0]=len(NC)
                if mode=='filter': x['filters'][0]['element_size']=8
                if mode=='scale': x['variable']['scale_factor']=1
                if mode=='name': x['variable']['name']='wsel'
                if mode=='crs': x['grid']['crs']='EPSG:5070'
                if mode=='axis': x['profiles']['axis_semantics']='made_up'
                if mode=='fractional': x['chunks']['offsets'][0]+=.5
                if mode=='witnessbounds': x['object']['witness']['offset']=len(NC)-1
                if mode=='witnesstouch': x['object']['witness']['offset']=x['chunks']['offsets'][0]
                if mode=='type': x['variable']['dtype']='float64'
                if mode=='entries': x['chunks']['offsets']*=6000
                data=(FIX/'tiny-depth-stack.ranges.json').read_bytes() if mode in ('ok','slow') else json.dumps(x,separators=(',',':')).encode()
            self.send_response(200); self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
        if u.path=='/object':
            METRICS['objectRequests']+=1
            match=re.fullmatch(r'bytes=(\d+)-(\d+)',self.headers.get('Range',''))
            if not match: self.send_error(400);return
            start,end=map(int,match.groups()); witness=start==INDEX['object']['witness']['offset']
            # Require the reader to carry the captured ETag after the witness.
            if not witness and self.headers.get('If-Match')!='"fixture-v1"': self.send_error(412);return
            if mode=='416': self.send_error(416);return
            if mode=='slow' and not witness: time.sleep(.25)
            data=NC[start:end+1]
            if mode=='uuid' and witness:data=b'0'*len(data)
            if mode=='bomb' and not witness:data=zlib.compress(b'\0'*300000);data=data+b'\0'*max(0,end-start+1-len(data));data=data[:end-start+1]
            self.send_response(200 if mode=='200' else 206)
            self.send_header('Content-Range',f'bytes {start+1 if mode=="wrongrange" else start}-{end}/{len(NC)+1 if mode=="total" else len(NC)}')
            self.send_header('Content-Length',str(len(data)+1 if mode=='length' else len(data)))
            if mode=='encoding': self.send_header('Content-Encoding','identity')
            if mode!='missingetag':self.send_header('ETag','W/"weak"' if mode=='weaketag' else '"changed"' if mode=='etag' and not witness else '"fixture-v1"')
            self.end_headers()
            try:
                self.wfile.write(data[:-1] if mode=='truncated' else data);METRICS['objectBodyBytes']+=len(data)-int(mode=='truncated')
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
            self.close_connection=True;return
        p=(ROOT/u.path.lstrip('/')).resolve()
        if not p.is_relative_to(ROOT) or not p.is_file():self.send_error(404);return
        b=p.read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript' if p.suffix in ('.js','.mjs') else 'text/html');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
def server():return ThreadingHTTPServer(('127.0.0.1',0),Handler)
if __name__=='__main__':
    s=server();print(s.server_address[1],flush=True);s.serve_forever()
