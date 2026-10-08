"""Build 20 fps clips with the original Flash 3.6 map renderer.

Run in the savvy-bench environment with the local research checkout available.
--maps-only preserves the already synchronized RGB/audio clips. The original
renderer and research data are read-only; temporary output goes under /tmp.
"""
from pathlib import Path
import argparse
import hashlib
import importlib
import inspect
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image
from native_map_renderer import NativeMapRenderer

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = Path(os.environ.get('FLOORSAV_RESEARCH_ROOT', '/node_data/urp26wi_krkim/neurips'))
SELECTED = RESEARCH/'ICLR/rendered_assets/qualitative_joint_20260923/selected'
sys.path.insert(0, str(RESEARCH/'stageA/FloorSAV/ExpB/code'))
CASES = [('viewpoint','01_dynamic_relativity',60,80), ('region','02_regional',96,128), ('path','03_navigational',118,134)]
FPS = 20


def encoder(path, audio=None, start=0):
    cmd = ['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24',
           '-video_size','720x720','-framerate',str(FPS),'-i','pipe:0']
    if audio:
        cmd += ['-ss',str(start),'-i',str(audio),'-map','0:v:0','-map','1:a:0?', '-c:a','aac','-b:a','128k','-shortest']
    cmd += ['-c:v','libx264','-threads','2','-preset','fast','-crf','20','-g',str(FPS*2),
            '-keyint_min',str(FPS),'-pix_fmt','yuv420p','-movflags','+faststart',str(path)]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def build(index, maps_only=False, preview=False):
    name, folder, start, end = CASES[index]
    case = SELECTED/folder
    media = json.loads((case/'media.json').read_text())
    qa = json.loads((case/'qa.json').read_text())
    scene = qa['video_id'].split('/')[-1]
    module = importlib.import_module('render_maps_36' if name == 'region' else 'render_maps_36_trail')
    native = module.F
    native.OUTPUT_BASE = Path('/tmp/floorsav-render-cache')
    renderer = NativeMapRenderer(native, scene, start, FPS)
    review = ROOT/'.review/native-maps'
    review.mkdir(parents=True, exist_ok=True)
    # Compare the cached renderer with a complete call to the original drawing code.
    parity = []
    for t in [start, start+5.5]:
        cached, _ = renderer.render(t)
        reference = renderer.reference_image(t)
        diff = np.abs(np.asarray(cached).astype(float)-np.asarray(reference).astype(float))
        parity.append({'source_time_s':t, 'mean_pixel_error':float(diff.mean()), 'max_pixel_error':int(diff.max())})
        cached.save(review/f'{name}-{t:.2f}-cached.png')
        reference.save(review/f'{name}-{t:.2f}-native.png')
        assert diff.mean() < .25, f'Native drawing parity failed: {parity[-1]}'
    print(json.dumps({'case':name, 'native_parity':parity}), flush=True)
    if preview:
        return
    data = renderer.data
    objects = {key:renderer.coordinates(point) for key,point in data['scene_objects_static'].items()}
    old = json.loads((ROOT/f'assets/data/{name}-timing.json').read_text())
    regions = {}
    if name == 'region':
        # Reproject the existing explanatory kitchen outline to the native viewport.
        corners = old.get('regions',{}).get('kitchen', [[13,27],[48,83]])
        keys = [key for key in objects if key in old['objects']]
        old_xy = np.array([old['objects'][key] for key in keys])
        new_xy = np.array([objects[key] for key in keys])
        transforms = [np.polyfit(old_xy[:,i],new_xy[:,i],1) for i in range(2)]
        regions['kitchen'] = [[round(float(np.polyval(transforms[i],point[i])),3) for i in range(2)] for point in corners]
    map_path = ROOT/f'assets/media/{name}-map.mp4'
    temporary = map_path.with_suffix('.building.mp4')
    mp = encoder(temporary)
    ego = None if maps_only else encoder(ROOT/f'assets/media/{name}-ego.mp4', media['ego']['path'],start)
    samples, max_error = [], 0
    try:
        for i in range(round((end-start)*FPS)):
            source_time = start+i/FPS
            image, state = renderer.render(source_time)
            frame_index = state['fi']
            max_error = max(max_error, abs(float(data['frame_times'][frame_index]-(renderer.origin+source_time))))
            if ego:
                frame = data['frames'][frame_index]
                with Image.open(native.AEA_BASE/scene/frame['image_path']) as original:
                    rgb = original.transpose(Image.Transpose.ROTATE_270).convert('RGB').resize((720,720), Image.Resampling.LANCZOS)
                ego.stdin.write(rgb.tobytes())
                if i == 0:
                    rgb.save(ROOT/f'assets/media/{name}-poster.jpg',quality=88)
            mp.stdin.write(image.tobytes())
            if i == 0:
                image.save(ROOT/f'assets/media/{name}-map-poster.jpg',quality=94)
            audio = state['rep_audio_pts']
            samples.append({'t':round(i/FPS,2), 'camera':renderer.coordinates([state['cx'],state['cy']]),
                            'sound':renderer.coordinates(audio[0][:2]) if audio else None})
            if i%100 == 0:
                print(f'{name}: {i}/{round((end-start)*FPS)} frames',flush=True)
        for process in [p for p in [ego,mp] if p]:
            process.stdin.close()
            assert process.wait() == 0
        temporary.replace(map_path)
    except BaseException:
        for process in [p for p in [ego,mp] if p]:
            if process.poll() is None:
                process.kill()
                process.wait()
        raise
    payload = {'case':name, 'qa':qa['id'], 'scene':scene, 'start':start, 'end':end, 'fps':FPS,
               'max_rgb_time_error_s':max_error, 'objects':objects, 'regions':regions, 'samples':samples,
               'source':{'rgb':str(native.AEA_BASE/scene), 'map_renderer':str(Path(inspect.getfile(module))),
                         'native_drawing':inspect.getfile(native),
                         'native_drawing_sha256':hashlib.sha256(Path(inspect.getfile(native)).read_bytes()).hexdigest(),
                         'objects':str(native.OBJECT_JSON),
                         'objects_sha256':hashlib.sha256(native.OBJECT_JSON.read_bytes()).hexdigest(),
                         'model_ego':media['ego']['path'], 'model_map':media['map']['path']},
               'audio_mean_half_window_s':native.HP_AUDIO_MEAN_HALF_W,
               'native_parity':parity,
               'map_rendering':'Original Flash 3.6 renderer, sampled at 20 fps with the original mean1s (±1 second) CDR/audio window. Native colors, sizes, labels, FoV and optional 15-second fading trail; no model rerun.'}
    (ROOT/f'assets/data/{name}-timing.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
    print(f'DONE {name}',flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('index',type=int,choices=range(len(CASES)))
    parser.add_argument('--maps-only',action='store_true')
    parser.add_argument('--preview',action='store_true')
    args = parser.parse_args()
    build(args.index,args.maps_only,args.preview)
