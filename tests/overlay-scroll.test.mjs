// SPDX-FileCopyrightText: 2026 Eidrien
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// Execute the production module with actor doubles. Native probes cover real
// GI allocation, grabs, shaders and signals; these tests exercise ownership and
// geometry edge cases without requiring a running GNOME session.
class Actor {
    constructor(props = {}) { this.children = []; this.style = null; this.translation_y = 0; Object.assign(this, props); }
    get_children() { return [...this.children]; }
    get_parent() { return this.parent; }
    add_child(child) { this.insert_child_at_index(child, this.children.length); }
    insert_child_at_index(child, index) { assert.ok(!child.parent); this.children.splice(index, 0, child); child.parent = this; }
    remove_child(child) { assert.equal(child.parent, this); this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
    destroy() { this.destroyed = true; for (const child of this.children) child.destroy(); }
    queue_relayout() {}
    add_effect_with_name(name, effect) { this.effect = effect; }
    vfunc_get_preferred_height() { return [0, 1000]; }
    has_allocation() { return true; }
    get_transformed_position() { return [0, this.y + this.translation_y]; }
    get_transformed_size() { return [100, this.height]; }
    get_theme_node() { return {adjust_preferred_height: () => [0, 20]}; }
}
const Clutter = {BinLayout: class {}, ScrollDirection: {SMOOTH: 0, UP: 1, DOWN: 2, LEFT: 3}};
const code = readFileSync(new URL('../lib/overlay-scroll.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const {HeightLimit, OverlayScroll, canScroll, scrollDelta, boundedDelta} = new Function('Clutter', 'GObject', 'St', 'RoundedClip',
    `${code}\nreturn {HeightLimit, OverlayScroll, canScroll, scrollDelta, boundedDelta};`)(Clutter, {registerClass: c => c},
    {ScrollView: Actor, Viewport: Actor, PolicyType: {NEVER: 0, EXTERNAL: 1}}, class {constructor(box) { this.box = box; }});

function fixture() {
    const actor = new Actor({y: 300, height: 250, visible: true});
    const box = new Actor(), first = new Actor(), last = new Actor();
    actor.add_child(first); actor.add_child(box); actor.add_child(last);
    actor._delegate = {box};
    return {actor, box, first, last};
}

test('height limit preserves existing and concurrently added styles', () => {
    const actor = {style: 'color: red;'};
    const limit = new HeightLimit(actor);
    limit.set(200); limit.set(100);
    assert.equal((actor.style.match(/max-height/g) || []).length, 1);
    actor.style += ' padding: 2px;';
    limit.set(150); limit.restore();
    assert.equal(actor.style, 'color: red; padding: 2px;');
});
test('height limit restores null and never clobbers an external replacement', () => {
    const actor = {style: null}, limit = new HeightLimit(actor);
    limit.set(100); limit.restore(); assert.equal(actor.style, null);
    limit.set(100); actor.style = 'color: blue;'; limit.restore();
    assert.equal(actor.style, 'color: blue;');
});
test('overlay preserves box identity and exact child order on repeated teardown', () => {
    const {actor, box, first, last} = fixture();
    const patch = new OverlayScroll(actor);
    assert.equal(actor._delegate.box, box);
    assert.equal(box.get_parent(), patch.viewport);
    patch.destroy(); patch.destroy();
    assert.deepEqual(actor.get_children(), [first, box, last]);
    assert.equal(box.destroyed, undefined);
    assert.equal(actor.style, null);
});
test('constraint uses physical pixels for allocation and logical pixels for CSS', () => {
    const patch = new OverlayScroll(fixture().actor);
    patch.clamp(500, 2);
    assert.equal(patch.view._limit, 480);
    assert.match(patch.actor.style, /max-height: 250px/);
    assert.deepEqual(patch.view.vfunc_get_preferred_height(-1), [480, 480]);
    patch.clamp(NaN, 2);
    assert.equal(patch.view._limit, 480);
    patch.destroy();
});
test('position uses actual monitor origin and restores original translation', () => {
    const {actor} = fixture(); actor.translation_y = 5;
    const patch = new OverlayScroll(actor);
    patch.position({y: 200, height: 300}, 20);
    assert.equal(actor.translation_y, -70);
    patch.position({y: 200, height: 300}, 20);
    assert.equal(actor.translation_y, -70);
    patch.destroy(); assert.equal(actor.translation_y, 5);
});
test('destruction callback drops references without touching destroyed actor children', () => {
    const {actor} = fixture(), patch = new OverlayScroll(actor), effect = patch.clip;
    actor.get_children = actor.remove_child = actor.insert_child_at_index = () => {throw Error('disposed actor access');};
    patch.destroy(true); patch.destroy();
    assert.equal(patch.actor, null); assert.equal(effect.box, null);
});
test('nested scroll handoff respects direction and zero range', () => {
    const a = {lower: 0, upper: 1000, page_size: 100, value: 0};
    assert.equal(canScroll(a, -1), false); assert.equal(canScroll(a, 1), true);
    a.value = 900; assert.equal(canScroll(a, 1), false); assert.equal(canScroll(a, -1), true);
    a.upper = 90; a.value = 0; assert.equal(canScroll(a, 1), false);
    assert.equal(canScroll(a, 0), false);
});
test('wheel direction includes smooth scrolling, excludes horizontal', () => {
    const event = (direction, delta) => ({get_scroll_direction: () => direction, get_scroll_delta: () => [0, delta]});
    assert.equal(scrollDelta(event(0, -0.25)), -0.25);
    assert.equal(scrollDelta(event(1)), -1); assert.equal(scrollDelta(event(2)), 1);
    assert.equal(scrollDelta(event(3)), 0);
});

test('large events are capped at half a viewport without changing ordinary deltas', () => {
    assert.equal(boundedDelta(400, 1), 1);
    for (const delta of [-1000, 1000])
        assert.ok(Math.abs(boundedDelta(400, delta) * Math.pow(400, 2 / 3)) <= 200);
    assert.equal(boundedDelta(0, 1), 0);
    assert.equal(boundedDelta(400, NaN), 0);
});
