// SPDX-FileCopyrightText: 2026 Eidrien
// SPDX-License-Identifier: MIT
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

const declarations = 'uniform vec2 view_size; uniform vec4 bounds; uniform vec4 radii; uniform vec2 fade; uniform float rounded;';
// Clip the scrolled background as well as its contents to the theme's corners.
// CSS border-radius alone paints a rounded background but does not clip children.
const fragment = `
    vec2 p = cogl_tex_coord_in[0].xy * view_size;
    vec2 center = (bounds.xy + bounds.zw) * 0.5;
    vec2 half_size = max((bounds.zw - bounds.xy) * 0.5, vec2(0.0));
    float radius = p.x < center.x
        ? (p.y < center.y ? radii.x : radii.w)
        : (p.y < center.y ? radii.y : radii.z);
    radius = min(radius, min(half_size.x, half_size.y));
    vec2 q = abs(p - center) - half_size + vec2(radius);
    float distance = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
    if (p.x >= bounds.x && p.x <= bounds.z) {
        float alpha = rounded > 0.5 ? 1.0 - smoothstep(-0.75, 0.75, distance) : 1.0;
        if (fade.x > 0.0)
            alpha *= clamp((p.y - bounds.y) / fade.x, 0.0, 1.0);
        if (fade.y > 0.0)
            alpha *= clamp((bounds.w - p.y) / fade.y, 0.0, 1.0);
        cogl_color_out *= alpha;
    }
`;

function update(effect, modern) {
    if (!effect.box && !effect.viewOnly)
        return;
    const view = effect.get_actor();
    const node = (effect.box ?? view).get_theme_node();
    const [width, height] = view.get_size();
    const uniform = (name, values) => effect.set_uniform_float(
        modern ? name : effect.get_uniform_location(name), values.length, values);
    uniform('view_size', [width, height]);
    uniform('rounded', [effect.viewOnly ? 0 : 1]);
    const barWidth = view.vscrollbar_visible ? (view.vscroll?.width ?? 0) : 0;
    const rtl = view.text_direction === Clutter.TextDirection.RTL;
    uniform('bounds', effect.viewOnly ? [rtl ? barWidth : 0, 0, width - (rtl ? 0 : barWidth), height] :
        [node.get_margin(St.Side.LEFT), node.get_margin(St.Side.TOP),
            node.get_margin(St.Side.LEFT) + effect.box.width, height - node.get_margin(St.Side.BOTTOM)]);
    const adj = view.vadjustment;
    const [found, length] = view.get_theme_node().lookup_length('-qs-fade-size', false);
    const depth = found ? length : 0;
    uniform('fade', [Math.min(depth, Math.max(0, adj.value - adj.lower)),
        Math.min(depth, Math.max(0, adj.upper - adj.page_size - adj.value))]);
    uniform('radii', [St.Corner.TOPLEFT, St.Corner.TOPRIGHT, St.Corner.BOTTOMRIGHT, St.Corner.BOTTOMLEFT]
        .map(corner => node.get_border_radius(corner)));
}

// Shell 51 moved snippet effects out of Shell; keep the same rendering on both.
export const RoundedClip = Shell.GLSLEffect
    ? GObject.registerClass(class OverlayClipLegacy extends Shell.GLSLEffect {
        _init(box) { super._init(); this.box = box; this.viewOnly = box === null; }
        vfunc_build_pipeline() {
            this.add_glsl_snippet(Cogl.SnippetHook?.FRAGMENT ?? Shell.SnippetHook.FRAGMENT,
                declarations, fragment, false);
        }
        vfunc_paint_target(node, context) {
            update(this, false);
            super.vfunc_paint_target(node, context);
        }
    })
    : GObject.registerClass(class OverlayClipModern extends Clutter.ShaderEffect {
        _init(box) { super._init(); this.box = box; this.viewOnly = box === null; }
        vfunc_get_static_snippet() {
            return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, fragment);
        }
        vfunc_paint_target(node, context) {
            update(this, true);
            super.vfunc_paint_target(node, context);
        }
    });
