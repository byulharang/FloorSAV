"""Run the research renderer's scene, audio and drawing code at arbitrary times.

The native artist constructors and constants are reused verbatim. Only their time
sampling changes. Static geometry is cached; animated artists retain the native
z-order, colors, sizes, labels, gradient FoV and optional fading 15-second trail.
"""
import ast
import copy
import inspect
import math

import numpy as np
from PIL import Image, ImageOps
from matplotlib.patches import Wedge
from matplotlib.text import Annotation


class NativeMapRenderer:
    def __init__(self, native, scene, start, fps=20):
        self.native = native
        self.fps = fps
        self.namespace = dict(native.__dict__)
        tree = ast.parse(inspect.getsource(native.process_scene))
        original = tree.body[0]
        loop_index = next(i for i, node in enumerate(original.body)
                          if isinstance(node, ast.For) and isinstance(node.target, ast.Name)
                          and node.target.id == 'i')
        loop = original.body[loop_index]
        figure_index = next(i for i, node in enumerate(loop.body)
                            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Tuple)
                            and [n.id for n in node.targets[0].elts] == ['fig', 'ax'])
        output_index = next(i for i, node in enumerate(loop.body)
                            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
                            and node.targets[0].id == 'out_path')
        # Keep the original preprocessing and native figure creation unmodified.
        prepare = copy.deepcopy(original)
        prepare.name = '_prepare'
        prepare.body = prepare.body[:loop_index] + ast.parse('return locals()').body
        state = ast.parse('def _state(t_mid):\n    pass').body[0]
        assert [node.targets[0].id for node in loop.body[:3]] == ['t_start', 't_end', 't_mid']
        state.body = (ast.parse(f't_start = t_mid - {0.5/fps}\nt_end = t_mid + {0.5/fps}').body
                      + copy.deepcopy(loop.body[3:figure_index])
                      + ast.parse('return locals()').body)
        drawing = ast.parse('def _drawing():\n    pass').body[0]
        drawing.body = copy.deepcopy(loop.body[figure_index:output_index]) + ast.parse('return locals()').body
        module = ast.fix_missing_locations(ast.Module(body=[prepare, state, drawing], type_ignores=[]))
        exec(compile(module, inspect.getfile(native) + ':website-adapter', 'exec'), self.namespace)
        self.data = self.namespace['_prepare'](native.AEA_BASE / scene, dot_mode='mean1s')
        if not isinstance(self.data, dict):
            raise ValueError(f'Native renderer could not load {scene}')
        self.namespace.update(self.data)
        self.origin = self.data['video_start']
        state = self.frame_state(start)
        self.namespace.update(state)
        drawing = self.namespace['_drawing']()
        self.fig, self.ax = drawing['fig'], drawing['ax']
        self.fig.set_dpi(120)  # Original savefig resolution.
        self.fig.canvas.draw()
        bbox = self.fig.get_tightbbox(self.fig.canvas.get_renderer()).padded(.1)
        dpi = self.fig.dpi
        height = self.fig.canvas.get_width_height()[1]
        self.crop = (math.floor(bbox.x0*dpi), math.floor(height-bbox.y1*dpi),
                     math.ceil(bbox.x1*dpi), math.ceil(height-bbox.y0*dpi))
        cw, ch = self.crop[2]-self.crop[0], self.crop[3]-self.crop[1]
        self.fit = ImageOps.contain(Image.new('RGB', (cw, ch)), (720,720)).size
        self.offset = ((720-self.fit[0])//2, (720-self.fit[1])//2)
        self.wedges = [p for p in self.ax.patches if isinstance(p, Wedge)]
        self.arrow = next(t for t in self.ax.texts if isinstance(t, Annotation))
        self.camera = next(c for c in self.ax.collections if c.get_label() == 'Camera')
        sound = [c for c in self.ax.collections if c.get_zorder() == 12]
        self.sound = sound[0] if sound else self.ax.scatter(
            [], [], color='green', s=native.HP_AUDIO_SCATTER_S, zorder=12,
            edgecolors='white', linewidths=2.0)
        self.trail = list(self.ax.lines)
        # Object labels and dots are foreground, above the FoV just as in the source.
        self.foreground = self.wedges + list(self.ax.texts) + [
            c for c in self.ax.collections if c.get_zorder() >= 7]
        for artist in self.foreground + self.trail:
            artist.set_animated(True)
        self.fig.canvas.draw()
        self.background = self.fig.canvas.copy_from_bbox(self.fig.bbox)

    def frame_state(self, source_time):
        return self.namespace['_state'](self.origin + source_time)

    def coordinates(self, point):
        x, y = self.ax.transData.transform(point)
        height = self.fig.canvas.get_width_height()[1]
        x = (x-self.crop[0])*self.fit[0]/(self.crop[2]-self.crop[0])+self.offset[0]
        y = (height-y-self.crop[1])*self.fit[1]/(self.crop[3]-self.crop[1])+self.offset[1]
        return [round(float(x)/7.2, 3), round(float(y)/7.2, 3)]

    def canvas_image(self, fig=None):
        fig = fig or self.fig
        image = Image.fromarray(np.asarray(fig.canvas.buffer_rgba())[:,:,:3].copy()).crop(self.crop)
        image = image.resize(self.fit, Image.Resampling.LANCZOS)
        square = Image.new('RGB', (720,720), 'white')
        square.paste(image, self.offset)
        return square

    def render(self, source_time):
        state = self.frame_state(source_time)
        pos = np.array([state['cx'], state['cy']])
        angle = state['fwd_angle_deg']
        for wedge in self.wedges:
            wedge.set_center(pos)
            wedge.set_theta1(angle-self.native.HP_FOV_HALF_ANGLE)
            wedge.set_theta2(angle+self.native.HP_FOV_HALF_ANGLE)
        self.camera.set_offsets([pos])
        self.arrow.set_position(pos)
        forward = np.array([state['fx_norm'], state['fy_norm']])
        self.arrow.xy = pos + forward*self.data['arrow_length']
        audio = state['rep_audio_pts']
        self.sound.set_offsets(np.array([[p[0],p[1]] for p in audio]).reshape(-1,2))
        if self.trail:
            times = self.data['frame_times']
            ids = np.where((times >= state['t_mid']-15.0) & (times <= state['t_mid']))[0]
            positions = np.asarray([self.data['frame_mats'][i][:2,3] for i in ids])
            count = max(0,len(positions)-1)
            while len(self.trail) < count:
                line, = self.ax.plot([],[], color='#5C6BC0', zorder=3, solid_capstyle='round', animated=True)
                self.trail.append(line)
            for i, line in enumerate(self.trail):
                line.set_visible(i < count)
                if i < count:
                    # Exact native trail opacity / width ramp; positions sampled at this time.
                    progress = (i+1)/count
                    line.set_data(positions[i:i+2,0], positions[i:i+2,1])
                    line.set_alpha(.10+.40*progress)
                    line.set_linewidth(1.5+1.5*progress)
        self.fig.canvas.restore_region(self.background)
        for artist in sorted(self.trail+self.foreground, key=lambda a:a.get_zorder()):
            if artist.get_visible():
                self.ax.draw_artist(artist)
        return self.canvas_image(), state

    def reference_image(self, source_time):
        """A full native redraw to check cached-frame parity at the same timestamp."""
        self.namespace.update(self.frame_state(source_time))
        drawing = self.namespace['_drawing']()
        fig = drawing['fig']
        fig.set_dpi(120)
        fig.canvas.draw()
        image = self.canvas_image(fig)
        self.native.plt.close(fig)
        return image
