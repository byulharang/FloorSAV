"""Build 20 fps website clips from timestamped AEA RGB and native map data.
Uses local research checkout; never modifies source data or benchmark runs.
Run with the savvy-bench Python environment.
"""
from pathlib import Path
import sys, json, inspect, importlib, subprocess, math, os
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Wedge, FancyArrowPatch
ROOT=Path(__file__).resolve().parents[1]
RESEARCH=Path(os.environ.get('FLOORSAV_RESEARCH_ROOT', '/node_data/urp26wi_krkim/neurips'))
SELECTED=RESEARCH/'ICLR/rendered_assets/qualitative_joint_20260923/selected'
sys.path.insert(0,str(RESEARCH/'stageA/FloorSAV/ExpB/code'))
CASES=[('viewpoint','01_dynamic_relativity',60,80),('region','02_regional',96,128),('path','03_navigational',118,134)]
FPS=20

def encoder(path,audio=None,start=0):
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','720x720','-framerate',str(FPS),'-i','pipe:0']
    if audio: cmd+=['-ss',str(start),'-i',str(audio),'-map','0:v:0','-map','1:a:0?','-c:a','aac','-b:a','128k','-shortest']
    cmd+=['-c:v','libx264','-threads','2','-preset','fast','-crf','23','-g',str(FPS*2),'-keyint_min',str(FPS),'-pix_fmt','yuv420p','-movflags','+faststart',str(path)]
    return subprocess.Popen(cmd,stdin=subprocess.PIPE)

