"""Check the shipped table and real video bundle; export a portable source manifest."""
from pathlib import Path
from html.parser import HTMLParser
import csv
import hashlib
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = Path(os.environ.get('FLOORSAV_RESEARCH_ROOT', '/node_data/urp26wi_krkim/neurips'))
RELEASE = 'saved1988_ego2exo_out_set3_v1_20260925'

class TableReader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = self.in_cell = False
        self.rows = []
    def handle_starttag(self, tag, attrs):
        if tag == 'tbody': self.in_body = True
        if self.in_body and tag == 'tr': self.rows.append([])
        if self.in_body and tag in ('th', 'td'):
            self.in_cell = True
            self.rows[-1].append('')
    def handle_endtag(self, tag):
        if tag == 'tbody': self.in_body = False
        if tag in ('th', 'td'): self.in_cell = False
    def handle_data(self, data):
        if self.in_body and self.in_cell: self.rows[-1][-1] += data

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    csv_path = ROOT / 'assets/data/saved-bench.csv'
    source_csv = RESEARCH / 'saved_bench/reports/combined_scores_1988.csv'
    if source_csv.exists():
        assert csv_path.read_bytes() == source_csv.read_bytes(), 'Source report changed; review the release before updating the site.'
    rows = list(csv.DictReader(csv_path.open()))
    parser = TableReader()
    parser.feed((ROOT / 'index.html').read_text())
    reported = json.loads((ROOT / 'benchmark/results.json').read_text())['rows']
    assert len(reported) == len(parser.rows) == 13
    for source, html in zip(reported, parser.rows):
        baseline, floorsav, partial, full = source['scores']
        expected = [source['qa_count'], baseline, floorsav,
                    round(floorsav - baseline, 1), partial, full]
        actual = [float(v.strip()) for v in html[1:]]
        assert actual == expected, (source['task'], actual, expected)
    # Retain the original full-precision export as research provenance.
    assert len(rows) == 14
    data = json.loads((ROOT / 'assets/data/results.json').read_text())
    assert data['release'] == RELEASE
    for a, b in zip(rows, data['rows']):
        assert float(a['Map-task']) == b['floorsav'] and float(a['Baseline']) == b['baseline']
    task_rows = [r for r in rows if 'Overall' not in r['Category']]
    assert len(task_rows) == 9 and sum(int(r['# QAs']) for r in task_rows) == 1988
    media = []
    runtime = {}
    for name in ('viewpoint', 'region', 'path'):
        timing_path = ROOT / f'assets/data/{name}-timing.json'
        timing = json.loads(timing_path.read_text())
        duration = timing['end'] - timing['start']
        assert timing['fps'] == 20
        assert len(timing['samples']) == duration * 20
        assert timing['max_rgb_time_error_s'] < .001
        assert timing['audio_mean_half_window_s'] == 1.0
        assert len(timing['native_parity']) == 2
        assert all(check['mean_pixel_error'] < .25 for check in timing['native_parity'])
        if name == 'region':
            assert 'kitchen' in timing['regions']
        runtime[name] = {key: timing[key] for key in ('fps', 'objects', 'regions', 'samples')}
        for kind in ('ego', 'map'):
            file = ROOT / f'assets/media/{name}-{kind}.mp4'
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(file)]))
            video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            assert (video['width'], video['height'], video['r_frame_rate']) == (720, 720, '20/1')
            assert int(video['nb_frames']) == duration * 20
            assert abs(float(video['duration']) - duration) < .05
            keyframes = json.loads(subprocess.check_output(['ffprobe','-v','error','-skip_frame','nokey','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(file)]))['frames']
            times = [float(f['best_effort_timestamp_time']) for f in keyframes]
            assert max(b-a for a,b in zip(times,times[1:])) <= 2.001
            if kind == 'ego': assert any(s['codec_type'] == 'audio' for s in probe['streams'])
            media.append({'file':str(file.relative_to(ROOT)), 'sha256':digest(file), 'bytes':file.stat().st_size,
                          'case':name, 'qa':timing['qa'], 'scene':timing['scene'], 'source_interval_s':[timing['start'],timing['end']],
                          'fps':20, 'frames':duration*20, 'dimensions':[720,720],
                          'max_rgb_timestamp_error_s':timing['max_rgb_time_error_s']})
    (ROOT / 'assets/media-data.js').write_text('window.FLOORSAV_MEDIA='+json.dumps(runtime,separators=(',',':'))+';\n')
    manifest = {'benchmark_release':RELEASE,'results_source':'saved_bench/reports/combined_scores_1988.csv',
                'results_sha256':digest(csv_path), 'qualitative_source':'ICLR/rendered_assets/qualitative_joint_20260923/selected',
                'rgb_source':'savvy/SAVVY/data_utils/aea/aea_processed/{scene}/images',
                'map_source':'stageA/FloorSAV/ExpB/code/render_maps_36.py and render_maps_36_trail.py',
                'notes':['RGB is sampled from the original timestamped frames, not interpolated from the 128-frame model video.',
                         'The maps reuse the original Flash 3.6 renderer: point clouds, bold object labels, gradient FoV, red camera, green CDR estimate, and the native optional fading trail.',
                         'Map frames are rendered every 0.05 seconds, preserving the original mean1s audio window of plus/minus 1 second; these are not new audio predictions. The method animation is a separate schematic.',
                         'Qualitative examples are selected explanation reruns, not aggregate measurements or new model evaluations.',
                         'The path overlay uses estimated map positions; cited distances come from an independent GT geometry audit.'],
                'media':media}
    (ROOT / 'assets/data/provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'PASS: {len(reported)} reported table rows, 1,988 QAs, {len(media)} synchronized 20 fps clips; source manifest exported.')

if __name__ == '__main__': main()
