"""Run the same fixture checks in an installed Chromium dedicated worker."""
import json,threading,sys
import xml.etree.ElementTree as ET
from pathlib import Path
from indexed_range_server import server
from playwright.sync_api import sync_playwright
s=server();threading.Thread(target=s.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{s.server_address[1]}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page();page.goto(base+'/README.md')
        for name in ['src/viewer-2d/netcdf.js','src/viewer-2d/indexed-range.js','tests/indexed-range-runtime.js']:
            page.add_script_tag(url=base+'/'+name)
        result=page.evaluate('''async base => await runRangeSuite(base,()=>new Worker(base+'/src/viewer-2d/indexed-range-worker.js'))''',base)
        if len(sys.argv)>1:
            suite=ET.Element('testsuite',name='Chromium exact producer indexed range runtime',tests=str(len(result['checks'])),failures='0',skipped='0')
            for label in result['checks']:ET.SubElement(suite,'testcase',name=label,classname='indexedRange.chromium')
            ET.ElementTree(suite).write(sys.argv[1],encoding='utf-8',xml_declaration=True)
        result['chromium']=browser.version;print(json.dumps(result,indent=2));browser.close()
finally:s.shutdown()