def build(index):
    name,folder,start,end=CASES[index];case=SELECTED/folder
    media=json.loads((case/'media.json').read_text());q=json.loads((case/'qa.json').read_text())
    scene=q['video_id'].split('/')[-1]
    module=importlib.import_module('render_maps_36' if name=='region' else 'render_maps_36_trail');f=module.F
    f.OUTPUT_BASE=Path('/tmp/floorsav-render-cache')
    # Reuse exact point-cloud filtering, map bounds, object labels, CDR and pose processing.
    source=inspect.getsource(f.process_scene)
    source=source[:source.index('    window_size = total_duration / num_frames')]+'    return locals()\n'
    exec(compile(source,'<website-native-map-data>','exec'),f.__dict__)
    d=f.process_scene(f.AEA_BASE/scene,dot_mode='mean1s')
    fig,ax=plt.subplots(figsize=(7.2,7.2),dpi=100);fig.subplots_adjust(left=.07,right=.98,bottom=.07,top=.98)
    ax.set_xlim(d['x_min'],d['x_max']);ax.set_ylim(d['y_min'],d['y_max']);ax.set_aspect('equal')
    ax.scatter(d['px'],d['py'],s=.1,c='#35414a',alpha=.08,zorder=1)
    if d['dyn_rgba'] is not None: ax.imshow(d['dyn_rgba'],extent=[d['x_min'],d['x_max'],d['y_min'],d['y_max']],origin='lower',zorder=2)
    ax.grid(color='#dce2e8',linewidth=.7);ax.tick_params(labelsize=9,color='#bdc5ce');ax.spines[['top','right']].set_visible(False)
    texts=[];ys=[]
    for n,(key,(x,y)) in enumerate(d['scene_objects_static'].items()):
        if d['x_min']<=x<=d['x_max'] and d['y_min']<=y<=d['y_max']:
            ax.scatter(x,y,c=f.OBJ_DOT_PALETTE[n%len(f.OBJ_DOT_PALETTE)],s=30,edgecolors='white',zorder=9)
            import matplotlib.patheffects as pe
            texts.append(ax.text(x,y+.1,f.display_label(key),ha='center',va='bottom',fontsize=9,fontweight='medium',zorder=10,path_effects=[pe.withStroke(linewidth=2,foreground='white')]))
            ys.append(y)
    f.resolve_label_overlaps(fig,ax,texts,ys)
    fig.canvas.draw();bg=fig.canvas.copy_from_bbox(fig.bbox)
    coords=lambda p:[round(float(x),3) for x in (np.array([0,720])+ax.transData.transform(p)*[1,-1])/7.2]
    objects={key:coords(p) for key,p in d['scene_objects_static'].items()}
    radius=min(d['x_max']-d['x_min'],d['y_max']-d['y_min'])*.6
    wedge=Wedge((0,0),radius,0,0,color='#ffe55c',alpha=.22,animated=True)
    arrow=FancyArrowPatch((0,0),(0,0),arrowstyle='-|>',mutation_scale=18,color='#e14949',linewidth=2,animated=True)
    ax.add_patch(wedge);ax.add_patch(arrow)
    camera,=ax.plot([],[],'o',color='#e14949',markersize=8,markeredgecolor='white',animated=True)
    sound,=ax.plot([],[],'o',color='#139266',markersize=8,markeredgecolor='white',animated=True)
    trail,=ax.plot([],[],color='#7d93d9',alpha=.65,linewidth=2,animated=True)
    frames=d['frames'];ft=d['frame_times'];mats=np.array(d['frame_mats']);origin=ft[0]
    ego=encoder(ROOT/f'assets/media/{name}-ego.mp4',media['ego']['path'],start)
    mp=encoder(ROOT/f'assets/media/{name}-map.mp4')
    samples=[];max_error=0
    for i in range(round((end-start)*FPS)):
        t=start+i/FPS;absolute=origin+t;j=int(np.argmin(abs(ft-absolute)));fr=frames[j];mat=mats[j];pos=mat[:2,3];forward=mat[:2,2];angle=math.degrees(math.atan2(forward[1],forward[0]));max_error=max(max_error,abs(float(ft[j]-absolute)))
        with Image.open(f.AEA_BASE/scene/fr['image_path']) as im:
            rgb=im.transpose(Image.Transpose.ROTATE_270).convert('RGB').resize((720,720),Image.Resampling.LANCZOS)
        if i==0:rgb.save(ROOT/f'assets/media/{name}-poster.jpg',quality=88)
        ego.stdin.write(rgb.tobytes())
        fig.canvas.restore_region(bg)
        wedge.set_center(pos);wedge.set_theta1(angle-f.HP_FOV_HALF_ANGLE);wedge.set_theta2(angle+f.HP_FOV_HALF_ANGLE)
        arrow.set_positions(pos,pos+forward/(np.linalg.norm(forward)+1e-8)*radius*.13)
        camera.set_data([pos[0]],[pos[1]])
        mask=(ft>=absolute-15)&(ft<=absolute);trail.set_data(mats[mask,0,3],mats[mask,1,3])
        sel=[p for k,p in enumerate(d['audio_world_pts']) if p is not None and abs(d['audio_times'][k]-absolute)<=f.HP_AUDIO_MEAN_HALF_W]
        soundpos=None
        if sel:
            bearings=np.radians([p[3] for p in sel]);a=math.atan2(np.sin(bearings).mean(),np.cos(bearings).mean());r=np.mean([p[4] for p in sel]);soundpos=pos+r*np.array([math.cos(a),math.sin(a)]);sound.set_data([soundpos[0]],[soundpos[1]])
        else:sound.set_data([],[])
        for artist in [wedge,trail,arrow,camera,sound]:ax.draw_artist(artist)
        arr=np.asarray(fig.canvas.buffer_rgba())[:,:,:3].copy();mp.stdin.write(arr.tobytes())
        if i==0:Image.fromarray(arr).save(ROOT/f'assets/media/{name}-map-poster.jpg',quality=92)
        samples.append({'t':round(i/FPS,2),'camera':coords(pos),'sound':coords(soundpos) if soundpos is not None else None})
        if i%100==0:print(name,i,flush=True)
    for p in [ego,mp]:p.stdin.close();assert p.wait()==0
    payload={'case':name,'qa':q['id'],'scene':scene,'start':start,'end':end,'fps':FPS,'max_rgb_time_error_s':max_error,'objects':objects,'samples':samples,'source':{'rgb':str(f.AEA_BASE/scene),'map_renderer':str(Path(inspect.getfile(module))),'model_ego':media['ego']['path'],'model_map':media['map']['path']},'map_rendering':'Presentation redraw using native renderer preprocessing, 20 fps camera pose and original CDR sound estimates. Not a new model evaluation.'}
    (ROOT/f'assets/data/{name}-timing.json').write_text(json.dumps(payload,separators=(',',':')))
    print('DONE',name,flush=True)
if __name__=='__main__':build(int(sys.argv[1]))
